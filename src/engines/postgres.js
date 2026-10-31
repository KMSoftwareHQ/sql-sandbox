import { PGlite } from '@electric-sql/pglite';

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

export async function runPostgres(schemaSql, querySql) {
  const startTime = performance.now();
  const database = new PGlite();
  const resultSets = [];
  let error = null;

  try {
    await database.waitReady;
    try {
      await database.exec(schemaSql, { rowMode: 'array' });
    } catch (schemaError) {
      error = { phase: 'schema', message: schemaError.message };
    }

    if (!error) {
      try {
        const queryResults = await database.exec(querySql, { rowMode: 'array' });
        resultSets.push(...queryResults.map(toResultSet));
      } catch (queryError) {
        error = { phase: 'query', message: queryError.message };
      }
    }
  } finally {
    await database.close().catch(() => {});
  }

  return { resultSets, error, elapsedMs: performance.now() - startTime };
}
