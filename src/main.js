import './styles.css';
import { createSqlEditor } from './editors.js';
import { createEngineSession, isEngineLoaded } from './engines/index.js';
import { OpenTransactionError } from './engines/open-transaction-error.js';
import { EXAMPLE_SESSION } from './example.js';
import { formatElapsedTime, renderLoading, renderNotice, renderResults } from './results-view.js';
import { createSchemaBrowser } from './schema-browser.js';
import { buildSessionFilename, normalizeEngineName, parseSession, serializeSession } from './session-file.js';
import { clearDatabaseSnapshot, loadDatabaseSnapshot, loadSnapshotOwner, saveDatabaseSnapshot } from './database-snapshot-store.js';
import {
  createDebouncedFunction,
  finishRestoreAttempt,
  isSavedSessionKey,
  loadSavedSession,
  removeRetiredKeys,
  saveSession,
  startRestoreAttempt,
} from './storage.js';
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
const autosaveWarning = document.getElementById('autosave-warning');
const databaseSaveWarning = document.getElementById('database-save-warning');
const otherTabWarning = document.getElementById('other-tab-warning');

const EMPTY_DATABASE_MESSAGE = 'The database is empty. Run your scripts (Run all) to build it.';
// After this many restores in a row that never finished, the next load skips restoring so the page stays usable.
const MAX_UNFINISHED_RESTORES = 2;
// Identifies this page among browser tabs that share the saved session and database.
const PAGE_ID = crypto.randomUUID();
// Tells other tabs when this one saves or deletes the database. Local to the browser, no network.
const tabChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('sql-sandbox') : null;

let currentTheme = resolveInitialTheme();
applyTheme(currentTheme);

removeRetiredKeys();
const savedSession = loadSavedSession();
const initialSession = savedSession ?? EXAMPLE_SESSION;
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
  const saved = saveSession({ engine: engineSelect.value, ...tabManager.getSnapshot() });
  autosaveWarning.hidden = saved;
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
// or loading a session file. After each run a snapshot is saved in IndexedDB; a reload restores it.

let databaseSessionPromise = null;
let isBusy = false;
// The last successful save by this page: { changeMarker, savedAt }. A run that leaves the marker
// unchanged is not saved again, as long as the stored snapshot is still this save.
let lastSave = null;

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

// Every operation that touches the database goes through here, so only one runs at a time and
// multi-step operations (reset then replay) cannot be interleaved with a click or shortcut.
async function runExclusively(operation) {
  if (isBusy) return;
  setControlsBusy(true);
  try {
    await operation();
  } finally {
    setControlsBusy(false);
  }
}

// Runs scripts one after another against the live database, stopping at the first error.
// scripts: [{ title, sql }]. Call only inside runExclusively.
async function executeScripts(scripts) {
  elapsedTimeLabel.textContent = '';
  renderLoading(resultsContainer, isEngineLoaded(engineSelect.value) ? 'Running…' : 'Loading engine…');
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
  const executedLabel = `Executed in ${formatElapsedTime(totalElapsedMs)}`;
  elapsedTimeLabel.textContent = executedLabel;
  await refreshSchemaBrowser(databaseSession);
  elapsedTimeLabel.textContent = `${executedLabel} · saving database…`;
  await saveDatabase(databaseSession);
  elapsedTimeLabel.textContent = executedLabel;
}

// True when the stored snapshot is still this page's last save and the database has not changed since.
async function isSavedSnapshotCurrent(databaseSession) {
  if (!lastSave) return false;
  // A failed marker read (e.g. inside an aborted transaction) means "unknown", so save.
  const changeMarker = await databaseSession.getChangeMarker().catch(() => null);
  if (changeMarker === null || changeMarker !== lastSave.changeMarker) return false;
  const owner = await loadSnapshotOwner();
  return owner?.pageId === PAGE_ID && owner.savedAt === lastSave.savedAt;
}

// Saves a snapshot of the live database so a reload restores it. Call only inside runExclusively,
// so a snapshot is never taken in the middle of a run.
async function saveDatabase(databaseSession) {
  try {
    if (await isSavedSnapshotCurrent(databaseSession)) return;
    const snapshot = await databaseSession.exportSnapshot();
    // Read after exporting, which itself moves some engine counters.
    const changeMarker = await databaseSession.getChangeMarker().catch(() => null);
    const owner = await saveDatabaseSnapshot(engineSelect.value, snapshot, PAGE_ID);
    lastSave = { changeMarker, savedAt: owner.savedAt };
    tabChannel?.postMessage('database-saved');
    databaseSaveWarning.hidden = true;
  } catch (saveError) {
    // The previous snapshot is kept. Forget the last save so the next run tries again.
    lastSave = null;
    databaseSaveWarning.textContent = saveError instanceof OpenTransactionError
      ? 'Database not saved: finish the open transaction (COMMIT or ROLLBACK) and run again to save it.'
      : `Database not saved (${saveError?.message ?? 'unknown error'}). Your tabs are still saved.`;
    databaseSaveWarning.hidden = false;
  }
}

// Restores the snapshot saved after the last run. Call only inside runExclusively.
// A snapshot is never deleted here: a failure may be a network problem, so the user decides
// (reload to retry, or Reset database to discard it).
async function restoreSavedDatabase() {
  const savedDatabase = await loadDatabaseSnapshot();
  if (!savedDatabase) return;
  // Without saved tabs (storage cleared) the page shows the example; don't pair it with an old
  // database. A snapshot of another engine is left over from an interrupted engine switch.
  if (!savedSession || savedDatabase.engine !== engineSelect.value) {
    await clearDatabaseSnapshot();
    return;
  }
  // A restore that crashes the page (e.g. out of memory) would otherwise repeat on every load.
  if (startRestoreAttempt() >= MAX_UNFINISHED_RESTORES) {
    finishRestoreAttempt();
    renderNotice(resultsContainer, 'Your saved database was not restored this time, because restoring it did not finish the last two times (the page was closed, or it ran out of memory). Reload to try again, or press Reset database to discard it.');
    return;
  }
  renderLoading(resultsContainer, 'Restoring your database…');
  try {
    databaseSessionPromise = createEngineSession(engineSelect.value, { snapshot: savedDatabase.snapshot });
    const databaseSession = await databaseSessionPromise;
    // Reading the schema also proves the restored database is usable.
    schemaBrowser.render(await databaseSession.listSchema());
    renderNotice(resultsContainer, 'Database restored from your last visit. Temporary tables and most session settings (SET, PRAGMA) are not kept.');
    // lastSave stays null: the snapshot belongs to an earlier page, so the next run saves it as this page's.
  } catch (restoreError) {
    await closeDatabaseSession();
    renderNotice(resultsContainer, `Your saved database could not be restored (${restoreError.message}). It is kept: reload to try again, or press Reset database to discard it. Running SQL now starts a new, empty database that replaces it.`);
  } finally {
    finishRestoreAttempt();
  }
}

function allTabScripts() {
  return tabManager.getSnapshot().tabs.map((tab) => ({ title: tab.name, sql: tab.sql }));
}

function runSelectionOrActiveTab() {
  const selectedText = editor.getSelectedText();
  const activeTabName = tabManager.getActiveTabName();
  const script = selectedText.trim()
    ? { title: `${activeTabName} (selection)`, sql: selectedText }
    : { title: activeTabName, sql: editor.getText() };
  return runExclusively(() => executeScripts([script]));
}

function runAllTabs() {
  return runExclusively(() => executeScripts(allTabScripts()));
}

// Call only inside runExclusively.
async function resetDatabase(noticeMessage) {
  await closeDatabaseSession();
  await clearDatabaseSnapshot();
  lastSave = null;
  tabChannel?.postMessage('database-cleared');
  databaseSaveWarning.hidden = true;
  schemaBrowser.reset();
  schemaBrowser.showMessage(EMPTY_DATABASE_MESSAGE);
  elapsedTimeLabel.textContent = '';
  renderNotice(resultsContainer, noticeMessage);
}

// --- Sessions and files ------------------------------------------------------------------------

// Replaces the tabs, resets the database and optionally replays every tab. Call only inside runExclusively.
async function loadSession({ engine, tabs, activeTabIndex = 0 }, { replay }) {
  const engineName = normalizeEngineName(engine);
  engineSelect.value = engineName;
  editor.setEngine(engineName);
  tabManager.replaceTabs(tabs, activeTabIndex);
  saveCurrentSession();
  await resetDatabase('Database reset.');
  if (replay) await executeScripts(allTabScripts());
}

// Call only inside runExclusively.
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

engineSelect.addEventListener('change', () => {
  editor.setEngine(engineSelect.value);
  saveCurrentSession();
  const engineLabel = engineSelect.options[engineSelect.selectedIndex].text;
  runExclusively(() => resetDatabase(`Switched to ${engineLabel}. The database is empty; run your scripts to rebuild it.`));
});

runButton.addEventListener('click', runSelectionOrActiveTab);
runAllButton.addEventListener('click', runAllTabs);
resetDatabaseButton.addEventListener('click', () => {
  if (isBusy) return;
  if (!window.confirm('Reset the database? All tables and data are dropped. Your tabs are kept.')) return;
  runExclusively(() => resetDatabase('Database reset. It is empty now.'));
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
  if (selectedFiles.length > 0) await runExclusively(() => openFiles(selectedFiles));
});

newSessionButton.addEventListener('click', () => {
  if (isBusy) return;
  if (!window.confirm('Start a new session? Your tabs are replaced by the example and the database is reset.')) return;
  runExclusively(() => loadSession({ ...EXAMPLE_SESSION, engine: engineSelect.value }, { replay: false }));
});

themeButton.addEventListener('click', () => {
  currentTheme = oppositeTheme(currentTheme);
  applyTheme(currentTheme);
  persistTheme(currentTheme);
  editor.setTheme(currentTheme);
  updateThemeButtonLabel();
});

// Another tab writing the session means both tabs share one saved session and database.
window.addEventListener('storage', (event) => {
  if (isSavedSessionKey(event.key)) otherTabWarning.hidden = false;
});
tabChannel?.addEventListener('message', () => { otherTabWarning.hidden = false; });

// Persist the latest edits if the tab is closed before the debounced autosave fires.
window.addEventListener('pagehide', saveCurrentSession);

updateThemeButtonLabel();

runExclusively(restoreSavedDatabase);
