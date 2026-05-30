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
	const saveCalls: Array<{
		forceAllMarkdownReadOnly: boolean;
		includeRules: string[];
		excludeRules: string[];
	}> = [];
	const applyReasons: string[] = [];
	const plugin = {
			settings: {
				enabled: true,
				forceAllMarkdownReadOnly: false,
				useGlobPatterns: true,
				caseSensitive: false,
				debug: false,
				debugVerbosePaths: false,
				dismissedWelcomeVersion: 0,
				includeRules: ['docs/a.md'],
				excludeRules: [],
			},
		saveSettings: async () => {
			saveCalls.push({
				forceAllMarkdownReadOnly: plugin.settings.forceAllMarkdownReadOnly,
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
				{ forceAllMarkdownReadOnly: false, includeRules: ['docs/committed.md'], excludeRules: [] },
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

test('settings tab renders collapsible sections with expected default open state', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		tab.display();

		const staticTitle = container.querySelector('.read-only-view-section-title');
		assert.equal(staticTitle?.textContent, 'Plugin');

		const disclosureTitles = container.querySelectorAll('.read-only-view-disclosure-title').map((el) => el.textContent);
		assert.deepEqual(disclosureTitles, [
			'Matching',
			'Path rules',
			'Path tester',
			'Debug flags',
		]);

		const disclosures = container.querySelectorAll('.read-only-view-disclosure');
		assert.ok(disclosures[0]?.matches('.read-only-view-disclosure'));
		assert.ok(!disclosures[0]?.matches('.is-open'));
		assert.ok(!disclosures[1]?.matches('.is-open'));
		assert.ok(!disclosures[2]?.matches('.is-open'));

		const texts = collectTexts(container);
		assert.ok(texts.includes('Enabled'));
		assert.ok(texts.includes('Choose how paths are compared before any include or exclude rule is evaluated.'));
		assert.ok(texts.includes('Configure include and exclude path rules. Exclude rules always win over matching include rules.'));
		assert.ok(texts.includes('Test a vault path against the current rules before you change matching settings or rule text.'));
		assert.ok(texts.includes('Enable extra logging only when diagnosing rule behavior. Verbose path logging may expose full file paths in developer console logs.'));
	} finally {
		dom.restore();
	}
});

test('rules section stays collapsed by default even when no include rules are configured', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	plugin.settings.includeRules = [];
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		tab.display();

		const disclosures = container.querySelectorAll('.read-only-view-disclosure');
		assert.ok(!disclosures[1]?.matches('.is-open'));
	} finally {
		dom.restore();
	}
});

test('collapsible section opens on click without rerender', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		tab.display();

		const matchingToggle = container.querySelector('button');
		assert.ok(matchingToggle);
		matchingToggle.trigger('click');

		const disclosures = container.querySelectorAll('.read-only-view-disclosure');
		assert.ok(disclosures[0]?.matches('.is-open'));
		assert.equal(matchingToggle.getAttr('aria-expanded'), 'true');
	} finally {
		dom.restore();
	}
});

test('collapsible section stays open across settings tab rerender', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		tab.display();

		const matchingToggle = container.querySelector('button');
		assert.ok(matchingToggle);
		matchingToggle.trigger('click');

		tab.display();

		const disclosures = container.querySelectorAll('.read-only-view-disclosure');
		assert.ok(disclosures[0]?.matches('.is-open'));
		const rerenderedToggle = container.querySelector('button');
		assert.equal(rerenderedToggle?.getAttr('aria-expanded'), 'true');
	} finally {
		dom.restore();
	}
});

test('collapsible section state resets after settings tab hide', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		tab.display();

		const matchingToggle = container.querySelector('button');
		assert.ok(matchingToggle);
		matchingToggle.trigger('click');

		tab.hide();
		tab.display();

		const disclosures = container.querySelectorAll('.read-only-view-disclosure');
		assert.ok(!disclosures[0]?.matches('.is-open'));
	} finally {
		dom.restore();
	}
});

test('saved rule change disables all-Markdown preset automatically', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin, saveCalls, applyReasons } = createPlugin();
	plugin.settings.forceAllMarkdownReadOnly = true;
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			tab.display();
			const textareas = container.querySelectorAll('textarea');
			assert.equal(textareas.length, 2);

			textareas[0]!.value = 'docs/changed.md';
			textareas[0]!.trigger('input');
			await flushAll();

			assert.equal(plugin.settings.forceAllMarkdownReadOnly, false);
			assert.deepEqual(saveCalls, [
				{ forceAllMarkdownReadOnly: false, includeRules: ['docs/changed.md'], excludeRules: [] },
			]);
			assert.deepEqual(applyReasons, ['settings-include-rules']);
		});
	} finally {
		dom.restore();
	}
});
