import { describe, expect, it } from 'vitest';
import { buildSessionFilename, parseSession, sanitizeTabName, serializeSession } from '../src/session-file.js';

const withoutFlag = ({ hasMarkers, ...session }) => session;

describe('session file', () => {
  it('round-trips engine and several tabs', () => {
    const session = {
      engine: 'mysql',
      tabs: [
        { name: 'create.sql', sql: 'CREATE TABLE a (x int);\n' },
        { name: 'empty.sql', sql: '' },
        { name: 'query.sql', sql: 'SELECT\n\n  1' },
      ],
    };
    const parsed = parseSession(serializeSession(session));
    expect(parsed.hasMarkers).toBe(true);
    expect(withoutFlag(parsed)).toEqual(session);
  });

  it('serializes with the documented markers', () => {
    expect(serializeSession({ engine: 'sqlite', tabs: [{ name: 'a.sql', sql: 'A;' }, { name: 'b.sql', sql: 'B;' }] })).toBe(
      '-- @fiddle engine=sqlite\n-- @fiddle file=a.sql\nA;\n-- @fiddle file=b.sql\nB;\n',
    );
  });

  it('replaces whitespace in tab names so the marker stays one token', () => {
    const text = serializeSession({ engine: 'sqlite', tabs: [{ name: 'my  query .sql', sql: 'A;' }] });
    expect(text).toContain('-- @fiddle file=my-query-.sql\n');
    expect(parseSession(text).tabs[0].name).toBe('my-query-.sql');
  });

  it('opens a file without markers as a single plain script tab', () => {
    const text = 'CREATE DATABASE store;\nUSE store;\n';
    expect(parseSession(text, 'create-db.sql')).toEqual({
      engine: 'sqlite',
      tabs: [{ name: 'create-db.sql', sql: text }],
      hasMarkers: false,
    });
  });

  it('reads the v0.1–v0.3 schema/query format as two tabs', () => {
    const legacyText = '-- @fiddle engine=postgres\n-- @fiddle section=schema\nCREATE TABLE t (x int);\n-- @fiddle section=query\nSELECT * FROM t;\n';
    expect(withoutFlag(parseSession(legacyText))).toEqual({
      engine: 'postgres',
      tabs: [
        { name: 'schema.sql', sql: 'CREATE TABLE t (x int);' },
        { name: 'query.sql', sql: 'SELECT * FROM t;' },
      ],
    });
  });

  it('falls back to sqlite for an unknown engine', () => {
    const parsed = parseSession('-- @fiddle engine=oracle\n-- @fiddle file=q.sql\nSELECT 1;\n');
    expect(parsed.engine).toBe('sqlite');
    expect(parsed.tabs).toEqual([{ name: 'q.sql', sql: 'SELECT 1;' }]);
  });

  it('handles CRLF line endings', () => {
    const parsed = parseSession('-- @fiddle engine=postgres\r\n-- @fiddle file=a.sql\r\nA;\r\nB;\r\n-- @fiddle file=b.sql\r\nC;\r\n');
    expect(parsed.tabs).toEqual([{ name: 'a.sql', sql: 'A;\nB;' }, { name: 'b.sql', sql: 'C;' }]);
  });

  it('accepts markers in odd case and spacing', () => {
    const parsed = parseSession('  --   @FIDDLE   Engine = PostgreS  \n--@fiddle SECTION=Schema\nA;\n-- @Fiddle FILE=Extra.sql   \nB;');
    expect(withoutFlag(parsed)).toEqual({
      engine: 'postgres',
      tabs: [{ name: 'schema.sql', sql: 'A;' }, { name: 'Extra.sql', sql: 'B;' }],
    });
  });

  it('keeps unrelated comments and unknown markers as plain text', () => {
    const parsed = parseSession('-- @fiddle file=a.sql\n-- just a comment\n-- @fiddle color=red\nA;');
    expect(parsed.tabs[0].sql).toBe('-- just a comment\n-- @fiddle color=red\nA;');
  });

  it('keeps text that appears before the first tab marker in its own tab', () => {
    const parsed = parseSession('-- @fiddle engine=postgres\nSELECT 1;\n-- @fiddle file=b.sql\nSELECT 2;', 'upload.sql');
    expect(parsed.tabs).toEqual([{ name: 'upload.sql', sql: 'SELECT 1;' }, { name: 'b.sql', sql: 'SELECT 2;' }]);
  });

  it('drops a blank gap between the engine marker and the first tab', () => {
    const parsed = parseSession('-- @fiddle engine=sqlite\n\n-- @fiddle file=a.sql\nA;\n');
    expect(parsed.tabs).toEqual([{ name: 'a.sql', sql: 'A;' }]);
  });

  it('sanitizes empty tab names to a fallback', () => {
    expect(sanitizeTabName('   ', 'fallback.sql')).toBe('fallback.sql');
  });

  it('builds a dated filename', () => {
    expect(buildSessionFilename(new Date(2026, 0, 5))).toBe('sql-sandbox-2026-01-05.sql');
  });
});
