// Saves a copy of the live database in IndexedDB so a reload restores it. localStorage is too small
// (a PostgreSQL snapshot is several MB) and only stores text.
//
// One record: { formatVersion, engine, snapshot, savedAt }. snapshot is whatever the engine's
// exportSnapshot() returned ({ bytes: Uint8Array, ... }). A record that cannot be restored
// (e.g. after an engine upgrade) is discarded by the caller.

const DATABASE_NAME = 'sql-sandbox';
const STORE_NAME = 'database-snapshots';
const RECORD_KEY = 'current';
const FORMAT_VERSION = 1;

function openSnapshotDatabase() {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(DATABASE_NAME, 1);
    openRequest.onupgradeneeded = () => openRequest.result.createObjectStore(STORE_NAME);
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onblocked = () => reject(new Error('Browser storage is busy in another tab.'));
  });
}

// Runs one request in its own transaction and resolves when the transaction has committed.
async function runInStore(mode, makeRequest) {
  const snapshotDatabase = await openSnapshotDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = snapshotDatabase.transaction(STORE_NAME, mode);
      const request = makeRequest(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the database was aborted.'));
    });
  } finally {
    snapshotDatabase.close();
  }
}

export function saveDatabaseSnapshot(engine, snapshot) {
  const record = { formatVersion: FORMAT_VERSION, engine, snapshot, savedAt: Date.now() };
  return runInStore('readwrite', (store) => store.put(record, RECORD_KEY));
}

// Returns { engine, snapshot } or null. Never throws: unreadable storage means nothing to restore.
export async function loadDatabaseSnapshot() {
  try {
    const record = await runInStore('readonly', (store) => store.get(RECORD_KEY));
    const isUsable = record?.formatVersion === FORMAT_VERSION
      && typeof record.engine === 'string'
      && record.snapshot?.bytes instanceof Uint8Array;
    return isUsable ? { engine: record.engine, snapshot: record.snapshot } : null;
  } catch {
    return null;
  }
}

export async function clearDatabaseSnapshot() {
  try {
    await runInStore('readwrite', (store) => store.delete(RECORD_KEY));
  } catch {
    // Nothing stored, or storage unavailable.
  }
}
