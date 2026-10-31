import initSqlJs from 'sql.js';

let sqlJsPromise = null;

// wasmLocation: URL or file path of sql-wasm.wasm. Omit it in Node, where sql.js finds the file itself.
function loadSqlJs(wasmLocation) {
  if (!sqlJsPromise) {
    const initOptions = wasmLocation ? { locateFile: () => wasmLocation } : {};
    sqlJsPromise = initSqlJs(initOptions);
    sqlJsPromise.catch(() => { sqlJsPromise = null; });
  }
  return sqlJsPromise;
}

function readTotalChanges(database) {
  return database.exec('SELECT total_changes()')[0].values[0][0];
}

// Runs every statement in the script, appending one result set per statement.
// Throws on the first failing statement; result sets gathered before it stay in collectedResultSets.
function runScript(database, sqlText, collectedResultSets) {
  for (const statement of database.iterateStatements(sqlText)) {
    const columnNames = statement.getColumnNames();
    if (columnNames.length > 0) {
      const rows = [];
      while (statement.step()) rows.push(statement.get());
      collectedResultSets.push({ kind: 'rows', columns: columnNames, rows });
    } else {
      // getRowsModified() keeps the previous statement's count after DDL, so compare totals instead.
      const totalChangesBefore = readTotalChanges(database);
      statement.step();
      const affectedRowCount = readTotalChanges(database) - totalChangesBefore;
      collectedResultSets.push({
        kind: 'status',
        message: affectedRowCount > 0 ? `${affectedRowCount} rows affected` : 'OK',
      });
    }
  }
}

// A persistent SQLite database: state carries over between execute() calls until close().
// snapshot: optional result of exportSnapshot() from an earlier session, to start from.
export async function createSqliteSession({ wasmLocation, snapshot } = {}) {
  const SQL = await loadSqlJs(wasmLocation);
  const database = new SQL.Database(snapshot?.bytes);
  if (snapshot) {
    // sql.js opens any bytes without complaint and fails on the first query; check the file now.
    try {
      database.exec('SELECT count(*) FROM sqlite_master');
    } catch (openError) {
      database.close();
      throw openError;
    }
  }

  return {
    async execute(sqlText) {
      const startTime = performance.now();
      const resultSets = [];
      let error = null;
      try {
        runScript(database, sqlText, resultSets);
      } catch (statementError) {
        error = { message: statementError.message };
      }
      return { resultSets, error, elapsedMs: performance.now() - startTime };
    },

    async listSchema() {
      const tableRows = database.exec(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      const tableNames = tableRows.length > 0 ? tableRows[0].values.map(([tableName]) => tableName) : [];
      const tables = tableNames.map((tableName) => {
        const columnRows = database.exec('SELECT name, type, pk FROM pragma_table_info(?)', [tableName]);
        const columns = columnRows.length > 0
          ? columnRows[0].values.map(([columnName, columnType, primaryKeyPosition]) => ({
              name: columnName,
              type: columnType,
              isPrimaryKey: primaryKeyPosition > 0,
            }))
          : [];
        return { name: tableName, columns };
      });
      return [{ name: 'main', tables }];
    },

    // Throws while a write transaction is open (BEGIN without COMMIT), so uncommitted work is never saved.
    async exportSnapshot() {
      return { bytes: database.export() };
    },

    async close() {
      database.close();
    },
  };
}
