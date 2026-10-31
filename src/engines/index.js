import { normalizeEngineName } from '../session-file.js';

// Engine modules are imported on demand so the initial bundle stays small.
const ENGINE_LOADERS = {
  sqlite: async () => {
    const [{ createSqliteSession }, wasmUrlModule] = await Promise.all([
      import('./sqlite.js'),
      import('sql.js/dist/sql-wasm.wasm?url'),
    ]);
    return (snapshot) => createSqliteSession({ wasmLocation: wasmUrlModule.default, snapshot });
  },
  postgres: async () => {
    const { createPostgresSession } = await import('./postgres.js');
    return (snapshot) => createPostgresSession({ snapshot });
  },
  mysql: async () => {
    if (!window.crossOriginIsolated) {
      throw new Error('MySQL needs cross-origin isolation (COOP/COEP headers), which this server does not send.');
    }
    // Served unmodified from public/vendor (see scripts/copy-vendor-engines.mjs), resolved against
    // the page URL so it works under any subpath.
    const workerModuleUrl = new URL('./vendor/lite4mariadb/worker.mjs', document.baseURI).href;
    const [{ createMysqlSession }, { Lite4MariaDBWorker }] = await Promise.all([
      import('./mysql.js'),
      import(/* @vite-ignore */ workerModuleUrl),
    ]);
    return (snapshot) => createMysqlSession({ createDatabase: (options) => Lite4MariaDBWorker.create(options), snapshot });
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
//   exportSnapshot() -> { bytes: Uint8Array, ... }: a copy of the database to pass back as `snapshot`
//   close()
// snapshot: optional exportSnapshot() result from the same engine, to restore instead of starting empty.
export async function createEngineSession(engineName, { snapshot } = {}) {
  const normalizedName = normalizeEngineName(engineName);
  const loader = ENGINE_LOADERS[normalizedName] ? normalizedName : 'sqlite';
  const createSession = await loadSessionFactory(loader);
  return createSession(snapshot);
}
