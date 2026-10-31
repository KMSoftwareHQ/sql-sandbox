import { normalizeEngineName } from '../session-file.js';

const loadedEngines = new Map();

// Engines are imported on demand so the initial bundle stays small.
function loadEngine(engineName) {
  if (!loadedEngines.has(engineName)) {
    const enginePromise =
      engineName === 'postgres'
        ? import('./postgres.js').then((module) => ({ run: module.runPostgres }))
        : Promise.all([import('./sqlite.js'), import('sql.js/dist/sql-wasm.wasm?url')]).then(
            ([module, wasmUrlModule]) => ({
              run: (schemaSql, querySql) =>
                module.runSqlite(schemaSql, querySql, { wasmLocation: wasmUrlModule.default }),
            }),
          );
    loadedEngines.set(engineName, enginePromise);
    enginePromise.catch(() => loadedEngines.delete(engineName));
  }
  return loadedEngines.get(engineName);
}

export function isEngineLoaded(engineName) {
  return loadedEngines.has(normalizeEngineName(engineName));
}

// Returns { resultSets, error, elapsedMs }.
// resultSets items: { kind: 'rows', columns, rows } or { kind: 'status', message }.
// error: null or { phase: 'schema' | 'query' | 'engine', message }.
export async function runFiddle(engineName, schemaSql, querySql) {
  const startTime = performance.now();
  let engine;
  try {
    engine = await loadEngine(normalizeEngineName(engineName));
  } catch (loadError) {
    return {
      resultSets: [],
      error: { phase: 'engine', message: `Could not load the database engine: ${loadError.message}` },
      elapsedMs: performance.now() - startTime,
    };
  }
  try {
    return await engine.run(schemaSql, querySql);
  } catch (unexpectedError) {
    return {
      resultSets: [],
      error: { phase: 'engine', message: unexpectedError.message },
      elapsedMs: performance.now() - startTime,
    };
  }
}
