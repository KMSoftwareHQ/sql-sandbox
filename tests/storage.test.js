import { beforeEach, describe, expect, it } from 'vitest';
import { finishRestoreAttempt, loadSavedSession, removeRetiredKeys, saveSession, startRestoreAttempt } from '../src/storage.js';

function installMemoryLocalStorage() {
  const storedValues = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storedValues.has(key) ? storedValues.get(key) : null),
    setItem: (key, value) => storedValues.set(key, String(value)),
    removeItem: (key) => storedValues.delete(key),
  };
}

describe('session storage', () => {
  beforeEach(installMemoryLocalStorage);

  it('round-trips tabs and the active tab', () => {
    const session = { engine: 'postgres', tabs: [{ name: 'a.sql', sql: 'A;' }, { name: 'b.sql', sql: 'B;' }], activeTabIndex: 1 };
    saveSession(session);
    expect(loadSavedSession()).toEqual(session);
  });

  it('converts the v0.2–v0.3 schema/query shape into two tabs', () => {
    localStorage.setItem('sql-sandbox:session', JSON.stringify({ engine: 'sqlite', schemaSql: 'S;', querySql: 'Q;' }));
    expect(loadSavedSession()).toEqual({
      engine: 'sqlite',
      tabs: [{ name: 'schema.sql', sql: 'S;' }, { name: 'query.sql', sql: 'Q;' }],
      activeTabIndex: 0,
    });
  });

  it('reports failure when the browser refuses to store the session', () => {
    globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(saveSession({ engine: 'sqlite', tabs: [], activeTabIndex: 0 })).toBe(false);
  });

  it('clamps an out-of-range active tab and ignores corrupt data', () => {
    localStorage.setItem('sql-sandbox:session', JSON.stringify({ engine: 'sqlite', tabs: [{ name: 'a.sql', sql: '' }], activeTabIndex: 7 }));
    expect(loadSavedSession().activeTabIndex).toBe(0);
    localStorage.setItem('sql-sandbox:session', '{not json');
    expect(loadSavedSession()).toBeNull();
  });
});

describe('retired keys', () => {
  beforeEach(installMemoryLocalStorage);

  it('removes the v0.4.1 replay keys and keeps the session', () => {
    saveSession({ engine: 'sqlite', tabs: [{ name: 'a.sql', sql: 'A;' }], activeTabIndex: 0 });
    localStorage.setItem('sql-sandbox:database-built', '1');
    localStorage.setItem('sql-sandbox:run-in-progress', '1');
    removeRetiredKeys();
    expect(localStorage.getItem('sql-sandbox:database-built')).toBeNull();
    expect(localStorage.getItem('sql-sandbox:run-in-progress')).toBeNull();
    expect(loadSavedSession().tabs).toEqual([{ name: 'a.sql', sql: 'A;' }]);
  });
});

describe('restore attempts', () => {
  beforeEach(installMemoryLocalStorage);

  it('counts restores that never finished and resets when one finishes', () => {
    expect(startRestoreAttempt()).toBe(0);
    expect(startRestoreAttempt()).toBe(1);
    expect(startRestoreAttempt()).toBe(2);
    finishRestoreAttempt();
    expect(startRestoreAttempt()).toBe(0);
  });
});
