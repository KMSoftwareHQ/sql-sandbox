import { describe, expect, it } from 'vitest';
import { buildSessionFilename, parseSession, serializeSession } from '../src/session-file.js';

describe('session file', () => {
  it('round-trips engine, schema and query', () => {
    const session = { engine: 'postgres', schemaSql: 'CREATE TABLE a (x int);\n', querySql: 'SELECT 1;' };
    expect(parseSession(serializeSession(session))).toEqual(session);
  });

  it('round-trips empty sections and multi-line text', () => {
    const session = { engine: 'sqlite', schemaSql: '', querySql: 'SELECT\n\n  1' };
    expect(parseSession(serializeSession(session))).toEqual(session);
  });

  it('serializes with the documented markers', () => {
    expect(serializeSession({ engine: 'sqlite', schemaSql: 'A;', querySql: 'B;' })).toBe(
      '-- @fiddle engine=sqlite\n-- @fiddle section=schema\nA;\n-- @fiddle section=query\nB;\n',
    );
  });

  it('puts a file without markers entirely into the schema', () => {
    const text = 'CREATE TABLE t (x int);\nSELECT * FROM t;\n';
    expect(parseSession(text)).toEqual({ engine: 'sqlite', schemaSql: text, querySql: '' });
  });

  it('falls back to sqlite for an unknown engine', () => {
    const parsed = parseSession('-- @fiddle engine=oracle\n-- @fiddle section=query\nSELECT 1;\n');
    expect(parsed.engine).toBe('sqlite');
    expect(parsed.querySql).toBe('SELECT 1;');
  });

  it('handles CRLF line endings', () => {
    const parsed = parseSession('-- @fiddle engine=postgres\r\n-- @fiddle section=schema\r\nA;\r\nB;\r\n-- @fiddle section=query\r\nC;\r\n');
    expect(parsed).toEqual({ engine: 'postgres', schemaSql: 'A;\nB;', querySql: 'C;' });
  });

  it('accepts markers in odd case and spacing', () => {
    const parsed = parseSession('  --   @FIDDLE   Engine = PostgreS  \n--@fiddle SECTION=Schema\nA;\n-- @Fiddle section=QUERY   \nB;');
    expect(parsed).toEqual({ engine: 'postgres', schemaSql: 'A;', querySql: 'B;' });
  });

  it('keeps unrelated comments and unknown markers as plain text', () => {
    const parsed = parseSession('-- @fiddle section=schema\n-- just a comment\n-- @fiddle color=red\nA;');
    expect(parsed.schemaSql).toBe('-- just a comment\n-- @fiddle color=red\nA;');
  });

  it('treats text after only an engine marker as schema', () => {
    expect(parseSession('-- @fiddle engine=postgres\nSELECT 1;')).toEqual({
      engine: 'postgres',
      schemaSql: 'SELECT 1;',
      querySql: '',
    });
  });

  it('builds a dated filename', () => {
    expect(buildSessionFilename(new Date(2026, 0, 5))).toBe('sql-sandbox-2026-01-05.sql');
  });
});
