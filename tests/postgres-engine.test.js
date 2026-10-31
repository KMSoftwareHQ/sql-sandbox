import { describe, expect, it } from 'vitest';
import { OpenTransactionError } from '../src/engines/open-transaction-error.js';
import { createPostgresSession } from '../src/engines/postgres.js';

describe('postgres engine session', () => {
  it('keeps state between runs and lists schemas, tables and primary keys', async () => {
    const session = await createPostgresSession();
    const createOutcome = await session.execute(`
      CREATE SCHEMA store;
      CREATE TABLE store.customers (customer_id serial PRIMARY KEY, first_name text NOT NULL);
      CREATE TABLE notes (body text);
      INSERT INTO store.customers (first_name) VALUES ('Ada'), ('Sam');`);
    expect(createOutcome.error).toBeNull();

    const selectOutcome = await session.execute('SELECT first_name FROM store.customers ORDER BY 1;');
    expect(selectOutcome.resultSets[0].rows).toEqual([['Ada'], ['Sam']]);

    expect(await session.listSchema()).toEqual([
      { name: 'public', tables: [{ name: 'notes', columns: [{ name: 'body', type: 'text', isPrimaryKey: false }] }] },
      {
        name: 'store',
        tables: [
          {
            name: 'customers',
            columns: [
              { name: 'customer_id', type: 'integer', isPrimaryKey: true },
              { name: 'first_name', type: 'text', isPrimaryKey: false },
            ],
          },
        ],
      },
    ]);
    await session.close();
  }, 30000);

  it('reports errors', async () => {
    const session = await createPostgresSession();
    const outcome = await session.execute('SELECT * FROM missing;');
    expect(outcome.error.message).toMatch(/does not exist/);
    await session.close();
  }, 30000);
});

describe('postgres snapshots', () => {
  it('restores tables and rows into a new session', async () => {
    const session = await createPostgresSession();
    await session.execute("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('kept');");
    const snapshot = await session.exportSnapshot();
    expect(snapshot.bytes).toBeInstanceOf(Uint8Array);
    await session.close();

    const restoredSession = await createPostgresSession({ snapshot });
    expect((await restoredSession.execute('SELECT body FROM notes;')).resultSets[0].rows).toEqual([['kept']]);
    await restoredSession.close();
  }, 60000);
});

describe('postgres change marker and transactions', () => {
  it('changes the marker on writes, not on reads', async () => {
    const session = await createPostgresSession();
    await session.execute('CREATE TABLE t (x INT);');
    const marker = await session.getChangeMarker();
    await session.execute('SELECT * FROM t;');
    expect(await session.getChangeMarker()).toBe(marker);
    await session.execute('INSERT INTO t VALUES (1);');
    expect(await session.getChangeMarker()).not.toBe(marker);
    await session.close();
  }, 30000);

  it('throws OpenTransactionError inside an open or aborted write transaction', async () => {
    const session = await createPostgresSession();
    await session.execute('CREATE TABLE t (x INT); BEGIN; INSERT INTO t VALUES (1);');
    await expect(session.exportSnapshot()).rejects.toBeInstanceOf(OpenTransactionError);
    await session.execute('SELECT * FROM missing_table;');
    await expect(session.exportSnapshot()).rejects.toBeInstanceOf(OpenTransactionError);
    await session.execute('ROLLBACK;');
    await expect(session.exportSnapshot()).resolves.toHaveProperty('bytes');
    await session.close();
  }, 60000);
});
