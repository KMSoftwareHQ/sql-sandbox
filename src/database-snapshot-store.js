// Saves a copy of the live database in IndexedDB so a reload restores it. localStorage is too small
// (a PostgreSQL snapshot is several MB) and only stores text.
//
// Two records, written together:
// - 'current': { formatVersion, engine, snapshot, savedAt }. snapshot is whatever the engine's
//   exportSnapshot() returned ({ bytes: Uint8Array, ... }).
// - 'current-owner': { pageId, savedAt }, small, so a page can cheaply check that the stored
//   snapshot is still the one it saved (another browser tab may have replaced or deleted it).

const DATABASE_NAME = 'sql-sandbox';
const STORE_NAME = 'database-snapshots';
const RECORD_KEY = 'current';
const OWNER_KEY = 'current-owner';
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

// Runs requests in one transaction and resolves with the last request's result once it has committed.
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

// Returns the saved owner record { pageId, savedAt }.
export async function saveDatabaseSnapshot(engine, snapshot, pageId) {
  const owner = { pageId, savedAt: Date.now() };
  const record = { formatVersion: FORMAT_VERSION, engine, snapshot, savedAt: owner.savedAt };
  await runInStore('readwrite', (store) => {
    store.put(record, RECORD_KEY);
    return store.put(owner, OWNER_KEY);
  });
  return owner;
}

// Returns { pageId, savedAt } of the stored snapshot, or null.
export async function loadSnapshotOwner() {
  try {
    return (await runInStore('readonly', (store) => store.get(OWNER_KEY))) ?? null;
  } catch {
    return null;
  }
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
    await runInStore('readwrite', (store) => {
      store.delete(RECORD_KEY);
      return store.delete(OWNER_KEY);
    });
  } catch {
    // Nothing stored, or storage unavailable.
  }
}
