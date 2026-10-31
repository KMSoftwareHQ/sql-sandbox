import { describe, expect, it } from 'vitest';
import { splitMysqlScript } from '../src/engines/mysql-script-splitter.js';

const sqlOnly = (sqlText) => splitMysqlScript(sqlText).map((statement) => statement.sql);

describe('splitMysqlScript', () => {
  it('splits on semicolons and drops empty statements', () => {
    expect(sqlOnly('SELECT 1; ;\n SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps a final statement without a semicolon', () => {
    expect(sqlOnly('SELECT 1;\nSELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('ignores semicolons inside quotes, backticks and comments', () => {
    const script = "INSERT INTO t VALUES ('a;b', \"c;d\");\nSELECT `odd;name` FROM t; -- trailing; comment\n# hash; comment\n/* block; comment */ SELECT 3;";
    expect(sqlOnly(script)).toEqual([
      "INSERT INTO t VALUES ('a;b', \"c;d\")",
      'SELECT `odd;name` FROM t',
      '-- trailing; comment\n# hash; comment\n/* block; comment */ SELECT 3',
    ]);
  });

  it('handles escaped and doubled quotes', () => {
    expect(sqlOnly("SELECT 'it\\'s; fine'; SELECT 'it''s; fine';")).toEqual(["SELECT 'it\\'s; fine'", "SELECT 'it''s; fine'"]);
  });

  it('does not treat --x (no space) as a comment', () => {
    expect(sqlOnly('SELECT 5--1;')).toEqual(['SELECT 5--1']);
  });

  it('skips fragments that are only comments', () => {
    expect(sqlOnly('SELECT 1;\n-- the end\n/* really */\n')).toEqual(['SELECT 1']);
  });

  it('supports DELIMITER for stored procedures', () => {
    const script = [
      'DELIMITER $$',
      'CREATE PROCEDURE get_clients()',
      'BEGIN',
      '  SELECT * FROM clients;',
      'END$$',
      'DELIMITER ;',
      'CALL get_clients();',
    ].join('\n');
    expect(sqlOnly(script)).toEqual(['CREATE PROCEDURE get_clients()\nBEGIN\n  SELECT * FROM clients;\nEND', 'CALL get_clients()']);
  });

  it('reports the line each statement starts on', () => {
    const lines = splitMysqlScript('SELECT 1;\n\n\nSELECT 2;\r\nSELECT\n3;').map((statement) => statement.line);
    expect(lines).toEqual([1, 4, 5]);
  });
});
