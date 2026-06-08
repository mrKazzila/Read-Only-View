/* eslint-disable no-undef, obsidianmd/prefer-active-doc */
import assert from 'node:assert/strict';
import path from 'node:path';

const demoVaultPath = path.join(process.cwd(), 'demo-vault');
const trustAuthorSelectors = [
	'//button[normalize-space()="Trust author and enable plugins"]',
	'//div[contains(@class,"modal-container")][.//*[contains(normalize-space(),"author of this vault")] or .//*[contains(normalize-space(),"Restricted Mode")]]//button[contains(@class,"mod-cta")]',
];

const ACTIVE_LEAF_SELECTOR = '.workspace-leaf.mod-active';
const READING_VIEW_SELECTOR = `${ACTIVE_LEAF_SELECTOR} .markdown-reading-view`;
const SOURCE_VIEW_SELECTOR = `${ACTIVE_LEAF_SELECTOR} .markdown-source-view, ${ACTIVE_LEAF_SELECTOR} .cm-editor`;
const WORKSPACE_READY_SELECTORS = [
	'.workspace',
	'.workspace-split',
	'.nav-files-container',
	'.workspace-tabs',
];
const OPEN_VAULT_BUTTON_SELECTOR = '//button[normalize-space()="Open"]';

async function switchToNewestWindow() {
	const handles = await browser.getWindowHandles();
	if (handles.length === 0) {
		return;
	}

	await browser.switchToWindow(handles[handles.length - 1]);
}

export async function trustAuthorIfPrompted() {
	await switchToNewestWindow();
	for (const selector of trustAuthorSelectors) {
		const trustButton = await $(selector);
		if (!(await trustButton.isExisting())) {
			continue;
		}

		await trustButton.click();
		return true;
	}
	return false;
}

async function openDemoVaultFromStarterIfNeeded() {
	const openButton = await $(OPEN_VAULT_BUTTON_SELECTOR);
	if (!(await openButton.isExisting())) {
		return false;
	}

	const result = await browser.execute((targetVaultPath) => {
		const electron = globalThis.require?.('electron');
		const ipcRenderer = electron?.ipcRenderer;
		if (!ipcRenderer?.sendSync) {
			return { ok: false, reason: 'ipc-unavailable' };
		}

		const openResult = ipcRenderer.sendSync('vault-open', targetVaultPath, false);
		return { ok: openResult === true, reason: openResult === true ? null : String(openResult) };
	}, demoVaultPath);

	assert.deepEqual(result, { ok: true, reason: null });
	return true;
}

export async function waitForVaultReady() {
	let requestedVaultOpen = false;

	await browser.waitUntil(
		async () => {
			await switchToNewestWindow();
			await trustAuthorIfPrompted();
			if (!requestedVaultOpen) {
				requestedVaultOpen = await openDemoVaultFromStarterIfNeeded();
				if (requestedVaultOpen) {
					return false;
				}
			}

			for (const selector of WORKSPACE_READY_SELECTORS) {
				if (await $(selector).isExisting()) {
					return true;
				}
			}

			const visibleVaultLabel = await $('//*[contains(normalize-space(), "demo-vault")]').isExisting();
			if (visibleVaultLabel) {
				return true;
			}

			return false;
		},
		{
			timeout: 60_000,
			interval: 1_000,
			timeoutMsg: 'Obsidian did not finish loading a vault within 60 seconds.',
		},
	);
}

export async function getVaultName() {
	return browser.execute(() => globalThis.app?.vault?.getName?.() ?? null);
}

export async function isPluginEnabled(pluginId) {
	return browser.execute((targetPluginId) => {
		const app = globalThis.app;
		return Boolean(
			app?.plugins?.enabledPlugins?.has?.(targetPluginId)
			&& app?.plugins?.plugins?.[targetPluginId],
		);
	}, pluginId);
}

export async function waitForPluginEnabled(pluginId, timeout = 30_000) {
	await browser.waitUntil(
		async () => {
			await switchToNewestWindow();
			await trustAuthorIfPrompted();
			try {
				return await isPluginEnabled(pluginId);
			} catch {
				return false;
			}
		},
		{
			timeout,
			interval: 500,
			timeoutMsg: `Plugin ${pluginId} did not finish loading within ${timeout}ms.`,
		},
	);
}

export async function openMarkdownFile(relativePath) {
	const result = await browser.execute(async (targetPath) => {
		const app = globalThis.app;
		const file = app?.vault?.getAbstractFileByPath?.(targetPath);

		if (!file || file.extension !== 'md') {
			return { ok: false, reason: 'file-not-found' };
		}

		const activeLeaf = app.workspace.activeLeaf;
		const leaf = activeLeaf ?? app.workspace.getMostRecentLeaf?.() ?? app.workspace.getLeaf?.(true);
		if (!leaf || typeof leaf.openFile !== 'function') {
			return { ok: false, reason: 'leaf-not-found' };
		}

		await leaf.openFile(file, { active: true });
		return { ok: true };
	}, relativePath);

	assert.deepEqual(result, { ok: true });

	await browser.waitUntil(
		async () => (await getActiveFilePath()) === relativePath,
		{
			timeout: 15_000,
			interval: 250,
			timeoutMsg: `Timed out waiting for ${relativePath} to become the active file.`,
		},
	);
}

export async function getActiveFilePath() {
	return browser.execute(() => {
		const activeLeaf = globalThis.app?.workspace?.activeLeaf ?? globalThis.app?.workspace?.getMostRecentLeaf?.();
		return activeLeaf?.view?.file?.path ?? null;
	});
}

export async function getActiveMode() {
	return browser.execute(({ readingSelector, sourceSelector }) => {
		const activeLeaf = globalThis.app?.workspace?.activeLeaf ?? globalThis.app?.workspace?.getMostRecentLeaf?.();
		const activeView = activeLeaf?.view;

		if (typeof activeView?.getMode === 'function') {
			return activeView.getMode();
		}

		const activeLeafEl = document.querySelector(readingSelector)?.closest('.workspace-leaf.mod-active')
			?? document.querySelector(sourceSelector)?.closest('.workspace-leaf.mod-active');
		if (!activeLeafEl) {
			return null;
		}
		if (activeLeafEl.querySelector('.markdown-reading-view')) {
			return 'preview';
		}
		if (activeLeafEl.querySelector('.markdown-source-view, .cm-editor')) {
			return 'source';
		}
		return null;
	}, {
		readingSelector: READING_VIEW_SELECTOR,
		sourceSelector: SOURCE_VIEW_SELECTOR,
	});
}

export async function setActiveMarkdownMode(mode) {
	const result = await browser.execute(async (targetMode) => {
		const app = globalThis.app;
		const leaf = app?.workspace?.activeLeaf ?? app?.workspace?.getMostRecentLeaf?.();
		if (!leaf || typeof leaf.getViewState !== 'function' || typeof leaf.setViewState !== 'function') {
			return { ok: false, reason: 'leaf-not-found' };
		}

		const currentState = leaf.getViewState();
		const nextState = {
			...currentState,
			state: {
				...currentState.state,
				mode: targetMode,
			},
		};

		await leaf.setViewState(nextState, { replace: false });
		return { ok: true };
	}, mode);

	assert.deepEqual(result, { ok: true });
}

export async function waitForMode(mode, timeout = 10_000) {
	await browser.waitUntil(
		async () => (await getActiveMode()) === mode,
		{
			timeout,
			interval: 250,
			timeoutMsg: `Timed out waiting for active note to enter ${mode} mode.`,
		},
	);
}

export async function assertModeRemains(mode, durationMs = 1_200, intervalMs = 200) {
	const attempts = Math.max(1, Math.ceil(durationMs / intervalMs));
	for (let index = 0; index < attempts; index += 1) {
		assert.equal(await getActiveMode(), mode);
		if (index < attempts - 1) {
			await browser.pause(intervalMs);
		}
	}
}

export async function closeObsidianWindowIfOpen() {
	const handles = await browser.getWindowHandles();
	if (handles.length === 0) {
		return;
	}
	if (handles.length > 1) {
		await browser.closeWindow();
	}
}
