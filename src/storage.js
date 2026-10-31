import { normalizeEngineName, sanitizeTabName } from './session-file.js';

const SESSION_KEY = 'sql-sandbox:session';
const THEME_KEY = 'sql-sandbox:theme';
// Set once the user has built a database, cleared when it is reset. A reload rebuilds only if set.
const DATABASE_BUILT_KEY = 'sql-sandbox:database-built';
// Set while SQL runs, cleared when any run finishes. Still set on load means the last run never
// finished (the page froze, or was reloaded or closed mid-run), so the automatic rebuild is skipped.
// Kept in localStorage so it survives closing a frozen tab. Shared by all browser tabs: the worst
// case is a needless "not rebuilt" notice while another tab is mid-run.
const RUN_IN_PROGRESS_KEY = 'sql-sandbox:run-in-progress';

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

export function wasDatabaseBuilt() {
  try {
    return localStorage.getItem(DATABASE_BUILT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDatabaseBuilt(isBuilt) {
  try {
    if (isBuilt) localStorage.setItem(DATABASE_BUILT_KEY, '1');
    else localStorage.removeItem(DATABASE_BUILT_KEY);
  } catch {
    // Storage unavailable: the database just will not be rebuilt on reload.
  }
}

export function wasLastRunInterrupted() {
  try {
    return localStorage.getItem(RUN_IN_PROGRESS_KEY) !== null;
  } catch {
    return false;
  }
}

export function markRunStarted() {
  try {
    localStorage.setItem(RUN_IN_PROGRESS_KEY, '1');
  } catch {
    // Storage unavailable: no freeze guard, the run still happens.
  }
}

export function markRunFinished() {
  try {
    localStorage.removeItem(RUN_IN_PROGRESS_KEY);
  } catch {
    // Nothing to clear.
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
