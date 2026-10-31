// Splits a MySQL script into statements, like the mysql command-line client does.
//
// - Statements end at the current delimiter (default ";") outside quotes and comments.
// - `DELIMITER <token>` changes the delimiter (needed for stored procedures and triggers). It is a
//   client command, recognized at the start of a statement, and is not sent to the server.
// - Quotes ('...', "...", `...`), backslash escapes inside quotes, and comments (-- , #, /* */)
//   are respected, so a delimiter inside them does not end a statement.
// - Executable comments (/*! ... */, /*M! ... */, as written by mysqldump) count as code.
//
// Returns [{ sql, line }] where line is the 1-based line of the statement's first code character.

const DELIMITER_COMMAND_PATTERN = /^delimiter[ \t]+(\S+)[ \t]*(?:(?:--[ \t]|#).*)?$/i;

export function splitMysqlScript(sqlText) {
  const text = String(sqlText ?? '').replace(/\r\n?/g, '\n');
  const statements = [];
  let delimiter = ';';
  let statementStart = 0;
  let currentLine = 1;
  let position = 0;
  // False while the current statement holds only whitespace and comments; such fragments are not sent.
  let statementHasCode = false;
  let statementCodeLine = 1;

  function markStatementHasCode() {
    if (statementHasCode) return;
    statementHasCode = true;
    statementCodeLine = currentLine;
  }

  function startNextStatement(nextStart) {
    statementStart = nextStart;
    statementHasCode = false;
  }

  function pushStatement(endPosition) {
    if (statementHasCode) {
      statements.push({ sql: text.slice(statementStart, endPosition).trim(), line: statementCodeLine });
    }
  }

  function lineEndFrom(fromPosition) {
    const newlinePosition = text.indexOf('\n', fromPosition);
    return newlinePosition === -1 ? text.length : newlinePosition;
  }

  while (position < text.length) {
    const character = text[position];
    const nextCharacter = text[position + 1];

    // DELIMITER command: only between statements, as a whole word.
    const followsBoundary = position === 0 || /\s/.test(text[position - 1]) || position === statementStart;
    if (!statementHasCode && followsBoundary && (character === 'd' || character === 'D')) {
      const lineEnd = lineEndFrom(position);
      const delimiterMatch = text.slice(position, lineEnd).match(DELIMITER_COMMAND_PATTERN);
      if (delimiterMatch) {
        delimiter = delimiterMatch[1];
        position = lineEnd;
        startNextStatement(lineEnd);
        continue;
      }
    }

    if (character === '\n') {
      currentLine += 1;
      position += 1;
      continue;
    }

    // Checked before comments so delimiters such as "##" or "--" work.
    if (text.startsWith(delimiter, position)) {
      pushStatement(position);
      position += delimiter.length;
      startNextStatement(position);
      continue;
    }

    // Line comments: "-- " (dash dash whitespace) and "#".
    if ((character === '-' && nextCharacter === '-' && /\s/.test(text[position + 2] ?? '\n')) || character === '#') {
      position = lineEndFrom(position);
      continue;
    }

    // Block comments. Executable comments are code the server runs, so the statement is kept.
    if (character === '/' && nextCharacter === '*') {
      if (text[position + 2] === '!' || text.startsWith('M!', position + 2)) markStatementHasCode();
      const commentEnd = text.indexOf('*/', position + 2);
      const blockEnd = commentEnd === -1 ? text.length : commentEnd + 2;
      currentLine += (text.slice(position, blockEnd).match(/\n/g) || []).length;
      position = blockEnd;
      continue;
    }

    // Quoted strings and identifiers. A doubled quote ('') or a backslash escape stays inside.
    if (character === "'" || character === '"' || character === '`') {
      markStatementHasCode();
      const quoteCharacter = character;
      position += 1;
      while (position < text.length) {
        const quotedCharacter = text[position];
        if (quotedCharacter === '\n') currentLine += 1;
        if (quotedCharacter === '\\' && quoteCharacter !== '`') {
          if (text[position + 1] === '\n') currentLine += 1;
          position += 2;
          continue;
        }
        if (quotedCharacter === quoteCharacter) {
          if (text[position + 1] === quoteCharacter) {
            position += 2;
            continue;
          }
          position += 1;
          break;
        }
        position += 1;
      }
      continue;
    }

    if (!/\s/.test(character)) markStatementHasCode();
    position += 1;
  }

  pushStatement(text.length);
  return statements;
}
