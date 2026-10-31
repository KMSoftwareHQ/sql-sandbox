import { normalizeEngineName } from '../session-file.js';

// Engine modules are imported on demand so the initial bundle stays small.
const ENGINE_LOADERS = {
  sqlite: async () => {
    const [{ createSqliteSession }, wasmUrlModule] = await Promise.all([
      import('./sqlite.js'),
      import('sql.js/dist/sql-wasm.wasm?url'),
    ]);
    return () => createSqliteSession({ wasmLocation: wasmUrlModule.default });
  },
  postgres: async () => {
    const { createPostgresSession } = await import('./postgres.js');
    return createPostgresSession;
  },
};

const loadedSessionFactories = new Map();

function loadSessionFactory(engineName) {
  if (!loadedSessionFactories.has(engineName)) {
    const factoryPromise = ENGINE_LOADERS[engineName]();
    loadedSessionFactories.set(engineName, factoryPromise);
    factoryPromise.catch(() => loadedSessionFactories.delete(engineName));
  }
  return loadedSessionFactories.get(engineName);
}

export function isEngineLoaded(engineName) {
  return loadedSessionFactories.has(normalizeEngineName(engineName));
}

// Creates a persistent database session for the engine.
// Session API:
//   execute(sqlText) -> { resultSets, error, elapsedMs }
//     resultSets items: { kind: 'rows', columns, rows } | { kind: 'status', message }
//     error: null | { message }
//   listSchema() -> [{ name, tables: [{ name, columns: [{ name, type, isPrimaryKey }] }] }]
//   close()
export async function createEngineSession(engineName) {
  const normalizedName = normalizeEngineName(engineName);
  const loader = ENGINE_LOADERS[normalizedName] ? normalizedName : 'sqlite';
  const createSession = await loadSessionFactory(loader);
  return createSession();
}
