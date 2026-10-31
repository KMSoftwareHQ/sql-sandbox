import { describe, expect, it } from 'vitest';
import { OpenTransactionError } from '../src/engines/open-transaction-error.js';
import { createSqliteSession } from '../src/engines/sqlite.js';
import { EXAMPLE_SESSION } from '../src/example.js';

const [exampleSchemaTab, exampleQueryTab] = EXAMPLE_SESSION.tabs;

describe('sqlite engine session', () => {
  it('runs the bundled example tabs in order and returns a joined result table', async () => {
    const session = await createSqliteSession();
    expect((await session.execute(exampleSchemaTab.sql)).error).toBeNull();
    const outcome = await session.execute(exampleQueryTab.sql);
    expect(outcome.error).toBeNull();
    expect(outcome.resultSets).toHaveLength(1);
    const [resultSet] = outcome.resultSets;
    expect(resultSet.columns).toEqual(['name', 'title', 'grade']);
    expect(resultSet.rows).toHaveLength(4);
    expect(resultSet.rows[0]).toEqual(['Ada Example', 'Data Structures', 85]);
    expect(resultSet.rows[3]).toEqual(['Sam Sample', 'Statistics', null]);
    await session.close();
  });

  it('keeps state between runs', async () => {
    const session = await createSqliteSession();
    await session.execute('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1);');
    const outcome = await session.execute('SELECT x FROM t;');
    expect(outcome.resultSets[0].rows).toEqual([[1]]);
    await session.close();
  });

  it('isolates separate sessions', async () => {
    const firstSession = await createSqliteSession();
    const secondSession = await createSqliteSession();
    await firstSession.execute('CREATE TABLE only_in_first (x);');
    const outcome = await secondSession.execute('SELECT * FROM only_in_first;');
    expect(outcome.error.message).toMatch(/no such table/i);
    await firstSession.close();
    await secondSession.close();
  });

  it('returns one result per statement, with status messages', async () => {
    const session = await createSqliteSession();
    const outcome = await session.execute('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1),(2); SELECT x FROM t;');
    expect(outcome.error).toBeNull();
    expect(outcome.resultSets.map((resultSet) => resultSet.kind)).toEqual(['status', 'status', 'rows']);
    expect(outcome.resultSets[0].message).toBe('OK');
    expect(outcome.resultSets[1].message).toBe('2 rows affected');
    await session.close();
  });

  it('keeps earlier results when a later statement fails', async () => {
    const session = await createSqliteSession();
    const outcome = await session.execute('SELECT 1 AS one; SELECT * FROM missing;');
    expect(outcome.resultSets).toHaveLength(1);
    expect(outcome.error.message).toMatch(/no such table/i);
    await session.close();
  });

  it('lists tables and columns, marking primary keys', async () => {
    const session = await createSqliteSession();
    await session.execute(`CREATE TABLE "odd ""name'" (id INTEGER PRIMARY KEY, label TEXT); CREATE VIEW v AS SELECT 1 AS one;`);
    const schema = await session.listSchema();
    expect(schema).toEqual([
      {
        name: 'main',
        tables: [
          {
            name: `odd "name'`,
            columns: [
              { name: 'id', type: 'INTEGER', isPrimaryKey: true },
              { name: 'label', type: 'TEXT', isPrimaryKey: false },
            ],
          },
          { name: 'v', columns: [{ name: 'one', type: '', isPrimaryKey: false }] },
        ],
      },
    ]);
    await session.close();
  });
});

describe('sqlite snapshots', () => {
  it('restores tables and rows into a new session', async () => {
    const session = await createSqliteSession();
    await session.execute("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('kept');");
    const snapshot = await session.exportSnapshot();
    await session.close();

    const restoredSession = await createSqliteSession({ snapshot });
    expect((await restoredSession.execute('SELECT body FROM notes;')).resultSets[0].rows).toEqual([['kept']]);
    await restoredSession.close();
  });

  it('refuses to snapshot an unfinished transaction, so uncommitted rows are never saved', async () => {
    const session = await createSqliteSession();
    await session.execute('CREATE TABLE t (x INTEGER); BEGIN; INSERT INTO t VALUES (1);');
    await expect(session.exportSnapshot()).rejects.toThrow();
    await session.close();
  });
});

describe('sqlite snapshot validation', () => {
  it('rejects bytes that are not a SQLite database', async () => {
    await expect(createSqliteSession({ snapshot: { bytes: new Uint8Array([1, 2, 3, 4]) } })).rejects.toThrow();
  });
});

describe('sqlite change marker, transactions and settings', () => {
  it('changes the marker on writes and schema changes, not on reads', async () => {
    const session = await createSqliteSession();
    const initialMarker = await session.getChangeMarker();
    await session.execute('CREATE TABLE t (x INTEGER);');
    const afterCreate = await session.getChangeMarker();
    expect(afterCreate).not.toBe(initialMarker);
    await session.execute('SELECT * FROM t;');
    expect(await session.getChangeMarker()).toBe(afterCreate);
    await session.execute('INSERT INTO t VALUES (1);');
    expect(await session.getChangeMarker()).not.toBe(afterCreate);
    await session.close();
  });

  it('throws OpenTransactionError during a write transaction and saves after COMMIT', async () => {
    const session = await createSqliteSession();
    await session.execute('CREATE TABLE t (x INTEGER); BEGIN; INSERT INTO t VALUES (1);');
    await expect(session.exportSnapshot()).rejects.toBeInstanceOf(OpenTransactionError);
    await session.execute('COMMIT;');
    await expect(session.exportSnapshot()).resolves.toHaveProperty('bytes');
    await session.close();
  });

  it('keeps PRAGMA foreign_keys across a snapshot', async () => {
    const session = await createSqliteSession();
    await session.execute('PRAGMA foreign_keys = ON; CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (parent_id INTEGER REFERENCES parent(id));');
    const restoredSession = await createSqliteSession({ snapshot: await session.exportSnapshot() });
    const outcome = await restoredSession.execute('INSERT INTO child VALUES (999);');
    expect(outcome.error?.message).toMatch(/FOREIGN KEY/i);
    await session.close();
    await restoredSession.close();
  });
});
