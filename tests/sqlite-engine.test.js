import { describe, expect, it } from 'vitest';
import { runSqlite } from '../src/engines/sqlite.js';
import { EXAMPLE_SESSION } from '../src/example.js';

describe('sqlite engine', () => {
  it('runs the bundled example and returns a joined result table', async () => {
    const outcome = await runSqlite(EXAMPLE_SESSION.schemaSql, EXAMPLE_SESSION.querySql);
    expect(outcome.error).toBeNull();
    expect(outcome.resultSets).toHaveLength(1);
    const [resultSet] = outcome.resultSets;
    expect(resultSet.columns).toEqual(['name', 'title', 'grade']);
    expect(resultSet.rows).toHaveLength(4);
    expect(resultSet.rows[0]).toEqual(['Ada Example', 'Data Structures', 85]);
    expect(resultSet.rows[3]).toEqual(['Sam Sample', 'Statistics', null]);
    expect(outcome.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('returns one result per statement, with status messages', async () => {
    const outcome = await runSqlite('CREATE TABLE t (x INTEGER);', 'INSERT INTO t VALUES (1),(2); SELECT x FROM t; CREATE TABLE u (y);');
    expect(outcome.error).toBeNull();
    expect(outcome.resultSets.map((resultSet) => resultSet.kind)).toEqual(['status', 'rows', 'status']);
    expect(outcome.resultSets[0].message).toBe('2 rows affected');
    expect(outcome.resultSets[2].message).toBe('OK');
  });

  it('uses a fresh database on every run', async () => {
    await runSqlite('CREATE TABLE t (x);', 'SELECT 1;');
    const outcome = await runSqlite('', 'SELECT * FROM t;');
    expect(outcome.error.phase).toBe('query');
    expect(outcome.error.message).toMatch(/no such table/i);
  });

  it('reports schema errors as schema errors', async () => {
    const outcome = await runSqlite('CREATE TABL oops;', 'SELECT 1;');
    expect(outcome.error.phase).toBe('schema');
    expect(outcome.resultSets).toEqual([]);
  });

  it('keeps earlier query results when a later statement fails', async () => {
    const outcome = await runSqlite('', 'SELECT 1 AS one; SELECT * FROM missing;');
    expect(outcome.resultSets).toHaveLength(1);
    expect(outcome.error.phase).toBe('query');
  });
});
