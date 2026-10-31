// All user-controlled text is inserted with textContent, never innerHTML.

function createElementWithText(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function bytesToHex(bytes) {
  return '\\x' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function formatCellValue(value) {
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderCell(value) {
  if (value === null || value === undefined) {
    return createElementWithText('td', 'cell-null', 'NULL');
  }
  return createElementWithText('td', typeof value === 'number' ? 'cell-number' : '', formatCellValue(value));
}

// Rendering is capped so a huge result set cannot freeze the page.
export const MAX_RENDERED_ROWS = 1000;

function renderRowsTable(resultSet) {
  const wrapper = createElementWithText('div', 'result-block');
  const scrollContainer = createElementWithText('div', 'table-scroll');
  const table = createElementWithText('table', 'result-table');

  const headerRow = document.createElement('tr');
  for (const columnName of resultSet.columns) {
    headerRow.append(createElementWithText('th', '', columnName));
  }
  const tableHead = document.createElement('thead');
  tableHead.append(headerRow);
  table.append(tableHead);

  const tableBody = document.createElement('tbody');
  for (const rowValues of resultSet.rows.slice(0, MAX_RENDERED_ROWS)) {
    const row = document.createElement('tr');
    for (const value of rowValues) row.append(renderCell(value));
    tableBody.append(row);
  }
  table.append(tableBody);

  scrollContainer.append(table);
  wrapper.append(scrollContainer);
  const rowCount = resultSet.rows.length;
  const rowCountText = `${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`;
  const captionText = rowCount > MAX_RENDERED_ROWS ? `${rowCountText} (showing the first ${MAX_RENDERED_ROWS})` : rowCountText;
  wrapper.append(createElementWithText('p', 'result-caption', captionText));
  if (resultSet.warning) wrapper.append(createElementWithText('p', 'result-warning', resultSet.warning));
  return wrapper;
}

export function renderLoading(container, message) {
  container.replaceChildren(createElementWithText('p', 'loading-message', message));
}

function renderRun({ title, resultSets, error }) {
  const children = [];
  if (title) children.push(createElementWithText('h3', 'run-title', title));

  for (const resultSet of resultSets) {
    children.push(
      resultSet.kind === 'rows'
        ? renderRowsTable(resultSet)
        : createElementWithText('p', 'status-message', resultSet.message),
    );
  }

  if (error) {
    const errorBox = createElementWithText('div', 'error-box');
    errorBox.setAttribute('role', 'alert');
    errorBox.append(createElementWithText('strong', 'error-title', title ? `Error in ${title}` : 'Error'));
    errorBox.append(createElementWithText('pre', 'error-message', error.message));
    children.push(errorBox);
  } else if (resultSets.length === 0) {
    children.push(createElementWithText('p', 'status-message', 'No statements to run.'));
  }
  return children;
}

// runs: [{ title?, resultSets, error }] — one entry per executed tab.
export function renderResults(container, runs) {
  container.replaceChildren(...runs.flatMap(renderRun));
}

export function renderNotice(container, message) {
  container.replaceChildren(createElementWithText('p', 'status-message', message));
}

export function formatElapsedTime(elapsedMs) {
  return elapsedMs < 1000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(2)} s`;
}
