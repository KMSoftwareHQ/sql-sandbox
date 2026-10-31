import { basicSetup, EditorView } from 'codemirror';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { sql, SQLite, PostgreSQL, MariaSQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';

const SQL_DIALECTS = { sqlite: SQLite, postgres: PostgreSQL, mysql: MariaSQL };

// One SQL editor view shared by all tabs. Each tab owns an EditorState (text, selection, undo history);
// switching tabs swaps the state into the view. Theme and dialect live in compartments shared by every state.
export function createSqlEditor({ parent, themeName, engineName, onChange, onRun }) {
  const themeCompartment = new Compartment();
  const dialectCompartment = new Compartment();
  let currentThemeName = themeName;
  let currentEngineName = engineName;

  const themeExtension = (name) => (name === 'dark' ? oneDark : []);
  const dialectExtension = (name) => sql({ dialect: SQL_DIALECTS[name] ?? SQLite });

  const sharedExtensions = [
    Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { onRun(); return true; } }])),
    basicSetup,
    dialectCompartment.of(dialectExtension(currentEngineName)),
    themeCompartment.of(themeExtension(currentThemeName)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange();
    }),
  ];

  const editorView = new EditorView({ parent, state: EditorState.create({ doc: '', extensions: sharedExtensions }) });

  // A state created earlier may carry an old theme or dialect; bring it up to date.
  function applyCurrentConfiguration() {
    editorView.dispatch({
      effects: [
        themeCompartment.reconfigure(themeExtension(currentThemeName)),
        dialectCompartment.reconfigure(dialectExtension(currentEngineName)),
      ],
    });
  }

  return {
    createTabState: (text) => EditorState.create({ doc: text, extensions: sharedExtensions }),
    showTabState: (tabState) => {
      editorView.setState(tabState);
      applyCurrentConfiguration();
    },
    getCurrentState: () => editorView.state,
    getText: () => editorView.state.doc.toString(),
    // The selected text, or '' when nothing is selected.
    getSelectedText: () => {
      const { from, to } = editorView.state.selection.main;
      return editorView.state.sliceDoc(from, to);
    },
    insertTextAtCursor: (text) => {
      const { from, to } = editorView.state.selection.main;
      editorView.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
      editorView.focus();
    },
    focus: () => editorView.focus(),
    setTheme: (name) => {
      currentThemeName = name;
      applyCurrentConfiguration();
    },
    setEngine: (name) => {
      currentEngineName = name;
      applyCurrentConfiguration();
    },
  };
}
