import { describe, expect, it } from 'vitest';
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
