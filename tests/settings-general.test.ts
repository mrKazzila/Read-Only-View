import assert from 'node:assert/strict';
import test from 'node:test';

import { updateBooleanSetting } from '../src/settings-general.js';
import { DEFAULT_SETTINGS } from '../src/plugin-settings.js';
import type { SettingsTabPlugin } from '../src/plugin-types.js';

function createPlugin(): SettingsTabPlugin & {
	saveCalls: number;
	applyReasons: string[];
} {
	const plugin = {
		settings: { ...DEFAULT_SETTINGS },
		saveCalls: 0,
		applyReasons: [] as string[],
		saveSettings: async () => {
			plugin.saveCalls += 1;
		},
		applyAllOpenMarkdownLeaves: async (reason: string) => {
			plugin.applyReasons.push(reason);
		},
	};

	return plugin;
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
	assert.equal(refreshCalls, 1);
});

test('general settings update saves without re-applying when disabling the plugin', async () => {
	const plugin = createPlugin();
	plugin.settings.enabled = true;

	await updateBooleanSetting(plugin, 'enabled', false, () => undefined, 'settings-enabled');

	assert.equal(plugin.settings.enabled, false);
	assert.equal(plugin.saveCalls, 1);
	assert.deepEqual(plugin.applyReasons, []);
});

test('general settings update re-applies for matching-related toggles', async () => {
	const plugin = createPlugin();

	await updateBooleanSetting(plugin, 'useGlobPatterns', true, () => undefined, 'settings-use-glob-patterns');

	assert.equal(plugin.settings.useGlobPatterns, true);
	assert.equal(plugin.saveCalls, 1);
	assert.deepEqual(plugin.applyReasons, ['settings-use-glob-patterns']);
});

test('general settings update saves debug toggles without re-applying leaves', async () => {
	const plugin = createPlugin();

	await updateBooleanSetting(plugin, 'debugVerbosePaths', true, () => undefined);

	assert.equal(plugin.settings.debugVerbosePaths, true);
	assert.equal(plugin.saveCalls, 1);
	assert.deepEqual(plugin.applyReasons, []);
});
