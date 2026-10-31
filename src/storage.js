import { normalizeEngineName, sanitizeTabName } from './session-file.js';

const SESSION_KEY = 'sql-sandbox:session';
const THEME_KEY = 'sql-sandbox:theme';
// Counts database restores that started but never finished (e.g. the page ran out of memory).
const UNFINISHED_RESTORES_KEY = 'sql-sandbox:unfinished-restores';
// Keys used by v0.4.1 to replay tabs on reload; replaced by database snapshots (database-snapshot-store.js).
const RETIRED_KEYS = ['sql-sandbox:database-built', 'sql-sandbox:run-in-progress'];

// Saved shape: { engine, tabs: [{ name, sql }], activeTabIndex }.
// v0.2–v0.3 saved { engine, schemaSql, querySql }; that shape is converted to two tabs.
export function loadSavedSession() {
  try {
    const savedText = localStorage.getItem(SESSION_KEY);
    if (!savedText) return null;
    const savedSession = JSON.parse(savedText);
    const engine = normalizeEngineName(savedSession?.engine);

    if (Array.isArray(savedSession?.tabs)) {
      const tabs = savedSession.tabs
        .filter((tab) => typeof tab?.sql === 'string')
        .map((tab, tabIndex) => ({ name: sanitizeTabName(tab.name, `script-${tabIndex + 1}.sql`), sql: tab.sql }));
      if (tabs.length === 0) return null;
      const savedIndex = Number.isInteger(savedSession.activeTabIndex) ? savedSession.activeTabIndex : 0;
      return { engine, tabs, activeTabIndex: Math.min(Math.max(savedIndex, 0), tabs.length - 1) };
    }

    if (typeof savedSession?.schemaSql === 'string' && typeof savedSession?.querySql === 'string') {
      return {
        engine,
        tabs: [
          { name: 'schema.sql', sql: savedSession.schemaSql },
          { name: 'query.sql', sql: savedSession.querySql },
        ],
        activeTabIndex: 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Returns false when the browser refused to store it (storage full or disabled).
export function saveSession({ engine, tabs, activeTabIndex }) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ engine, tabs, activeTabIndex }));
    return true;
  } catch {
    return false;
  }
}

export function isSavedSessionKey(storageKey) {
  return storageKey === SESSION_KEY;
}

// Returns how many earlier restores never finished, and counts this one until finishRestoreAttempt().
export function startRestoreAttempt() {
  try {
    const unfinishedRestores = Number(localStorage.getItem(UNFINISHED_RESTORES_KEY)) || 0;
    localStorage.setItem(UNFINISHED_RESTORES_KEY, String(unfinishedRestores + 1));
    return unfinishedRestores;
  } catch {
    return 0;
  }
}

export function finishRestoreAttempt() {
  try {
    localStorage.removeItem(UNFINISHED_RESTORES_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function removeRetiredKeys() {
  try {
    for (const retiredKey of RETIRED_KEYS) localStorage.removeItem(retiredKey);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

export function loadSavedTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : null;
  } catch {
    return null;
  }
}

export function saveTheme(themeName) {
  try {
    localStorage.setItem(THEME_KEY, themeName);
  } catch {
    // Ignore: theme just will not persist.
  }
}

export function createDebouncedFunction(callback, delayMs) {
  let timerId = null;
  return (...callbackArguments) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => callback(...callbackArguments), delayMs);
  };
}
