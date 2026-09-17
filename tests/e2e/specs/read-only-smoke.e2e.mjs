/* eslint-disable no-undef, obsidianmd/prefer-active-doc -- Webdriver executes this code inside the active Obsidian test window. */
import assert from 'node:assert/strict';

import {
	assertModeRemains,
	getVaultBasePath,
	getVaultName,
	isPluginEnabled,
	openMarkdownFile,
	setActiveMarkdownMode,
	testOverlimitPathInput,
	testPathInPluginSettings,
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

	it('keeps settings cards aligned with compact, even gaps', async () => {
		await browser.execute(() => {
			const electron = globalThis.require?.('electron');
			electron?.remote?.getCurrentWindow?.().setSize?.(1800, 1200);
		});
		await browser.pause(250);
		const snapshot = await browser.execute(() => {
			globalThis.app?.setting?.open?.();
			globalThis.app?.setting?.openTabById?.('read-only-view');
			const cards = Array.from(document.querySelectorAll(
				'.read-only-view-header-card, .read-only-view-section-card',
			));
			return cards.map((card) => {
				const rect = card.getBoundingClientRect();
				return { top: rect.top, bottom: rect.bottom, width: rect.width };
			});
		});
		assert.ok(snapshot.length >= 5);

		const expectedWidth = snapshot[0].width;
		assert.ok(snapshot.every(({ width }) => Math.abs(width - expectedWidth) < 0.5));
		const gaps = snapshot.slice(1).map(({ top }, index) => top - snapshot[index].bottom);
		assert.ok(gaps[1] > 10 && gaps[1] <= 18);
		assert.ok(gaps.filter((_, index) => index !== 1).every((gap) => gap > 0 && gap <= 10));
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

	it('keeps a note imported from an Obsidian URL in Reading view', async () => {
		await openMarkdownFile('Inbox/Quick capture.md');
		await waitForMode('preview');

		await setActiveMarkdownMode('source');
		await waitForMode('preview');
	});

	it('resolves a copied Obsidian URL in Path tester', async () => {
		const result = await testPathInPluginSettings(
			'obsidian://open?vault=demo-vault&file=Knowledge%20Base%2FProgramming%2FPython%2FAsync%20IO%20notes',
		);
		assert.match(result, /Detected source: obsidian-uri/);
		assert.match(result, /Resolved path: Knowledge Base\/Programming\/Python\/Async IO notes\.md/);
	});

	it('resolves a copied system folder path in Path tester', async () => {
		const vaultBasePath = await getVaultBasePath();
		assert.ok(vaultBasePath);
		const result = await testPathInPluginSettings(
			`${vaultBasePath}/Knowledge Base/Productivity/`,
		);
		assert.match(result, /Detected source: absolute-path/);
		assert.match(result, /Resolved folder: Knowledge Base\/Productivity\//);
	});

	it('blocks an over-limit Path tester value with an accessible error', async () => {
		const result = await testOverlimitPathInput(40_001);
		assert.deepEqual(result, {
			length: 40_000,
			ariaInvalid: 'true',
			hasErrorClass: true,
			resultText: 'Input is too long. Maximum: 40,000 characters.',
		});
	});

	it('keeps a note imported from a system path in Reading view', async () => {
		await openMarkdownFile('Inbox/Meeting recap.md');
		await waitForMode('preview');

		await setActiveMarkdownMode('source');
		await waitForMode('preview');
	});

	it('keeps a note outside the include rules editable', async () => {
		await openMarkdownFile('Inbox/Idea parking lot.md');

		await setActiveMarkdownMode('source');
		await waitForMode('source');
		await assertModeRemains('source');
	});
});
