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
    const workerEntryUrl = new URL('./vendor/lite4mariadb/worker-entry.mjs', document.baseURI);
    // Our own Worker, so it can be terminated if opening the database fails (lite4mariadb leaves it running).
    const createDatabase = async (options) => {
      const worker = new Worker(workerEntryUrl, { type: 'module' });
      try {
        return await Lite4MariaDBWorker.create(options, worker);
      } catch (createError) {
        worker.terminate();
        throw createError;
      }
    };
    return (snapshot) => createMysqlSession({ createDatabase, snapshot });
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
//   getChangeMarker() -> string that changes whenever data or schema change (reads leave it alone)
//   exportSnapshot() -> { bytes: Uint8Array, ... }: a copy of the database to pass back as `snapshot`;
//     throws OpenTransactionError while a write transaction is open
//   close()
// snapshot: optional exportSnapshot() result from the same engine, to restore instead of starting empty.
export async function createEngineSession(engineName, { snapshot } = {}) {
  const normalizedName = normalizeEngineName(engineName);
  const loader = ENGINE_LOADERS[normalizedName] ? normalizedName : 'sqlite';
  const createSession = await loadSessionFactory(loader);
  // Only restores can hang (see startWithTimeout); a fresh start fails on its own.
  return snapshot ? startWithTimeout(createSession(snapshot)) : createSession(snapshot);
}

// PGlite never settles when its wasm download fails while loading a data directory, which would lock
// the controls forever. Generous enough for a slow first download of the largest engine (~17 MB).
const RESTORE_TIMEOUT_MS = 180_000;

function startWithTimeout(sessionPromise) {
  let timerId;
  const timeout = new Promise((resolve, reject) => {
    timerId = setTimeout(() => {
      reject(new Error('restoring did not finish in time; the engine may still be downloading'));
      // If it does start later, nobody is using it.
      sessionPromise.then((lateSession) => lateSession.close()).catch(() => {});
    }, RESTORE_TIMEOUT_MS);
  });
  return Promise.race([sessionPromise, timeout]).finally(() => clearTimeout(timerId));
}
