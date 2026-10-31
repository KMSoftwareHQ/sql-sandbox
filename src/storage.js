import { normalizeEngineName, sanitizeTabName } from './session-file.js';

const SESSION_KEY = 'sql-sandbox:session';
const THEME_KEY = 'sql-sandbox:theme';

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

export function saveSession({ engine, tabs, activeTabIndex }) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ engine, tabs, activeTabIndex }));
  } catch {
    // Storage may be full or disabled; the sandbox still works without autosave.
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
