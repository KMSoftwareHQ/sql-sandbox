import { describe, expect, it } from 'vitest';
import { Lite4MariaDB } from 'lite4mariadb';
import { createMysqlSession, toResultSet } from '../src/engines/mysql.js';
import { EXAMPLE_SESSION } from '../src/example.js';

// Uses the real MariaDB WebAssembly engine directly (no worker) in Node.
const createSession = () => createMysqlSession({ createDatabase: () => Lite4MariaDB.create() });

describe('mysql engine session', () => {
  it('runs a tutorial-style script with databases, USE and MySQL-specific syntax', async () => {
    const session = await createSession();
    const outcome = await session.execute(`
      DROP DATABASE IF EXISTS \`sql_store\`;
      CREATE DATABASE \`sql_store\`;
      USE \`sql_store\`;
      SET NAMES utf8;
      CREATE TABLE \`customers\` (
        \`customer_id\` int(11) NOT NULL AUTO_INCREMENT,
        \`first_name\` varchar(50) NOT NULL,
        PRIMARY KEY (\`customer_id\`)
      ) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      INSERT INTO \`customers\` VALUES (1,'Ada'),(2,'Sam');
      CREATE DATABASE sql_hr;`);
    expect(outcome.error).toBeNull();

    const selectOutcome = await session.execute('SELECT first_name FROM customers ORDER BY customer_id LIMIT 0, 5;');
    expect(selectOutcome.resultSets[0]).toEqual({ kind: 'rows', columns: ['first_name'], rows: [['Ada'], ['Sam']] });

    expect(await session.listSchema()).toEqual([
      { name: 'sandbox', tables: [] },
      { name: 'sql_hr', tables: [] },
      {
        name: 'sql_store',
        tables: [
          {
            name: 'customers',
            columns: [
              { name: 'customer_id', type: 'int(11)', isPrimaryKey: true },
              { name: 'first_name', type: 'varchar(50)', isPrimaryKey: false },
            ],
          },
        ],
      },
    ]);
    await session.close();
  }, 60000);

  it('runs the bundled example in the default sandbox database', async () => {
    const session = await createSession();
    for (const tab of EXAMPLE_SESSION.tabs) {
      const outcome = await session.execute(tab.sql);
      expect(outcome.error).toBeNull();
    }
    const outcome = await session.execute(EXAMPLE_SESSION.tabs[1].sql);
    expect(outcome.resultSets[0].rows).toHaveLength(4);
    await session.close();
  }, 60000);

  it('keeps earlier results and reports the failing line', async () => {
    const session = await createSession();
    const outcome = await session.execute('CREATE DATABASE d; USE d;\nSELECT 1 AS one;\nSELEC oops;');
    expect(outcome.resultSets.map((resultSet) => resultSet.kind)).toEqual(['status', 'status', 'rows']);
    expect(outcome.error.message).toMatch(/^Line 3: .*syntax/);
    await session.close();
  }, 60000);

  it('explains that stored procedures are not supported yet', async () => {
    const session = await createSession();
    const outcome = await session.execute('DELIMITER $$\nCREATE PROCEDURE answer()\nBEGIN\n  SELECT 42;\nEND$$\nDELIMITER ;');
    expect(outcome.error.message).toBe(
      'Line 2: Stored procedures and functions are not supported by the in-browser MySQL engine yet. Views, triggers and transactions work.',
    );
    await session.close();
  }, 60000);

  it('runs mysqldump-style executable comments', async () => {
    const session = await createSession();
    const outcome = await session.execute('/*!50001 CREATE TABLE dumped (a int) */;\nCREATE TABLE plain (a int);');
    expect(outcome.error).toBeNull();
    const [sandbox] = await session.listSchema();
    expect(sandbox.tables.map((table) => table.name)).toEqual(['dumped', 'plain']);
    await session.close();
  }, 60000);

  it('supports views and triggers', async () => {
    const session = await createSession();
    const outcome = await session.execute(
      'CREATE TABLE t (x int);\nCREATE VIEW v AS SELECT x * 10 AS ten_x FROM t;\nCREATE TRIGGER add_one BEFORE INSERT ON t FOR EACH ROW SET NEW.x = NEW.x + 1;\nINSERT INTO t VALUES (1);\nSELECT ten_x FROM v;',
    );
    expect(outcome.error).toBeNull();
    expect(outcome.resultSets.at(-1).rows).toEqual([[20]]);
    await session.close();
  }, 60000);
});

describe('toResultSet', () => {
  it('warns instead of silently merging duplicate column names', () => {
    const resultSet = toResultSet({ fields: ['id', 'id', 'name'], rows: [{ id: 2, name: 'x' }] });
    expect(resultSet.columns).toEqual(['id', 'name']);
    expect(resultSet.warning).toMatch(/same name \(id\)/);
  });

  it('turns statements without columns into status messages', () => {
    expect(toResultSet({ affected: 3, rows: [] })).toEqual({ kind: 'status', message: '3 rows affected' });
    expect(toResultSet({ affected: 0, rows: [] })).toEqual({ kind: 'status', message: 'OK' });
  });
});
