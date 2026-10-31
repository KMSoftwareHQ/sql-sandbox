import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadSavedSession,
  markRunFinished,
  markRunStarted,
  saveSession,
  setDatabaseBuilt,
  wasDatabaseBuilt,
  wasLastRunInterrupted,
} from '../src/storage.js';

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

describe('reload rebuild flags', () => {
  beforeEach(installMemoryLocalStorage);

  it('tracks whether the user has built a database', () => {
    expect(wasDatabaseBuilt()).toBe(false);
    setDatabaseBuilt(true);
    expect(wasDatabaseBuilt()).toBe(true);
    setDatabaseBuilt(false);
    expect(wasDatabaseBuilt()).toBe(false);
  });

  it('reports an interrupted run only between start and finish', () => {
    expect(wasLastRunInterrupted()).toBe(false);
    markRunStarted();
    expect(wasLastRunInterrupted()).toBe(true);
    markRunFinished();
    expect(wasLastRunInterrupted()).toBe(false);
  });
});
