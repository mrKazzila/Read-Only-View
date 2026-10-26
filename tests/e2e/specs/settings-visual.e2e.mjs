/* eslint-disable no-undef, obsidianmd/prefer-active-doc -- Runs in the synthetic desktop host. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertSyntheticVault, closePluginSettings, openPluginSettings, waitForVaultReady, waitForPluginEnabled } from '../helpers/obsidian-app.mjs';

// Opt-in artifacts for human before/after review, not a pixel-diff pass claim.
const label = process.env.E2E_VISUAL_LABEL;
(label ? describe : describe.skip)('Settings visual comparison artifacts', () => {
	it('captures matching theme, width and disclosure states', async () => {
		assert.match(label, /^[a-zA-Z0-9_-]+$/);
		await waitForVaultReady();
		await assertSyntheticVault();
		await waitForPluginEnabled('read-only-view');
		const output = path.join(process.cwd(), '.tmp', 'wdio-artifacts', label);
		await fs.mkdir(output, { recursive: true });
		await openPluginSettings();
		const original = await browser.execute(() => ({
			light: document.body.classList.contains('theme-light'),
		}));
		const originalSize = await browser.execute(() => {
			const win = globalThis.require('electron').remote.getCurrentWindow();
			return win.getSize();
		});
		try {
			for (const width of [1400, 600]) {
				await browser.execute((size) => {
					globalThis.require('electron').remote.getCurrentWindow().setSize(size, 1000);
				}, width);
				for (const theme of ['light', 'dark']) {
					await browser.execute((value) => {
						document.body.classList.toggle('theme-light', value === 'light');
						document.body.classList.toggle('theme-dark', value === 'dark');
					}, theme);
					for (const expanded of [false, true]) {
						const metadata = await browser.execute((open) => {
							const toggles = Array.from(document.querySelectorAll('.read-only-view-disclosure-toggle'));
							for (const toggle of toggles) {
								if ((toggle.getAttribute('aria-expanded') === 'true') !== open) toggle.click();
							}
							const cards = document.querySelectorAll('.read-only-view-header-card, .read-only-view-section-card');
							return {
								branch: document.querySelector('.read-only-view-declarative-setting') ? 'declarative' : 'legacy',
								cards: cards.length,
								disclosures: toggles.map((toggle) => toggle.getAttribute('aria-expanded')),
								viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
							};
						}, expanded);
						assert.ok(metadata.cards >= 5);
						const stem = `${metadata.branch}-${width}-${theme}-${expanded ? 'expanded' : 'collapsed'}`;
						await fs.writeFile(path.join(output, `${stem}.json`), JSON.stringify(metadata, null, 2));
						// Overlapping scroll positions cover tall cards as well as their headings.
						const scroll = await browser.execute(() => {
							const pane = document.querySelector('.vertical-tab-content');
							if (!pane) throw new Error('Settings scroll pane unavailable');
							return { height: pane.clientHeight, maximum: pane.scrollHeight - pane.clientHeight };
						});
						assert.ok(scroll.height > 0);
						const step = Math.max(1, Math.floor(scroll.height * 0.8));
						for (let offset = 0; offset < scroll.maximum + step; offset += step) {
							await browser.execute((top) => {
								document.querySelector('.vertical-tab-content').scrollTop = top;
							}, Math.min(offset, scroll.maximum));
							await browser.saveScreenshot(path.join(output, `${stem}-${offset}.png`));
						}

					}
				}
			}
		} finally {
			await browser.execute((light) => {
				document.body.classList.toggle('theme-light', light);
				document.body.classList.toggle('theme-dark', !light);
			}, original.light);
			await browser.execute((size) => {
				globalThis.require('electron').remote.getCurrentWindow().setSize(...size);
			}, originalSize);
			await closePluginSettings();
		}
	});
});
