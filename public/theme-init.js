// Apply the stored theme before first paint to avoid a flash of the wrong theme.
// Loaded as a separate blocking script (not inline) so the Content Security Policy needs no 'unsafe-inline'.
(function () {
  var storedTheme = null;
  try { storedTheme = localStorage.getItem('sql-sandbox:theme'); } catch (error) {}
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();
