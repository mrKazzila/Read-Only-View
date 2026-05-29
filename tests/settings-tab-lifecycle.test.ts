import assert from 'node:assert/strict';
import test from 'node:test';

import { ForceReadModeSettingTab } from '../src/settings-tab.js';
import { installDomMocks, MockHTMLElement } from './helpers/dom-mocks.js';

function withFakeTimeouts(callback: (tools: { flushAll: () => Promise<void> }) => Promise<void>): Promise<void> {
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	let nextId = 1;
	const queue = new Map<number, () => void>();

	globalThis.setTimeout = ((handler: TimerHandler) => {
		const callbackHandler = typeof handler === 'function' ? handler : () => undefined;
		const id = nextId++;
		queue.set(id, callbackHandler as () => void);
		return id as unknown as ReturnType<typeof setTimeout>;
	}) as typeof setTimeout;

	globalThis.clearTimeout = ((timeoutId: ReturnType<typeof setTimeout>) => {
		queue.delete(Number(timeoutId));
	}) as typeof clearTimeout;
	(globalThis as Record<string, unknown>).activeWindow = globalThis;

	const flushAll = async () => {
		for (const [id, callbackHandler] of Array.from(queue.entries())) {
			queue.delete(id);
			callbackHandler();
			await Promise.resolve();
		}
	};

	return callback({ flushAll }).finally(() => {
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	});
}

function createPlugin() {
	const saveCalls: Array<{ includeRules: string[]; excludeRules: string[] }> = [];
	const applyReasons: string[] = [];
	const plugin = {
		settings: {
			enabled: true,
			useGlobPatterns: true,
			caseSensitive: false,
			debug: false,
			debugVerbosePaths: false,
			includeRules: ['docs/a.md'],
			excludeRules: [],
		},
		saveSettings: async () => {
			saveCalls.push({
				includeRules: [...plugin.settings.includeRules],
				excludeRules: [...plugin.settings.excludeRules],
			});
		},
		applyAllOpenMarkdownLeaves: async (reason: string) => {
			applyReasons.push(reason);
		},
		refreshEditorOptions: () => undefined,
	};

	return { plugin, saveCalls, applyReasons };
}

function collectTexts(root: MockHTMLElement): string[] {
	return [root.textContent, ...root.getChildren().flatMap((child) => collectTexts(child))]
		.filter((value) => value.length > 0);
}

test('settings tab rerender disposes previous rule editors and cancels pending saves', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin, saveCalls, applyReasons } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			tab.display();
			const initialTextareas = container.querySelectorAll('textarea');
			assert.equal(initialTextareas.length, 2);

			initialTextareas[0]!.value = 'docs/pending.md';
			initialTextareas[0]!.trigger('input');

			tab.display();
			await flushAll();

			assert.deepEqual(saveCalls, []);
			assert.deepEqual(applyReasons, []);

			const rerenderedTextareas = container.querySelectorAll('textarea');
			assert.equal(rerenderedTextareas.length, 2);
			rerenderedTextareas[0]!.value = 'docs/committed.md';
			rerenderedTextareas[0]!.trigger('input');

			await flushAll();

			assert.deepEqual(saveCalls, [
				{ includeRules: ['docs/committed.md'], excludeRules: [] },
			]);
			assert.deepEqual(applyReasons, ['settings-include-rules']);
		});
	} finally {
		dom.restore();
	}
});

test('settings tab hide disposes rule editors and repeated hide is safe', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin, saveCalls, applyReasons } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			tab.display();
			const textareas = container.querySelectorAll('textarea');
			assert.equal(textareas.length, 2);

			textareas[0]!.value = 'docs/hidden.md';
			textareas[0]!.trigger('input');

			tab.hide();
			tab.hide();
			await flushAll();

			assert.deepEqual(saveCalls, []);
			assert.deepEqual(applyReasons, []);
		});
	} finally {
		dom.restore();
	}
});

test('settings tab rerender cancels pending path tester render work', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			tab.display();
			const initialInput = container.querySelector('input');
			assert.ok(initialInput);

			initialInput.value = 'docs/a.md';
			initialInput.trigger('input');

			tab.display();
			await flushAll();

			const texts = collectTexts(container);
			assert.ok(!texts.includes('Matched include: docs/a.md'));
			assert.ok(texts.includes('Enter a file path to test.'));
			assert.ok(container.querySelector('input'));
		});
	} finally {
		dom.restore();
	}
});
