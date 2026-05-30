import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.join(scriptDir, '..', '..', 'build-tests', 'node_modules', 'obsidian');

await mkdir(runtimeDir, { recursive: true });
await writeFile(
	path.join(scriptDir, '..', '..', 'build-tests', 'package.json'),
	JSON.stringify({
		type: 'module',
	}, null, 2),
	'utf8',
);
await writeFile(
	path.join(runtimeDir, 'package.json'),
	JSON.stringify({
		name: 'obsidian',
		version: '0.0.0-test-runtime',
		type: 'module',
		main: './index.js',
	}, null, 2),
	'utf8',
);

const runtimeSource = `import { StateField } from '@codemirror/state';

let editorInfoValue = null;

export function __setEditorInfo(value) {
  editorInfoValue = value;
}

export class App {
  constructor() {
    this.setting = undefined;
  }
}
export class WorkspaceLeaf {}
export class MarkdownView {}
export const editorInfoField = StateField.define({
  create() {
    return editorInfoValue;
  },
  update() {
    return editorInfoValue;
  },
});
export class Plugin {
  constructor(app = new App(), manifest = { id: 'read-only-view' }) {
    this.app = app;
    this.manifest = manifest;
    this.editorExtensions = [];
  }
  addCommand() {}
  registerEvent() {}
  registerEditorExtension(extension) {
    this.editorExtensions.push(extension);
  }
  addSettingTab() {}
}
export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty() {},
      addClass() {},
      createDiv() { return this; },
      createEl() { return this; },
      querySelectorAll() { return []; },
    };
  }
}
export class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = typeof document !== 'undefined' && document?.body?.createDiv
      ? document.body.createDiv()
      : {
        empty() {},
        addClass() {},
        createEl() { return this; },
        createDiv() { return this; },
      };
    this.opened = false;
  }
  onOpen() {}
  onClose() {}
  open() {
    this.opened = true;
    this.onOpen();
  }
  close() {
    this.opened = false;
    this.onClose();
  }
}
export class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.settingEl = containerEl?.createDiv ? containerEl.createDiv({ cls: 'setting-item' }) : containerEl;
  }
  setName(name) {
    this.settingEl?.createEl?.('div', { text: name, cls: 'setting-item-name' });
    return this;
  }
  setHeading() { return this; }
  setDesc(desc) {
    this.settingEl?.createEl?.('div', { text: desc, cls: 'setting-item-description' });
    return this;
  }
  addToggle(cb) {
    const toggle = {
      value: false,
      onChangeHandler: () => undefined,
      setValue(value) {
        this.value = value;
        return this;
      },
      onChange(handler) {
        this.onChangeHandler = handler;
        return this;
      },
    };
    cb(toggle);
    this.settingEl?.createEl?.('div', { text: String(toggle.value), cls: 'setting-item-toggle' });
    return this;
  }
  addTextArea() { return this; }
}
export class ToggleComponent {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.value = false;
    this.onChangeHandler = () => undefined;
    this.toggleEl = containerEl?.createDiv ? containerEl.createDiv({ cls: 'checkbox-container' }) : containerEl;
  }
  setValue(value) {
    this.value = value;
    return this;
  }
  getValue() {
    return this.value;
  }
  setDisabled() {
    return this;
  }
  setTooltip() {
    return this;
  }
  onClick() {
    this.onChangeHandler(!this.value);
  }
  onChange(handler) {
    this.onChangeHandler = handler;
    return this;
  }
}
`;

await writeFile(path.join(runtimeDir, 'index.js'), runtimeSource, 'utf8');

const buildSrcDir = path.join(scriptDir, '..', '..', 'build-tests', 'src');
const buildSrcEntries = await readdir(buildSrcDir, { withFileTypes: true });

for (const entry of buildSrcEntries) {
	if (!entry.isFile() || !entry.name.endsWith('.js')) {
		continue;
	}

	const filePath = path.join(buildSrcDir, entry.name);
	const source = await readFile(filePath, 'utf8');
	const patchedSource = source.replace(
		/(from\s+['"])(\.\.?\/[^'".]+)(['"])/g,
		(_match, before, importPath, after) => `${before}${importPath}.js${after}`,
	);
	await writeFile(filePath, patchedSource, 'utf8');
}
