import { basicSetup, EditorView } from 'codemirror';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { sql, SQLite, PostgreSQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';

const SQL_DIALECTS = { sqlite: SQLite, postgres: PostgreSQL };

// Creates one SQL editor. Theme and SQL dialect live in compartments so they can change later.
export function createSqlEditor({ parent, initialText, themeName, engineName, onChange, onRun }) {
  const themeCompartment = new Compartment();
  const dialectCompartment = new Compartment();

  const themeExtension = (name) => (name === 'dark' ? oneDark : []);
  const dialectExtension = (name) => sql({ dialect: SQL_DIALECTS[name] ?? SQLite });

  const editorView = new EditorView({
    parent,
    state: EditorState.create({
      doc: initialText,
      extensions: [
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { onRun(); return true; } }])),
        basicSetup,
        dialectCompartment.of(dialectExtension(engineName)),
        themeCompartment.of(themeExtension(themeName)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange();
        }),
      ],
    }),
  });

  return {
    getText: () => editorView.state.doc.toString(),
    setText: (text) => {
      editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: text } });
    },
    setTheme: (name) => editorView.dispatch({ effects: themeCompartment.reconfigure(themeExtension(name)) }),
    setEngine: (name) => editorView.dispatch({ effects: dialectCompartment.reconfigure(dialectExtension(name)) }),
  };
}
