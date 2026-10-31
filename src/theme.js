import { loadSavedTheme, saveTheme } from './storage.js';

export function resolveInitialTheme() {
  const savedTheme = loadSavedTheme();
  if (savedTheme) return savedTheme;
  const systemPrefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return systemPrefersDark ? 'dark' : 'light';
}

export function applyTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
}

export function persistTheme(themeName) {
  saveTheme(themeName);
}

export function oppositeTheme(themeName) {
  return themeName === 'dark' ? 'light' : 'dark';
}
