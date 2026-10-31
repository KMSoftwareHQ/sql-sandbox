// Shared by engines that list their schema from information_schema-style rows.

// Groups information_schema column rows into [{ name, tables: [{ name, columns }] }].
export function groupColumnsBySchema(columnRows) {
  const schemasByName = new Map();
  for (const { schemaName, tableName, columnName, columnType, isPrimaryKey } of columnRows) {
    if (!schemasByName.has(schemaName)) schemasByName.set(schemaName, new Map());
    const tablesByName = schemasByName.get(schemaName);
    if (!tablesByName.has(tableName)) tablesByName.set(tableName, []);
    if (columnName !== null) tablesByName.get(tableName).push({ name: columnName, type: columnType, isPrimaryKey: Boolean(isPrimaryKey) });
  }
  return [...schemasByName].map(([schemaName, tablesByName]) => ({
    name: schemaName,
    tables: [...tablesByName].map(([tableName, columns]) => ({ name: tableName, columns })),
  }));
}
