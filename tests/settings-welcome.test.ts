import assert from 'node:assert/strict';
import test from 'node:test';

import { App } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/plugin-settings.js';
import {
	maybeShowWelcomeModal,
	openPluginSettingsBestEffort,
	WELCOME_VERSION,
	shouldShowWelcomeModal,
} from '../src/settings-welcome.js';
import { installDomMocks, MockHTMLElement } from './helpers/dom-mocks.js';

function createPlugin() {
	let saveCalls = 0;
	return {
		plugin: {
			settings: {
				...DEFAULT_SETTINGS,
				dismissedWelcomeVersion: 0,
			},
			saveSettings: async () => {
				saveCalls += 1;
			},
		},
		getSaveCalls: () => saveCalls,
	};
}

function findButtonByText(root: MockHTMLElement, text: string): MockHTMLElement | null {
	return root.querySelectorAll('button').find((button) => button.textContent === text) ?? null;
}

test('welcome modal should show only when current version is not dismissed', () => {
	assert.equal(shouldShowWelcomeModal({
		...DEFAULT_SETTINGS,
		dismissedWelcomeVersion: 0,
	}), true);
	assert.equal(shouldShowWelcomeModal({
		...DEFAULT_SETTINGS,
		dismissedWelcomeVersion: WELCOME_VERSION,
	}), false);
	assert.equal(shouldShowWelcomeModal({
		...DEFAULT_SETTINGS,
		dismissedWelcomeVersion: WELCOME_VERSION + 1,
	}), false);
});

test('maybeShowWelcomeModal returns null when current welcome version is already dismissed', () => {
	const dom = installDomMocks();
	const { plugin } = createPlugin();
	plugin.settings.dismissedWelcomeVersion = WELCOME_VERSION;

	try {
		const modal = maybeShowWelcomeModal(new App(), plugin, 'read-only-view');
		assert.equal(modal, null);
	} finally {
		dom.restore();
	}
});

test('welcome modal close button saves dismissal state for current version', async () => {
	const dom = installDomMocks();
	const { plugin, getSaveCalls } = createPlugin();

	try {
		const modal = maybeShowWelcomeModal(new App(), plugin, 'read-only-view');
		assert.ok(modal);

		const closeButton = findButtonByText(modal.contentEl as unknown as MockHTMLElement, 'Close');
		assert.ok(closeButton);
		closeButton.trigger('click');
		await Promise.resolve();
		await Promise.resolve();

		assert.equal(plugin.settings.dismissedWelcomeVersion, WELCOME_VERSION);
		assert.equal(getSaveCalls(), 1);
	} finally {
		dom.restore();
	}
});

test('welcome modal open settings button saves dismissal state and opens settings when available', async () => {
	const dom = installDomMocks();
	const { plugin, getSaveCalls } = createPlugin();
	const app = new App() as App & {
		setting: {
			openCalls: number;
			openTabCalls: string[];
			open: () => void;
			openTabById: (id: string) => void;
		};
	};
	app.setting = {
		openCalls: 0,
		openTabCalls: [],
		open() {
			this.openCalls += 1;
		},
		openTabById(id: string) {
			this.openTabCalls.push(id);
		},
	};

	try {
		const modal = maybeShowWelcomeModal(app, plugin, 'read-only-view');
		assert.ok(modal);

		const openButton = findButtonByText(modal.contentEl as unknown as MockHTMLElement, 'Open settings');
		assert.ok(openButton);
		openButton.trigger('click');
		await Promise.resolve();
		await Promise.resolve();

		assert.equal(plugin.settings.dismissedWelcomeVersion, WELCOME_VERSION);
		assert.equal(getSaveCalls(), 1);
		assert.equal(app.setting.openCalls, 1);
		assert.deepEqual(app.setting.openTabCalls, ['read-only-view']);
	} finally {
		dom.restore();
	}
});

test('openPluginSettingsBestEffort is a no-op when settings api is unavailable', () => {
	assert.doesNotThrow(() => {
		openPluginSettingsBestEffort(new App(), 'read-only-view');
	});
});
