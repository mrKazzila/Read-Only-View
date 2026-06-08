import assert from 'node:assert/strict';
import test from 'node:test';

import {
	renderModeSelector,
	updateBooleanSetting,
} from '../src/settings-general.js';
import { DEFAULT_SETTINGS } from '../src/plugin-settings.js';
import type { SettingsTabPlugin } from '../src/plugin-types.js';
import { installDomMocks, MockHTMLElement } from './helpers/dom-mocks.js';

function createPlugin(): SettingsTabPlugin & {
	saveCalls: number;
	applyReasons: string[];
	refreshCalls: number;
} {
	const plugin = {
		settings: { ...DEFAULT_SETTINGS },
		saveCalls: 0,
		applyReasons: [] as string[],
		refreshCalls: 0,
		saveSettings: async () => {
			plugin.saveCalls += 1;
		},
		applyAllOpenMarkdownLeaves: async (reason: string) => {
			plugin.applyReasons.push(reason);
		},
		refreshEditorOptions: () => {
			plugin.refreshCalls += 1;
		},
	};

	return plugin;
}

function collectTexts(root: MockHTMLElement): string[] {
	return [root.textContent, ...root.getChildren().flatMap((child) => collectTexts(child))]
		.filter((value) => value.length > 0);
}

test('general settings update saves and re-applies when enabling the plugin', async () => {
	const plugin = createPlugin();
	let refreshCalls = 0;

	await updateBooleanSetting(plugin, 'enabled', true, () => {
		refreshCalls += 1;
	}, 'settings-enabled');

	assert.equal(plugin.settings.enabled, true);
	assert.equal(plugin.saveCalls, 1);
	assert.deepEqual(plugin.applyReasons, ['settings-enabled']);
	assert.equal(plugin.refreshCalls, 1);
	assert.equal(refreshCalls, 1);
});

test('general settings update saves without re-applying when disabling the plugin', async () => {
	const plugin = createPlugin();
	plugin.settings.enabled = true;

	await updateBooleanSetting(plugin, 'enabled', false, () => undefined, 'settings-enabled');

	assert.equal(plugin.settings.enabled, false);
	assert.equal(plugin.saveCalls, 1);
	assert.deepEqual(plugin.applyReasons, []);
	assert.equal(plugin.refreshCalls, 1);
});

test('general settings update re-applies for matching-related toggles', async () => {
	const plugin = createPlugin();

	await updateBooleanSetting(plugin, 'useGlobPatterns', true, () => undefined, 'settings-use-glob-patterns');

	assert.equal(plugin.settings.useGlobPatterns, true);
	assert.equal(plugin.saveCalls, 1);
	assert.deepEqual(plugin.applyReasons, ['settings-use-glob-patterns']);
	assert.equal(plugin.refreshCalls, 1);
});

test('general settings update re-applies for all-Markdown preset toggle', async () => {
	const plugin = createPlugin();

	await updateBooleanSetting(
		plugin,
		'forceAllMarkdownReadOnly',
		false,
		() => undefined,
		'settings-force-all-markdown-read-only',
	);

	assert.equal(plugin.settings.forceAllMarkdownReadOnly, false);
	assert.equal(plugin.saveCalls, 1);
	assert.deepEqual(plugin.applyReasons, ['settings-force-all-markdown-read-only']);
	assert.equal(plugin.refreshCalls, 1);
});

test('general settings update re-applies for case-sensitive toggle and refreshes after save', async () => {
	const plugin = createPlugin();
	const callOrder: string[] = [];
	plugin.saveSettings = async () => {
		callOrder.push('save');
	};

	await updateBooleanSetting(plugin, 'caseSensitive', false, () => {
		callOrder.push('refresh');
	}, 'settings-case-sensitive');

	assert.equal(plugin.settings.caseSensitive, false);
	assert.deepEqual(plugin.applyReasons, ['settings-case-sensitive']);
	assert.equal(plugin.refreshCalls, 1);
	assert.deepEqual(callOrder, ['save', 'refresh']);
});

test('general settings update saves debug toggles without re-applying leaves', async () => {
	const plugin = createPlugin();

	await updateBooleanSetting(plugin, 'debugVerbosePaths', true, () => undefined);

	assert.equal(plugin.settings.debugVerbosePaths, true);
	assert.equal(plugin.saveCalls, 1);
	assert.deepEqual(plugin.applyReasons, []);
	assert.equal(plugin.refreshCalls, 0);
});

test('general settings update saves debug toggle without re-applying leaves', async () => {
	const plugin = createPlugin();

	await updateBooleanSetting(plugin, 'debug', true, () => undefined);

	assert.equal(plugin.settings.debug, true);
	assert.equal(plugin.saveCalls, 1);
	assert.deepEqual(plugin.applyReasons, []);
	assert.equal(plugin.refreshCalls, 0);
});

test('mode selector renders priority copy and highlights the selected mode', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const plugin = createPlugin();

	try {
		renderModeSelector(container as unknown as HTMLElement, plugin, () => undefined);

		const texts = collectTexts(container);
		assert.ok(texts.includes('Mode'));
		assert.ok(texts.includes('Only matched paths'));
		assert.ok(texts.includes('All Markdown files'));
		assert.ok(texts.includes('Exclude rules always win.'));
		assert.ok(texts.includes('Priority: Exclude rules → all Markdown files mode → include rules.'));

		const selectedOption = container.querySelector('.is-selected');
		assert.ok(selectedOption);
		assert.ok(collectTexts(selectedOption).includes('All Markdown files'));
	} finally {
		dom.restore();
	}
});

test('mode selector shows the global warning when all-Markdown mode is enabled', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const plugin = createPlugin();

	try {
		plugin.settings.forceAllMarkdownReadOnly = true;
		renderModeSelector(container as unknown as HTMLElement, plugin, () => undefined);

		assert.ok(collectTexts(container).includes('All Markdown files mode is enabled'));
	} finally {
		dom.restore();
	}
});
