// Session file format: valid SQL with marker comments.
//   -- @fiddle engine=sqlite
//   -- @fiddle section=schema
//   ...
//   -- @fiddle section=query
//   ...
// A file without markers is loaded entirely into the schema.

export const KNOWN_ENGINES = ['sqlite', 'postgres'];
export const DEFAULT_ENGINE = 'sqlite';

const MARKER_PATTERN = /^\s*--\s*@fiddle\s+([A-Za-z]+)\s*=\s*([^\s]+)\s*$/i;

export function normalizeEngineName(engineName) {
  const lowerCased = String(engineName ?? '').trim().toLowerCase();
  return KNOWN_ENGINES.includes(lowerCased) ? lowerCased : DEFAULT_ENGINE;
}

export function serializeSession({ engine, schemaSql, querySql }) {
  return [
    `-- @fiddle engine=${normalizeEngineName(engine)}`,
    '-- @fiddle section=schema',
    `${schemaSql ?? ''}`,
    '-- @fiddle section=query',
    `${querySql ?? ''}`,
    '',
  ].join('\n');
}

export function parseSession(fileText) {
  const normalizedText = String(fileText ?? '').replace(/\r\n?/g, '\n');
  const allLines = normalizedText.split('\n');

  let engine = DEFAULT_ENGINE;
  let foundMarker = false;
  let currentSection = 'schema';
  const linesBySection = { schema: [], query: [] };

  for (const line of allLines) {
    const markerMatch = line.match(MARKER_PATTERN);
    if (markerMatch) {
      const markerKey = markerMatch[1].toLowerCase();
      const markerValue = markerMatch[2].toLowerCase();
      if (markerKey === 'engine') {
        foundMarker = true;
        engine = normalizeEngineName(markerValue);
        continue;
      }
      if (markerKey === 'section' && (markerValue === 'schema' || markerValue === 'query')) {
        foundMarker = true;
        currentSection = markerValue;
        continue;
      }
    }
    linesBySection[currentSection].push(line);
  }

  if (!foundMarker) {
    return { engine, schemaSql: normalizedText, querySql: '' };
  }

  // The serializer ends the file with a newline, which split() turns into a final empty line.
  const lastLines = linesBySection[currentSection];
  if (lastLines.length > 0 && lastLines[lastLines.length - 1] === '') {
    lastLines.pop();
  }

  return {
    engine,
    schemaSql: linesBySection.schema.join('\n'),
    querySql: linesBySection.query.join('\n'),
  };
}

export function buildSessionFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `sql-sandbox-${year}-${month}-${day}.sql`;
}
