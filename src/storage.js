import { normalizeEngineName } from './session-file.js';

const SESSION_KEY = 'db-fiddle:session';
const THEME_KEY = 'db-fiddle:theme';

export function loadSavedSession() {
  try {
    const savedText = localStorage.getItem(SESSION_KEY);
    if (!savedText) return null;
    const savedSession = JSON.parse(savedText);
    if (typeof savedSession?.schemaSql !== 'string' || typeof savedSession?.querySql !== 'string') {
      return null;
    }
    return {
      engine: normalizeEngineName(savedSession.engine),
      schemaSql: savedSession.schemaSql,
      querySql: savedSession.querySql,
    };
  } catch {
    return null;
  }
}

export function saveSession({ engine, schemaSql, querySql }) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ engine, schemaSql, querySql }));
  } catch {
    // Storage may be full or disabled; the fiddle still works without autosave.
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
