import { PGlite } from '@electric-sql/pglite';
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
export async function createPostgresSession() {
  const database = new PGlite();
  await database.waitReady;

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

    async close() {
      await database.close().catch(() => {});
    },
  };
}
