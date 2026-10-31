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

// Runs every statement in the script. Returns one result set per statement:
// rows for statements that produce columns, a status message otherwise.
// Results gathered before an error are kept so the learner still sees them.
function runScript(database, sqlText, collectedResultSets) {
  for (const statement of database.iterateStatements(sqlText)) {
    const columnNames = statement.getColumnNames();
    if (columnNames.length > 0) {
      const rows = [];
      while (statement.step()) {
        rows.push(statement.get());
      }
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

export async function runSqlite(schemaSql, querySql, { wasmLocation } = {}) {
  const SQL = await loadSqlJs(wasmLocation);
  const startTime = performance.now();
  const database = new SQL.Database();
  const resultSets = [];
  let error = null;

  try {
    try {
      // Schema results are not shown, only the query results.
      runScript(database, schemaSql, []);
    } catch (schemaError) {
      error = { phase: 'schema', message: schemaError.message };
    }

    if (!error) {
      try {
        runScript(database, querySql, resultSets);
      } catch (queryError) {
        error = { phase: 'query', message: queryError.message };
      }
    }
  } finally {
    database.close();
  }

  return { resultSets, error, elapsedMs: performance.now() - startTime };
}
