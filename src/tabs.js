import { sanitizeTabName } from './session-file.js';

// Tab bar for SQL scripts. Each tab: { name, editorState }. The editor shows the active tab's state.
// editor: the object returned by createSqlEditor. onChange(): called whenever tabs are added, removed,
// renamed or switched, so the caller can autosave.
export function createTabManager({ container, editor, onChange }) {
  let tabs = [];
  let activeTabIndex = 0;

  function uniqueTabName(desiredName) {
    const baseName = sanitizeTabName(desiredName);
    const takenNames = new Set(tabs.map((tab) => tab.name));
    if (!takenNames.has(baseName)) return baseName;
    const extensionMatch = baseName.match(/^(.*?)(\.sql)?$/i);
    const stem = extensionMatch[1];
    const extension = extensionMatch[2] ?? '';
    for (let copyNumber = 2; ; copyNumber += 1) {
      const candidateName = `${stem}-${copyNumber}${extension}`;
      if (!takenNames.has(candidateName)) return candidateName;
    }
  }

  // The active tab's state lives in the editor view; copy it back before reading or switching.
  function saveActiveEditorState() {
    if (tabs[activeTabIndex]) tabs[activeTabIndex].editorState = editor.getCurrentState();
  }

  function render() {
    const tabButtons = tabs.map((tab, tabIndex) => {
      const tabElement = document.createElement('div');
      tabElement.className = tabIndex === activeTabIndex ? 'tab tab-active' : 'tab';
      tabElement.setAttribute('role', 'tab');
      tabElement.setAttribute('aria-selected', String(tabIndex === activeTabIndex));

      const nameButton = document.createElement('button');
      nameButton.type = 'button';
      nameButton.className = 'tab-name';
      nameButton.textContent = tab.name;
      nameButton.title = 'Double-click to rename';
      nameButton.addEventListener('click', () => switchToTab(tabIndex));
      nameButton.addEventListener('dblclick', () => renameTab(tabIndex));
      tabElement.append(nameButton);

      if (tabs.length > 1) {
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'tab-close';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', `Close ${tab.name}`);
        closeButton.addEventListener('click', () => closeTab(tabIndex));
        tabElement.append(closeButton);
      }
      return tabElement;
    });

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'tab-add';
    addButton.textContent = '+';
    addButton.setAttribute('aria-label', 'New tab');
    addButton.addEventListener('click', () => addTab({ name: 'query.sql', sql: '' }));

    container.replaceChildren(...tabButtons, addButton);
  }

  function switchToTab(tabIndex) {
    if (tabIndex === activeTabIndex || !tabs[tabIndex]) return;
    saveActiveEditorState();
    activeTabIndex = tabIndex;
    editor.showTabState(tabs[activeTabIndex].editorState);
    render();
    onChange();
  }

  function addTab({ name, sql }) {
    saveActiveEditorState();
    tabs.push({ name: uniqueTabName(name), editorState: editor.createTabState(sql) });
    activeTabIndex = tabs.length - 1;
    editor.showTabState(tabs[activeTabIndex].editorState);
    render();
    onChange();
    editor.focus();
  }

  function renameTab(tabIndex) {
    const currentName = tabs[tabIndex].name;
    const requestedName = window.prompt('Rename tab', currentName);
    if (requestedName === null) return;
    const sanitizedName = sanitizeTabName(requestedName, currentName);
    if (sanitizedName === currentName) return;
    tabs[tabIndex].name = uniqueTabName(sanitizedName);
    render();
    onChange();
  }

  function closeTab(tabIndex) {
    if (tabs.length <= 1) return;
    saveActiveEditorState();
    const tabHasText = tabs[tabIndex].editorState.doc.length > 0;
    if (tabHasText && !window.confirm(`Close ${tabs[tabIndex].name}? Its SQL will be removed from this session.`)) return;
    tabs.splice(tabIndex, 1);
    if (activeTabIndex >= tabs.length || tabIndex < activeTabIndex) activeTabIndex = Math.max(0, activeTabIndex - 1);
    editor.showTabState(tabs[activeTabIndex].editorState);
    render();
    onChange();
  }

  return {
    // Replace every tab, e.g. when loading a session file. tabSpecs: [{ name, sql }].
    replaceTabs(tabSpecs, newActiveTabIndex = 0) {
      const usedNames = new Set();
      tabs = tabSpecs.map((tabSpec) => {
        let name = sanitizeTabName(tabSpec.name);
        for (let copyNumber = 2; usedNames.has(name); copyNumber += 1) name = `${sanitizeTabName(tabSpec.name)}-${copyNumber}`;
        usedNames.add(name);
        return { name, editorState: editor.createTabState(tabSpec.sql) };
      });
      if (tabs.length === 0) tabs = [{ name: 'query.sql', editorState: editor.createTabState('') }];
      activeTabIndex = Math.min(Math.max(newActiveTabIndex, 0), tabs.length - 1);
      editor.showTabState(tabs[activeTabIndex].editorState);
      render();
    },
    addTab,
    // Snapshot for saving: { tabs: [{ name, sql }], activeTabIndex }.
    getSnapshot() {
      saveActiveEditorState();
      return {
        tabs: tabs.map((tab) => ({ name: tab.name, sql: tab.editorState.doc.toString() })),
        activeTabIndex,
      };
    },
    getActiveTabName: () => tabs[activeTabIndex]?.name ?? '',
  };
}
