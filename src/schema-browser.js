// Sidebar tree of databases -> tables -> columns. All names are inserted with textContent.

function createElementWithText(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// container: element to render into.
// onTableDoubleClick(databaseName, tableName): called when the user double-clicks a table.
export function createSchemaBrowser({ container, onTableDoubleClick }) {
  // Remember which nodes the user expanded so a refresh after each run keeps the tree as it was.
  const expandedNodeKeys = new Set();

  function createExpandableNode(nodeKey, summaryChildren, className) {
    const details = document.createElement('details');
    details.className = className;
    details.open = expandedNodeKeys.has(nodeKey);
    details.addEventListener('toggle', () => {
      if (details.open) expandedNodeKeys.add(nodeKey);
      else expandedNodeKeys.delete(nodeKey);
    });
    const summary = document.createElement('summary');
    summary.append(...summaryChildren);
    details.append(summary);
    return details;
  }

  function renderTable(databaseName, table) {
    const tableNode = createExpandableNode(
      `table:${databaseName}.${table.name}`,
      [createElementWithText('span', 'schema-table-name', table.name)],
      'schema-table',
    );
    tableNode.querySelector('summary').title = 'Double-click to insert a SELECT for this table';
    tableNode.querySelector('summary').addEventListener('dblclick', (event) => {
      event.preventDefault();
      onTableDoubleClick(databaseName, table.name);
    });

    const columnList = createElementWithText('ul', 'schema-columns');
    for (const column of table.columns) {
      const columnItem = createElementWithText('li', 'schema-column');
      columnItem.append(createElementWithText('span', 'schema-column-name', column.name));
      if (column.isPrimaryKey) columnItem.append(createElementWithText('span', 'schema-key-badge', 'PK'));
      columnItem.append(createElementWithText('span', 'schema-column-type', column.type ?? ''));
      columnList.append(columnItem);
    }
    tableNode.append(columnList);
    return tableNode;
  }

  function render(databases) {
    const children = [];
    for (const database of databases) {
      const tableNodes = database.tables.map((table) => renderTable(database.name, table));
      const databaseKey = `database:${database.name}`;
      // Databases start expanded the first time they appear.
      if (!expandedNodeKeys.has(`seen:${databaseKey}`)) {
        expandedNodeKeys.add(`seen:${databaseKey}`);
        expandedNodeKeys.add(databaseKey);
      }
      const databaseNode = createExpandableNode(
        databaseKey,
        [
          createElementWithText('span', 'schema-database-name', database.name),
          createElementWithText('span', 'schema-count', String(database.tables.length)),
        ],
        'schema-database',
      );
      if (tableNodes.length === 0) databaseNode.append(createElementWithText('p', 'schema-empty', 'No tables'));
      databaseNode.append(...tableNodes);
      children.push(databaseNode);
    }
    const hasAnyTable = databases.some((database) => database.tables.length > 0);
    if (!hasAnyTable && databases.length <= 1) {
      container.replaceChildren(createElementWithText('p', 'schema-empty', 'No tables yet. Run a CREATE TABLE statement.'));
      return;
    }
    container.replaceChildren(...children);
  }

  return {
    render,
    showMessage(message) {
      container.replaceChildren(createElementWithText('p', 'schema-empty', message));
    },
    reset() {
      expandedNodeKeys.clear();
    },
  };
}
