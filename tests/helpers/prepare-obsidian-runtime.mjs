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
