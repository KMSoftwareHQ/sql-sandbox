import './styles.css';
import { createSqlEditor } from './editors.js';
import { runFiddle, isEngineLoaded } from './engines/index.js';
import { EXAMPLE_SESSION } from './example.js';
import { renderLoading, renderResults, formatElapsedTime } from './results-view.js';
import { buildSessionFilename, normalizeEngineName, parseSession, serializeSession } from './session-file.js';
import { createDebouncedFunction, loadSavedSession, saveSession } from './storage.js';
import { applyTheme, oppositeTheme, persistTheme, resolveInitialTheme } from './theme.js';

const engineSelect = document.getElementById('engine-select');
const runButton = document.getElementById('run-button');
const downloadButton = document.getElementById('download-button');
const loadButton = document.getElementById('load-button');
const loadInput = document.getElementById('load-input');
const resetButton = document.getElementById('reset-button');
const themeButton = document.getElementById('theme-button');
const resultsContainer = document.getElementById('results');
const elapsedTimeLabel = document.getElementById('elapsed-time');

let currentTheme = resolveInitialTheme();
applyTheme(currentTheme);
const initialSession = loadSavedSession() ?? EXAMPLE_SESSION;
engineSelect.value = initialSession.engine;

const autosave = createDebouncedFunction(() => saveSession(getCurrentSession()), 400);

function getCurrentSession() {
  return {
    engine: engineSelect.value,
    schemaSql: schemaEditor.getText(),
    querySql: queryEditor.getText(),
  };
}

const editorOptions = { themeName: currentTheme, engineName: initialSession.engine, onChange: autosave, onRun: runCurrentFiddle };
const schemaEditor = createSqlEditor({
  parent: document.getElementById('schema-editor'),
  initialText: initialSession.schemaSql,
  ...editorOptions,
});
const queryEditor = createSqlEditor({
  parent: document.getElementById('query-editor'),
  initialText: initialSession.querySql,
  ...editorOptions,
});

let isRunning = false;

async function runCurrentFiddle() {
  if (isRunning) return;
  isRunning = true;
  runButton.disabled = true;
  elapsedTimeLabel.textContent = '';
  const { engine, schemaSql, querySql } = getCurrentSession();
  renderLoading(resultsContainer, isEngineLoaded(engine) ? 'Running…' : 'Loading engine…');
  try {
    const outcome = await runFiddle(engine, schemaSql, querySql);
    renderResults(resultsContainer, outcome);
    elapsedTimeLabel.textContent = `Executed in ${formatElapsedTime(outcome.elapsedMs)}`;
  } finally {
    isRunning = false;
    runButton.disabled = false;
  }
}

function applySession({ engine, schemaSql, querySql }) {
  const engineName = normalizeEngineName(engine);
  engineSelect.value = engineName;
  schemaEditor.setEngine(engineName);
  queryEditor.setEngine(engineName);
  schemaEditor.setText(schemaSql);
  queryEditor.setText(querySql);
  saveSession(getCurrentSession());
}

function updateThemeButtonLabel() {
  themeButton.textContent = currentTheme === 'dark' ? 'Light theme' : 'Dark theme';
}

engineSelect.addEventListener('change', () => {
  schemaEditor.setEngine(engineSelect.value);
  queryEditor.setEngine(engineSelect.value);
  autosave();
});

runButton.addEventListener('click', runCurrentFiddle);
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return; // the editor keymap already handled it
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    runCurrentFiddle();
  }
});

downloadButton.addEventListener('click', () => {
  const fileBlob = new Blob([serializeSession(getCurrentSession())], { type: 'application/sql' });
  const downloadUrl = URL.createObjectURL(fileBlob);
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = buildSessionFilename();
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
});

loadButton.addEventListener('click', () => loadInput.click());
loadInput.addEventListener('change', async () => {
  const selectedFile = loadInput.files[0];
  if (!selectedFile) return;
  applySession(parseSession(await selectedFile.text()));
  loadInput.value = '';
});

resetButton.addEventListener('click', () => {
  if (!window.confirm('Reset the sandbox? Your current schema and query will be replaced by the example.')) return;
  applySession({ ...EXAMPLE_SESSION, engine: engineSelect.value });
  resultsContainer.replaceChildren();
  elapsedTimeLabel.textContent = '';
});

themeButton.addEventListener('click', () => {
  currentTheme = oppositeTheme(currentTheme);
  applyTheme(currentTheme);
  persistTheme(currentTheme);
  schemaEditor.setTheme(currentTheme);
  queryEditor.setTheme(currentTheme);
  updateThemeButtonLabel();
});

updateThemeButtonLabel();
