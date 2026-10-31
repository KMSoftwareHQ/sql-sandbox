import { PGlite } from '@electric-sql/pglite';
import { OpenTransactionError } from './open-transaction-error.js';
import { groupColumnsBySchema } from './schema-listing.js';

const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

function toResultSet(pgResult) {
  if (pgResult.fields.length > 0) {
    return {
      kind: 'rows',
      columns: pgResult.fields.map((field) => field.name),
      rows: pgResult.rows,
    };
  }
  const affectedRowCount = pgResult.affectedRows ?? 0;
  return {
    kind: 'status',
    message: affectedRowCount > 0 ? `${affectedRowCount} rows affected` : 'OK',
  };
}

const LIST_COLUMNS_SQL = `
SELECT tables.table_schema AS "schemaName",
       tables.table_name AS "tableName",
       columns.column_name AS "columnName",
       columns.data_type AS "columnType",
       EXISTS (
         SELECT 1
         FROM information_schema.table_constraints AS constraints
         JOIN information_schema.key_column_usage AS key_columns
           ON key_columns.constraint_name = constraints.constraint_name
          AND key_columns.table_schema = constraints.table_schema
         WHERE constraints.constraint_type = 'PRIMARY KEY'
           AND constraints.table_schema = tables.table_schema
           AND constraints.table_name = tables.table_name
           AND key_columns.column_name = columns.column_name
       ) AS "isPrimaryKey"
FROM information_schema.tables AS tables
LEFT JOIN information_schema.columns AS columns
  ON columns.table_schema = tables.table_schema AND columns.table_name = tables.table_name
WHERE tables.table_schema <> ALL ($1)
ORDER BY tables.table_schema, tables.table_name, columns.ordinal_position`;

// A persistent PostgreSQL database: state carries over between execute() calls until close().
// snapshot: optional result of exportSnapshot() from an earlier session, to start from.
export async function createPostgresSession({ snapshot } = {}) {
  const database = new PGlite(snapshot ? { loadDataDir: new Blob([snapshot.bytes]) } : {});
  try {
    await database.waitReady;
  } catch (startError) {
    await database.close().catch(() => {});
    throw startError;
  }

  return {
    async execute(sqlText) {
      const startTime = performance.now();
      const resultSets = [];
      let error = null;
      try {
        // PGlite runs the whole script in one call; on error it reports no partial results.
        const queryResults = await database.exec(sqlText, { rowMode: 'array' });
        resultSets.push(...queryResults.map(toResultSet));
      } catch (statementError) {
        error = { message: statementError.message };
      }
      return { resultSets, error, elapsedMs: performance.now() - startTime };
    },

    async listSchema() {
      const { rows } = await database.query(LIST_COLUMNS_SQL, [SYSTEM_SCHEMAS]);
      return groupColumnsBySchema(rows);
    },

    // The write-ahead log position moves on every write (including DDL and nextval) and not on reads.
    async getChangeMarker() {
      return (await database.query('SELECT pg_current_wal_insert_lsn()::text AS position')).rows[0].position;
    },

    // A copy of the data directory.
    async exportSnapshot() {
      // Runs inside the user's transaction if one is open. An aborted transaction rejects every query.
      const hasOpenWriteTransaction = await database
        .query('SELECT pg_current_xact_id_if_assigned() IS NOT NULL AS "isOpen"')
        .then((result) => result.rows[0].isOpen, () => true);
      if (hasOpenWriteTransaction) throw new OpenTransactionError();
      const dataDirectoryArchive = await database.dumpDataDir();
      return { bytes: new Uint8Array(await dataDirectoryArchive.arrayBuffer()) };
    },

    async close() {
      await database.close().catch(() => {});
    },
  };
}
