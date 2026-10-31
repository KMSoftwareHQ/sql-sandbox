// Splits a MySQL script into statements, like the mysql command-line client does.
//
// - Statements end at the current delimiter (default ";") outside quotes and comments.
// - `DELIMITER <token>` lines change the delimiter (needed for stored procedures and triggers);
//   they are client commands and are not sent to the server.
// - Quotes ('...', "...", `...`), backslash escapes inside quotes, and comments (-- , #, /* */)
//   are respected, so a delimiter inside them does not end a statement.
//
// Returns [{ sql, line }] where line is the 1-based line the statement starts on.

const DELIMITER_COMMAND_PATTERN = /^[ \t]*delimiter[ \t]+(\S+)[ \t]*$/i;

function isLineStart(sqlText, position) {
  return position === 0 || sqlText[position - 1] === '\n';
}

export function splitMysqlScript(sqlText) {
  const text = String(sqlText ?? '').replace(/\r\n?/g, '\n');
  const statements = [];
  let delimiter = ';';
  let statementStart = 0;
  let statementStartLine = 1;
  let currentLine = 1;
  let position = 0;
  // False while the current statement holds only whitespace and comments; such fragments are not sent.
  let statementHasCode = false;

  function pushStatement(endPosition) {
    const statementText = text.slice(statementStart, endPosition).trim();
    if (statementHasCode) {
      // Count leading blank lines so `line` points at the statement's first real character.
      const leadingText = text.slice(statementStart, endPosition);
      const leadingNewlines = (leadingText.slice(0, leadingText.length - leadingText.trimStart().length).match(/\n/g) || []).length;
      statements.push({ sql: statementText, line: statementStartLine + leadingNewlines });
    }
  }

  while (position < text.length) {
    const character = text[position];
    const nextCharacter = text[position + 1];

    // DELIMITER command: only recognized at the start of a line, between statements.
    if (isLineStart(text, position) && !statementHasCode) {
      const lineEnd = text.indexOf('\n', position) === -1 ? text.length : text.indexOf('\n', position);
      const delimiterMatch = text.slice(position, lineEnd).match(DELIMITER_COMMAND_PATTERN);
      if (delimiterMatch) {
        delimiter = delimiterMatch[1];
        position = lineEnd;
        statementStart = lineEnd;
        statementStartLine = currentLine;
        statementHasCode = false;
        continue;
      }
    }

    if (character === '\n') {
      currentLine += 1;
      position += 1;
      continue;
    }

    // Line comments: "-- " (dash dash whitespace) and "#".
    if ((character === '-' && nextCharacter === '-' && /\s/.test(text[position + 2] ?? '\n')) || character === '#') {
      const lineEnd = text.indexOf('\n', position);
      position = lineEnd === -1 ? text.length : lineEnd;
      continue;
    }

    // Block comments.
    if (character === '/' && nextCharacter === '*') {
      const commentEnd = text.indexOf('*/', position + 2);
      const blockEnd = commentEnd === -1 ? text.length : commentEnd + 2;
      currentLine += (text.slice(position, blockEnd).match(/\n/g) || []).length;
      position = blockEnd;
      continue;
    }

    // Quoted strings and identifiers. A doubled quote ('') or a backslash escape stays inside.
    if (character === "'" || character === '"' || character === '`') {
      statementHasCode = true;
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

    if (text.startsWith(delimiter, position)) {
      pushStatement(position);
      position += delimiter.length;
      statementStart = position;
      statementStartLine = currentLine;
      statementHasCode = false;
      continue;
    }

    if (!/\s/.test(character)) statementHasCode = true;
    position += 1;
  }

  pushStatement(text.length);
  return statements;
}
