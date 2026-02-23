import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

const runtimeSource = `export class App {}
export class WorkspaceLeaf {}
export class MarkdownView {}
export class Plugin {
  constructor(app = new App()) {
    this.app = app;
  }
  addCommand() {}
  registerEvent() {}
  addSettingTab() {}
}
export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty() {},
      createDiv() { return this.containerEl; },
      createEl() { return this.containerEl; },
      querySelectorAll() { return []; },
    };
  }
}
export class Setting {
  constructor() {}
  setName() { return this; }
  setHeading() { return this; }
  setDesc() { return this; }
  addToggle() { return this; }
  addTextArea() { return this; }
}
`;

await writeFile(path.join(runtimeDir, 'index.js'), runtimeSource, 'utf8');

const mainPath = path.join(scriptDir, '..', '..', 'build-tests', 'src', 'main.js');
const mainSource = await readFile(mainPath, 'utf8');
const patchedMainSource = mainSource
	.replace("'./matcher'", "'./matcher.js'")
	.replace("'./command-controls'", "'./command-controls.js'")
	.replace("'./enforcement'", "'./enforcement.js'")
	.replace("'./popover-observer'", "'./popover-observer.js'")
	.replace("'./settings-tab'", "'./settings-tab.js'");
await writeFile(mainPath, patchedMainSource, 'utf8');

const enforcementPath = path.join(scriptDir, '..', '..', 'build-tests', 'src', 'enforcement.js');
const enforcementSource = await readFile(enforcementPath, 'utf8');
const patchedEnforcementSource = enforcementSource
	.replace("'./matcher'", "'./matcher.js'");
await writeFile(enforcementPath, patchedEnforcementSource, 'utf8');

const settingsTabPath = path.join(scriptDir, '..', '..', 'build-tests', 'src', 'settings-tab.js');
const settingsTabSource = await readFile(settingsTabPath, 'utf8');
const patchedSettingsTabSource = settingsTabSource
	.replace("'./matcher'", "'./matcher.js'")
	.replace("'./rule-diagnostics'", "'./rule-diagnostics.js'");
await writeFile(settingsTabPath, patchedSettingsTabSource, 'utf8');

const ruleDiagnosticsPath = path.join(scriptDir, '..', '..', 'build-tests', 'src', 'rule-diagnostics.js');
const ruleDiagnosticsSource = await readFile(ruleDiagnosticsPath, 'utf8');
const patchedRuleDiagnosticsSource = ruleDiagnosticsSource
	.replace("'./matcher'", "'./matcher.js'");
await writeFile(ruleDiagnosticsPath, patchedRuleDiagnosticsSource, 'utf8');
