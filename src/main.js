import './styles.css';
import { createSqlEditor } from './editors.js';
import { createEngineSession, isEngineLoaded } from './engines/index.js';
import { EXAMPLE_SESSION } from './example.js';
import { formatElapsedTime, renderLoading, renderNotice, renderResults } from './results-view.js';
import { createSchemaBrowser } from './schema-browser.js';
import { buildSessionFilename, normalizeEngineName, parseSession, serializeSession } from './session-file.js';
import { createDebouncedFunction, loadSavedSession, saveSession } from './storage.js';
import { createTabManager } from './tabs.js';
import { applyTheme, oppositeTheme, persistTheme, resolveInitialTheme } from './theme.js';

const engineSelect = document.getElementById('engine-select');
const runButton = document.getElementById('run-button');
const runAllButton = document.getElementById('run-all-button');
const resetDatabaseButton = document.getElementById('reset-database-button');
const downloadButton = document.getElementById('download-button');
const openButton = document.getElementById('open-button');
const openInput = document.getElementById('open-input');
const newSessionButton = document.getElementById('new-session-button');
const themeButton = document.getElementById('theme-button');
const resultsContainer = document.getElementById('results');
const elapsedTimeLabel = document.getElementById('elapsed-time');

const EMPTY_DATABASE_MESSAGE = 'The database is empty. Run your scripts (Run all) to build it.';

let currentTheme = resolveInitialTheme();
applyTheme(currentTheme);

const initialSession = loadSavedSession() ?? EXAMPLE_SESSION;
engineSelect.value = normalizeEngineName(initialSession.engine);

const autosave = createDebouncedFunction(saveCurrentSession, 400);

const editor = createSqlEditor({
  parent: document.getElementById('editor'),
  themeName: currentTheme,
  engineName: engineSelect.value,
  onChange: autosave,
  onRun: runSelectionOrActiveTab,
});
const tabManager = createTabManager({ container: document.getElementById('tab-bar'), editor, onChange: autosave });
tabManager.replaceTabs(initialSession.tabs, initialSession.activeTabIndex);

const schemaBrowser = createSchemaBrowser({
  container: document.getElementById('schema-browser'),
  onTableDoubleClick: (databaseName, tableName) => editor.insertTextAtCursor(buildSelectStatement(databaseName, tableName)),
});
schemaBrowser.showMessage(EMPTY_DATABASE_MESSAGE);

function saveCurrentSession() {
  saveSession({ engine: engineSelect.value, ...tabManager.getSnapshot() });
}

function buildSelectStatement(databaseName, tableName) {
  const quote = engineSelect.value === 'mysql'
    ? (identifier) => `\`${identifier.replaceAll('`', '``')}\``
    : (identifier) => `"${identifier.replaceAll('"', '""')}"`;
  const qualifiedName = engineSelect.value === 'sqlite' ? quote(tableName) : `${quote(databaseName)}.${quote(tableName)}`;
  return `SELECT * FROM ${qualifiedName} LIMIT 100;\n`;
}

// --- Database session -------------------------------------------------------------------------
// One live database per page. It persists between runs until Reset database, an engine change,
// or loading a session file. It is never saved: reloading the page starts with an empty database.

let databaseSessionPromise = null;
let isBusy = false;

function getDatabaseSession() {
  if (!databaseSessionPromise) {
    databaseSessionPromise = createEngineSession(engineSelect.value);
    databaseSessionPromise.catch(() => { databaseSessionPromise = null; });
  }
  return databaseSessionPromise;
}

async function closeDatabaseSession() {
  const sessionPromise = databaseSessionPromise;
  databaseSessionPromise = null;
  if (!sessionPromise) return;
  try {
    const databaseSession = await sessionPromise;
    await databaseSession.close();
  } catch {
    // The session never started or is already gone; nothing to close.
  }
}

async function refreshSchemaBrowser(databaseSession) {
  try {
    schemaBrowser.render(await databaseSession.listSchema());
  } catch (listError) {
    schemaBrowser.showMessage(`Could not read the schema: ${listError.message}`);
  }
}

function setControlsBusy(busy) {
  isBusy = busy;
  for (const button of [runButton, runAllButton, resetDatabaseButton, openButton, newSessionButton]) button.disabled = busy;
  engineSelect.disabled = busy;
}

// Runs scripts one after another against the live database, stopping at the first error.
// scripts: [{ title, sql }].
async function runScripts(scripts) {
  if (isBusy) return;
  setControlsBusy(true);
  elapsedTimeLabel.textContent = '';
  renderLoading(resultsContainer, isEngineLoaded(engineSelect.value) ? 'Running…' : 'Loading engine…');
  try {
    let databaseSession;
    try {
      databaseSession = await getDatabaseSession();
    } catch (engineError) {
      renderResults(resultsContainer, [{ title: '', resultSets: [], error: { message: `Could not load the database engine: ${engineError.message}` } }]);
      return;
    }

    const runs = [];
    let totalElapsedMs = 0;
    for (const script of scripts) {
      const outcome = await databaseSession.execute(script.sql);
      totalElapsedMs += outcome.elapsedMs;
      // A lone script needs no heading unless it failed ("Error in query.sql").
      const showTitle = scripts.length > 1 || outcome.error !== null;
      runs.push({ title: showTitle ? script.title : '', ...outcome });
      if (outcome.error) break;
    }
    renderResults(resultsContainer, runs);
    elapsedTimeLabel.textContent = `Executed in ${formatElapsedTime(totalElapsedMs)}`;
    await refreshSchemaBrowser(databaseSession);
  } finally {
    setControlsBusy(false);
  }
}

function runSelectionOrActiveTab() {
  const selectedText = editor.getSelectedText();
  const activeTabName = tabManager.getActiveTabName();
  if (selectedText.trim()) return runScripts([{ title: `${activeTabName} (selection)`, sql: selectedText }]);
  return runScripts([{ title: activeTabName, sql: editor.getText() }]);
}

function runAllTabs() {
  const { tabs } = tabManager.getSnapshot();
  return runScripts(tabs.map((tab) => ({ title: tab.name, sql: tab.sql })));
}

async function resetDatabase(noticeMessage) {
  await closeDatabaseSession();
  schemaBrowser.reset();
  schemaBrowser.showMessage(EMPTY_DATABASE_MESSAGE);
  elapsedTimeLabel.textContent = '';
  renderNotice(resultsContainer, noticeMessage);
}

// --- Sessions and files ------------------------------------------------------------------------

async function loadSession({ engine, tabs, activeTabIndex = 0 }, { replay }) {
  const engineName = normalizeEngineName(engine);
  engineSelect.value = engineName;
  editor.setEngine(engineName);
  tabManager.replaceTabs(tabs, activeTabIndex);
  saveCurrentSession();
  await resetDatabase('Database reset.');
  if (replay) await runAllTabs();
}

async function openFiles(files) {
  const parsedFiles = await Promise.all(
    [...files].map(async (file) => ({ fileName: file.name, ...parseSession(await file.text(), file.name) })),
  );
  const sessionFiles = parsedFiles.filter((parsedFile) => parsedFile.hasMarkers);
  const plainScripts = parsedFiles.filter((parsedFile) => !parsedFile.hasMarkers);

  if (sessionFiles.length > 1) {
    window.alert('Open one saved session at a time. Plain .sql scripts can be opened together.');
    return;
  }
  if (sessionFiles.length === 1) {
    const replaceMessage = `Open ${sessionFiles[0].fileName}? It replaces your current tabs and rebuilds the database by running every tab.`;
    if (!window.confirm(replaceMessage)) return;
    await loadSession(sessionFiles[0], { replay: true });
  }
  for (const plainScript of plainScripts) tabManager.addTab(plainScript.tabs[0]);
  if (plainScripts.length > 0) {
    renderNotice(resultsContainer, `Opened ${plainScripts.map((plainScript) => plainScript.fileName).join(', ')} as new ${plainScripts.length === 1 ? 'tab' : 'tabs'}. Press Run to execute.`);
  }
}

function downloadSession() {
  const fileBlob = new Blob([serializeSession({ engine: engineSelect.value, ...tabManager.getSnapshot() })], { type: 'application/sql' });
  const downloadUrl = URL.createObjectURL(fileBlob);
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = buildSessionFilename();
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  // Revoking immediately can abort the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function updateThemeButtonLabel() {
  themeButton.textContent = currentTheme === 'dark' ? 'Light theme' : 'Dark theme';
}

// --- Event wiring ------------------------------------------------------------------------------

engineSelect.addEventListener('change', async () => {
  editor.setEngine(engineSelect.value);
  saveCurrentSession();
  const engineLabel = engineSelect.options[engineSelect.selectedIndex].text;
  await resetDatabase(`Switched to ${engineLabel}. The database is empty; run your scripts to rebuild it.`);
});

runButton.addEventListener('click', runSelectionOrActiveTab);
runAllButton.addEventListener('click', runAllTabs);
resetDatabaseButton.addEventListener('click', () => {
  if (isBusy) return;
  if (!window.confirm('Reset the database? All tables and data are dropped. Your tabs are kept.')) return;
  resetDatabase('Database reset. It is empty now.');
});

document.addEventListener('keydown', (event) => {
  // Inside the editor, the CodeMirror keymap already handled the shortcut.
  if (event.defaultPrevented) return;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    runSelectionOrActiveTab();
  }
});

downloadButton.addEventListener('click', downloadSession);
openButton.addEventListener('click', () => openInput.click());
openInput.addEventListener('change', async () => {
  const selectedFiles = [...openInput.files];
  openInput.value = '';
  if (selectedFiles.length > 0 && !isBusy) await openFiles(selectedFiles);
});

newSessionButton.addEventListener('click', () => {
  if (isBusy) return;
  if (!window.confirm('Start a new session? Your tabs are replaced by the example and the database is reset.')) return;
  loadSession({ ...EXAMPLE_SESSION, engine: engineSelect.value }, { replay: false });
});

themeButton.addEventListener('click', () => {
  currentTheme = oppositeTheme(currentTheme);
  applyTheme(currentTheme);
  persistTheme(currentTheme);
  editor.setTheme(currentTheme);
  updateThemeButtonLabel();
});

// Persist the latest edits if the tab is closed before the debounced autosave fires.
window.addEventListener('pagehide', saveCurrentSession);

updateThemeButtonLabel();
