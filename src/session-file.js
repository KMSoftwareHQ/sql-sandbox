// Session file format: valid SQL with marker comments.
//
//   -- @fiddle engine=mysql
//   -- @fiddle file=schema.sql
//   ...
//   -- @fiddle file=queries.sql
//   ...
//
// Each `file=` marker starts a new tab. Older formats are still read:
//   - v0.1–v0.3: `section=schema` / `section=query` markers become tabs named "schema.sql" / "query.sql".
//   - A file without markers is a plain SQL script and becomes a single tab.

export const KNOWN_ENGINES = ['sqlite', 'postgres', 'mysql'];
export const DEFAULT_ENGINE = 'sqlite';

const MARKER_PATTERN = /^\s*--\s*@fiddle\s+([A-Za-z]+)\s*=\s*(\S+)\s*$/i;
const LEGACY_SECTION_TAB_NAMES = { schema: 'schema.sql', query: 'query.sql' };

export function normalizeEngineName(engineName) {
  const lowerCased = String(engineName ?? '').trim().toLowerCase();
  return KNOWN_ENGINES.includes(lowerCased) ? lowerCased : DEFAULT_ENGINE;
}

// Tab names end up inside a marker line, so they must be a single token without whitespace.
export function sanitizeTabName(tabName, fallbackName = 'script.sql') {
  const cleaned = String(tabName ?? '').trim().replace(/\s+/g, '-');
  return cleaned.length > 0 ? cleaned : fallbackName;
}

export function serializeSession({ engine, tabs }) {
  const lines = [`-- @fiddle engine=${normalizeEngineName(engine)}`];
  tabs.forEach((tab, tabIndex) => {
    lines.push(`-- @fiddle file=${sanitizeTabName(tab.name, `script-${tabIndex + 1}.sql`)}`);
    lines.push(tab.sql ?? '');
  });
  lines.push('');
  return lines.join('\n');
}

// Returns { engine, tabs: [{ name, sql }], hasMarkers }.
// hasMarkers is false for a plain SQL script, which callers open as a new tab rather than a whole session.
export function parseSession(fileText, plainScriptName = 'script.sql') {
  const normalizedText = String(fileText ?? '').replace(/\r\n?/g, '\n');

  let engine = DEFAULT_ENGINE;
  let hasMarkers = false;
  const tabs = [];
  let currentTab = null;

  for (const line of normalizedText.split('\n')) {
    const markerMatch = line.match(MARKER_PATTERN);
    if (markerMatch) {
      const markerKey = markerMatch[1].toLowerCase();
      const markerValue = markerMatch[2];
      if (markerKey === 'engine') {
        hasMarkers = true;
        engine = normalizeEngineName(markerValue);
        continue;
      }
      if (markerKey === 'file') {
        hasMarkers = true;
        currentTab = { name: sanitizeTabName(markerValue), lines: [] };
        tabs.push(currentTab);
        continue;
      }
      const legacyTabName = LEGACY_SECTION_TAB_NAMES[markerValue.toLowerCase()];
      if (markerKey === 'section' && legacyTabName) {
        hasMarkers = true;
        currentTab = { name: legacyTabName, lines: [] };
        tabs.push(currentTab);
        continue;
      }
    }
    if (!currentTab) {
      // Text before the first tab marker (or a file with no markers at all).
      currentTab = { name: plainScriptName, lines: [] };
      tabs.push(currentTab);
    }
    currentTab.lines.push(line);
  }

  if (!hasMarkers) {
    return { engine, tabs: [{ name: sanitizeTabName(plainScriptName), sql: normalizedText }], hasMarkers };
  }

  // The serializer ends the file with a newline, which split() turns into a final empty line.
  const lastTab = tabs[tabs.length - 1];
  if (lastTab && lastTab.lines.at(-1) === '') lastTab.lines.pop();

  // Drop an implicit leading tab that only holds blank lines (e.g. a blank line before the first marker).
  const meaningfulTabs = tabs.filter(
    (tab, tabIndex) => !(tabIndex === 0 && tabs.length > 1 && tab.lines.every((line) => line.trim() === '') && tab.name === plainScriptName),
  );

  return {
    engine,
    tabs: meaningfulTabs.map((tab) => ({ name: tab.name, sql: tab.lines.join('\n') })),
    hasMarkers,
  };
}

export function buildSessionFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `sql-sandbox-${year}-${month}-${day}.sql`;
}
