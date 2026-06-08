/* eslint-disable no-undef */
import assert from 'node:assert/strict';

import {
	assertModeRemains,
	getVaultName,
	isPluginEnabled,
	openMarkdownFile,
	setActiveMarkdownMode,
	waitForMode,
	waitForPluginEnabled,
	waitForVaultReady,
} from '../helpers/obsidian-app.mjs';

describe('Read Only View desktop smoke tests', () => {
	it('loads the plugin in the generated demo vault', async () => {
		await waitForVaultReady();
		await waitForPluginEnabled('read-only-view');

		assert.equal(await getVaultName(), 'demo-vault');
		assert.equal(await isPluginEnabled('read-only-view'), true);
	});

	it('keeps a protected note in Reading view', async () => {
		await openMarkdownFile('Read Only/Docs/API overview.md');
		await waitForMode('preview');

		await setActiveMarkdownMode('source');
		await waitForMode('preview');
	});

	it('keeps an excluded draft editable', async () => {
		await openMarkdownFile('Read Only/Drafts/Editable draft.md');

		await setActiveMarkdownMode('source');
		await waitForMode('source');
		await assertModeRemains('source');
	});

	it('keeps a note outside the include rules editable', async () => {
		await openMarkdownFile('Inbox/Quick capture.md');

		await setActiveMarkdownMode('source');
		await waitForMode('source');
		await assertModeRemains('source');
	});
});
