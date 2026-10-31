import { groupColumnsBySchema } from './schema-listing.js';
import { splitMysqlScript } from './mysql-script-splitter.js';
import { OpenTransactionError } from './open-transaction-error.js';

// MySQL support is provided by MariaDB compiled to WebAssembly (lite4mariadb, GPL-2.0).
// The engine object only needs async exec(sql) and close(); see createMysqlSession below.

const SYSTEM_DATABASES = ['mysql', 'information_schema', 'performance_schema', 'sys'];

const LIST_COLUMNS_SQL = `
SELECT tables.table_schema AS schemaName,
       tables.table_name AS tableName,
       columns.column_name AS columnName,
       columns.column_type AS columnType,
       columns.column_key = 'PRI' AS isPrimaryKey
FROM information_schema.tables AS tables
LEFT JOIN information_schema.columns AS columns
  ON columns.table_schema = tables.table_schema AND columns.table_name = tables.table_name
WHERE tables.table_schema NOT IN (${SYSTEM_DATABASES.map((name) => `'${name}'`).join(', ')})
ORDER BY tables.table_schema, tables.table_name, columns.ordinal_position`;

const LIST_DATABASES_SQL = `
SELECT schema_name AS schemaName
FROM information_schema.schemata
WHERE schema_name NOT IN (${SYSTEM_DATABASES.map((name) => `'${name}'`).join(', ')})
ORDER BY schema_name`;

// Converts one lite4mariadb result into the app's result-set shape.
// lite4mariadb returns rows as objects keyed by column name, so duplicate column names
// (e.g. SELECT a.id, b.id) collapse into one value. We keep one column per distinct name
// and add a warning instead of showing misleading data.
export function toResultSet(mariadbResult) {
  if (!mariadbResult.fields) {
    const affectedRowCount = mariadbResult.affected ?? 0;
    return { kind: 'status', message: affectedRowCount > 0 ? `${affectedRowCount} rows affected` : 'OK' };
  }
  const distinctColumns = [...new Set(mariadbResult.fields)];
  const resultSet = {
    kind: 'rows',
    columns: distinctColumns,
    rows: mariadbResult.rows.map((row) => distinctColumns.map((columnName) => row[columnName] ?? null)),
  };
  if (distinctColumns.length < mariadbResult.fields.length) {
    const duplicateNames = [...new Set(mariadbResult.fields.filter((name, index) => mariadbResult.fields.indexOf(name) !== index))];
    resultSet.warning = `Columns with the same name (${duplicateNames.join(', ')}) were merged. Give them distinct aliases, e.g. SELECT a.id AS a_id, b.id AS b_id.`;
  }
  return resultSet;
}

// The in-browser MariaDB build has no mysql.proc table and no event scheduler. Explain that
// instead of showing the raw server message.
export function explainEngineLimitation(errorMessage) {
  if (/mysql\.proc/i.test(errorMessage)) {
    return 'Stored procedures and functions are not supported by the in-browser MySQL engine yet. Views, triggers and transactions work.';
  }
  if (/embedded server/i.test(errorMessage)) {
    return 'This statement (for example CREATE EVENT) is not supported by the in-browser MySQL engine.';
  }
  return errorMessage;
}

// Runs once per new database: MariaDB ships an empty `test` database that MySQL does not have,
// and without a selected database a plain CREATE TABLE fails. Scripts can still CREATE/USE their own.
// The InnoDB table created and dropped at the end makes InnoDB write its system files; a snapshot
// (dumpDataDir) taken before InnoDB has written anything cannot be opened again.
const SESSION_SETUP_STATEMENTS = [
  'DROP DATABASE IF EXISTS test',
  'CREATE DATABASE sandbox',
  'USE sandbox',
  'CREATE TABLE sandbox_snapshot_warmup (id INT) ENGINE=InnoDB',
  'DROP TABLE sandbox_snapshot_warmup',
];

const CHANGE_MARKER_SQL = `
SELECT VARIABLE_NAME AS name, VARIABLE_VALUE AS value
FROM information_schema.GLOBAL_STATUS
WHERE VARIABLE_NAME IN ('INNODB_LSN_CURRENT', 'HANDLER_WRITE', 'HANDLER_UPDATE', 'HANDLER_DELETE')
   OR VARIABLE_NAME REGEXP '^COM_(CREATE|DROP|ALTER|RENAME|TRUNCATE)'
ORDER BY VARIABLE_NAME`;

function quoteIdentifier(identifier) {
  return `\`${identifier.replaceAll('`', '``')}\``;
}

// A persistent MariaDB database: state carries over between execute() calls until close().
// createDatabase(options): resolves to a lite4mariadb instance (in the browser, a worker-backed one).
// snapshot: optional result of exportSnapshot() from an earlier session, to start from.
export async function createMysqlSession({ createDatabase, snapshot }) {
  if (snapshot) {
    const database = await createDatabase({ loadDataDir: snapshot.bytes });
    try {
      // Opening a data directory recreates the `test` database; drop it unless the user had one.
      if (!snapshot.hasTestDatabase) await database.exec('DROP DATABASE IF EXISTS test');
      // The data directory does not record the selected database, so select it again.
      if (snapshot.currentDatabase) await database.exec(`USE ${quoteIdentifier(snapshot.currentDatabase)}`);
      // Session settings start at their defaults on a new connection; keep the user's.
      if (snapshot.sessionSettings) {
        await database.exec('SET SESSION sql_mode = ?, foreign_key_checks = ?', [
          snapshot.sessionSettings.sqlMode,
          snapshot.sessionSettings.foreignKeyChecks,
        ]);
      }
    } catch (restoreError) {
      await database.close().catch(() => {});
      throw restoreError;
    }
    return buildSessionApi(database);
  }
  const database = await createDatabase({});
  for (const setupStatement of SESSION_SETUP_STATEMENTS) await database.exec(setupStatement);
  return buildSessionApi(database);
}

function buildSessionApi(database) {
  return {
    async execute(sqlText) {
      const startTime = performance.now();
      const resultSets = [];
      let error = null;
      // Statements run one at a time so earlier results stay visible when a later one fails,
      // and so DELIMITER, a client command the server would reject, is handled here.
      for (const statement of splitMysqlScript(sqlText)) {
        try {
          resultSets.push(toResultSet(await database.exec(statement.sql)));
        } catch (statementError) {
          error = { message: `Line ${statement.line}: ${explainEngineLimitation(statementError.message)}` };
          break;
        }
      }
      return { resultSets, error, elapsedMs: performance.now() - startTime };
    },

    async listSchema() {
      const [databaseRows, columnRows] = await Promise.all([
        database.exec(LIST_DATABASES_SQL),
        database.exec(LIST_COLUMNS_SQL),
      ]);
      const schemasWithTables = groupColumnsBySchema(columnRows.rows);
      // Include databases that exist but have no tables yet (e.g. right after CREATE DATABASE).
      return databaseRows.rows.map(
        ({ schemaName }) => schemasWithTables.find((schema) => schema.name === schemaName) ?? { name: schemaName, tables: [] },
      );
    },

    // Write counters and the InnoDB log position move on every write and DDL (any storage engine),
    // and not on reads. The session state saved with a snapshot is included too.
    async getChangeMarker() {
      const [counters, sessionState] = await Promise.all([
        database.exec(CHANGE_MARKER_SQL),
        database.exec('SELECT DATABASE() AS currentDatabase, @@SESSION.sql_mode AS sqlMode, @@SESSION.foreign_key_checks AS foreignKeyChecks'),
      ]);
      return JSON.stringify([counters.rows, sessionState.rows]);
    },

    async exportSnapshot() {
      const [state] = (await database.exec(`
        SELECT DATABASE() AS currentDatabase,
               EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'test') AS hasTestDatabase,
               @@in_transaction AS inTransaction,
               @@SESSION.sql_mode AS sqlMode,
               @@SESSION.foreign_key_checks AS foreignKeyChecks`)).rows;
      if (Number(state.inTransaction) === 1) throw new OpenTransactionError();
      return {
        bytes: await database.dumpDataDir(),
        currentDatabase: state.currentDatabase,
        hasTestDatabase: Boolean(Number(state.hasTestDatabase)),
        sessionSettings: { sqlMode: state.sqlMode, foreignKeyChecks: Number(state.foreignKeyChecks) },
      };
    },

    async close() {
      await database.close();
    },
  };
}
