/* eslint-disable @typescript-eslint/no-deprecated, obsidianmd/no-unsupported-api -- This suite verifies both branches of the dual-support settings tab. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	Setting,
	type SettingDefinition,
	type SettingDefinitionItem,
} from 'obsidian';
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
			includeRuleEnabled: [true],
			excludeRuleEnabled: [],
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

function collectSettingDefinitions(items: SettingDefinitionItem[]): SettingDefinition[] {
	const definitions: SettingDefinition[] = [];
	for (const item of items) {
		if ('type' in item && (item.type === 'group' || item.type === 'list')) {
			definitions.push(...collectSettingDefinitions(item.items ?? []));
			continue;
		}
		if ('name' in item) {
			definitions.push(item);
		}
	}
	return definitions;
}

test('declarative settings expose every searchable setting', () => {
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	const definitions = collectSettingDefinitions(tab.getSettingDefinitions());

	const searchTerms = definitions.flatMap((definition) => [
		definition.name,
		...(definition.aliases ?? []),
	]);
	assert.deepEqual(searchTerms, [
		'Read-only behavior',
		'Enabled',
		'Mode',
		'Path rules',
		'Path tester',
		'Matching',
		'Use glob patterns',
		'Case sensitive',
		'Debug flags',
		'Debug logging',
		'Debug: verbose paths',
	]);
	assert.ok(definitions.every((definition) => definition.desc));
});

test('declarative primary settings preserve the legacy card composition', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		const primaryDefinition = collectSettingDefinitions(tab.getSettingDefinitions())
			.find((definition) => definition.name === 'Read-only behavior');
		assert.ok(primaryDefinition?.render);
		const setting = new Setting(container as unknown as HTMLElement);
		primaryDefinition.render(setting, {} as never);

		const headerCards = container.querySelectorAll('.read-only-view-header-card');
		const sectionCards = container.querySelectorAll('.read-only-view-section-card');
		assert.equal(headerCards.length, 1);
		assert.equal(sectionCards.length, 1);
		assert.ok(collectTexts(headerCards[0]!).includes('Read Only View'));
		assert.ok(collectTexts(sectionCards[0]!).includes('Enabled'));
		assert.ok(collectTexts(sectionCards[0]!).includes('Mode'));
		assert.equal(sectionCards[0]!.querySelectorAll('.read-only-view-mode-option').length, 2);
	} finally {
		dom.restore();
	}
});

test('declarative advanced settings render inline collapsible sections', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		const matchingDefinition = collectSettingDefinitions(tab.getSettingDefinitions())
			.find((definition) => definition.name === 'Matching');
		assert.ok(matchingDefinition?.render);
		const setting = new Setting(container as unknown as HTMLElement);
		matchingDefinition.render(setting, {} as never);

		const disclosure = container.querySelector('.read-only-view-disclosure-row');
		assert.ok(disclosure);
		assert.ok(!disclosure.matches('.is-open'));
		assert.ok(collectTexts(container).includes('Glob matching · Case-insensitive'));

		const toggle = container.querySelector('.read-only-view-disclosure-toggle');
		assert.ok(toggle);
		toggle.trigger('click');
		assert.ok(disclosure.matches('.is-open'));
		assert.ok(collectTexts(container).includes('Use glob patterns'));
		assert.ok(collectTexts(container).includes('Case sensitive'));
	} finally {
		dom.restore();
	}
});

test('declarative controls refresh through update after a change', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin, saveCalls, applyReasons } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;
	let updateCalls = 0;
	(tab as unknown as { update: () => void }).update = () => {
		updateCalls += 1;
	};

	try {
		const primaryDefinition = collectSettingDefinitions(tab.getSettingDefinitions())
			.find((definition) => definition.name === 'Read-only behavior');
		assert.ok(primaryDefinition?.render);
		const setting = new Setting(container as unknown as HTMLElement);
		primaryDefinition.render(setting, {} as never);

		const modeButtons = container.querySelectorAll('.read-only-view-mode-option');
		assert.equal(modeButtons.length, 2);
		modeButtons[1]!.trigger('click');
		await Promise.resolve();
		await Promise.resolve();

		assert.equal(plugin.settings.forceAllMarkdownReadOnly, true);
		assert.equal(updateCalls, 1);
		assert.equal(saveCalls.length, 1);
		assert.deepEqual(applyReasons, ['settings-force-all-markdown-read-only']);
	} finally {
		dom.restore();
	}
});

test('declarative rule editor cleanup cancels pending saves', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin, saveCalls, applyReasons } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			const definition = collectSettingDefinitions(tab.getSettingDefinitions())
				.find((item) => item.name === 'Path rules');
			assert.ok(definition?.render);
			const setting = new Setting(container as unknown as HTMLElement);
			const cleanup = definition.render(setting, {} as never);
			assert.equal(typeof cleanup, 'function');

			const input = container.querySelector('.read-only-view-rule-input');
			assert.ok(input);
			input.value = 'docs/pending-declarative.md';
			input.trigger('input');
			if (typeof cleanup === 'function') {
				cleanup();
			}
			await flushAll();

			assert.deepEqual(saveCalls, []);
			assert.deepEqual(applyReasons, []);
		});
	} finally {
		dom.restore();
	}
});

test('declarative path tester cleanup cancels pending render work', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			const definition = collectSettingDefinitions(tab.getSettingDefinitions())
				.find((item) => item.name === 'Path tester');
			assert.ok(definition?.render);
			const setting = new Setting(container as unknown as HTMLElement);
			const cleanup = definition.render(setting, {} as never);
			assert.equal(typeof cleanup, 'function');

			const input = container.querySelector('.read-only-view-path-tester input, input');
			assert.ok(input);
			input.value = 'docs/a.md';
			input.trigger('input');
			if (typeof cleanup === 'function') {
				cleanup();
			}
			await flushAll();

			const texts = collectTexts(container);
			assert.ok(!texts.includes('Matched include: docs/a.md'));
		});
	} finally {
		dom.restore();
	}
});

test('settings tab rerender disposes previous rule editor and cancels pending saves', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin, saveCalls, applyReasons } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			tab.display();
			const initialInputs = container.querySelectorAll('.read-only-view-rule-input');
			assert.equal(initialInputs.length, 1);

			initialInputs[0]!.value = 'docs/pending.md';
			initialInputs[0]!.trigger('input');

			tab.display();
			await flushAll();

			assert.deepEqual(saveCalls, []);
			assert.deepEqual(applyReasons, []);

			const rerenderedInputs = container.querySelectorAll('.read-only-view-rule-input');
			assert.equal(rerenderedInputs.length, 1);
			rerenderedInputs[0]!.value = 'docs/committed.md';
			rerenderedInputs[0]!.trigger('input');

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

test('settings tab hide disposes rule editor and repeated hide is safe', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin, saveCalls, applyReasons } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			tab.display();
			const inputs = container.querySelectorAll('.read-only-view-rule-input');
			assert.equal(inputs.length, 1);

			inputs[0]!.value = 'docs/hidden.md';
			inputs[0]!.trigger('input');

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
			const initialInput = container.querySelector('.read-only-view-path-tester input, input');
			assert.ok(initialInput);

			initialInput.value = 'docs/a.md';
			initialInput.trigger('input');

			tab.display();
			await flushAll();

			const texts = collectTexts(container);
			assert.ok(!texts.includes('Matched include: docs/a.md'));
			assert.ok(texts.includes('Enter a path to test.'));
		});
	} finally {
		dom.restore();
	}
});

test('settings tab renders workflow-first sections with expected default open state', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		tab.display();

		const texts = collectTexts(container);
		assert.ok(texts.includes('Read Only View'));
		assert.ok(texts.includes('Read-only behavior'));
		assert.ok(texts.includes('Keep selected Markdown notes in Reading view'));
		assert.ok(texts.includes('Active rules: 1'));
		assert.ok(texts.includes('Mode'));
		assert.ok(texts.includes('Advanced'));

		const disclosureTitles = container.querySelectorAll('.read-only-view-disclosure-title').map((el) => el.textContent);
		assert.deepEqual(disclosureTitles, [
			'Path rules',
			'Path tester',
			'Matching',
			'Debug flags',
		]);

		const disclosures = container.querySelectorAll('.read-only-view-disclosure-row');
		assert.equal(disclosures.length, 2);
		assert.ok(!disclosures[0]?.matches('.is-open'));
		assert.ok(!disclosures[1]?.matches('.is-open'));

		assert.ok(texts.includes('1 include · 0 exclude'));
		assert.ok(texts.includes('Glob matching · Case-insensitive'));
		assert.ok(texts.includes('Ready to test'));
		assert.ok(texts.includes('Off'));
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

		const disclosureButtons = container.querySelectorAll('.read-only-view-disclosure-toggle');
		const pathTesterToggle = disclosureButtons[1];
		assert.ok(pathTesterToggle);
		assert.equal(pathTesterToggle.getAttr('aria-controls'), 'read-only-view-section-debugFlags');
		assert.equal(
			container.querySelector('.read-only-view-disclosure-arrow')?.getAttr('aria-hidden'),
			'true',
		);
		pathTesterToggle.trigger('click');

		const disclosures = container.querySelectorAll('.read-only-view-disclosure-row');
		assert.ok(disclosures[1]?.matches('.is-open'));
		assert.equal(pathTesterToggle.getAttr('aria-expanded'), 'true');
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

		const disclosureButtons = container.querySelectorAll('.read-only-view-disclosure-toggle');
		const pathTesterToggle = disclosureButtons[1];
		assert.ok(pathTesterToggle);
		pathTesterToggle.trigger('click');

		tab.display();

		const disclosures = container.querySelectorAll('.read-only-view-disclosure-row');
		assert.ok(disclosures[1]?.matches('.is-open'));
		const rerenderedToggle = container.querySelectorAll('.read-only-view-disclosure-toggle')[1];
		assert.equal(rerenderedToggle?.getAttr('aria-expanded'), 'true');
	} finally {
		dom.restore();
	}
});

test('settings tab rerender restores focus to the equivalent control', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	container.ownerDocument = dom.document;
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		tab.display();

		const initialMode = container.querySelector('[data-read-only-view-focus="mode-matched-paths"]');
		assert.ok(initialMode);
		initialMode.focus();

		tab.display();

		const rerenderedMode = container.querySelector('[data-read-only-view-focus="mode-matched-paths"]');
		assert.ok(rerenderedMode);
		assert.notEqual(rerenderedMode, initialMode);
		assert.equal(dom.document.activeElement, rerenderedMode);
	} finally {
		dom.restore();
	}
});

test('opening the settings tab focuses the first plugin control', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	container.ownerDocument = dom.document;
	const { plugin } = createPlugin();
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		tab.display();

		assert.equal(
			dom.document.activeElement?.getAttr('data-read-only-view-focus'),
			'toggle-enabled',
		);
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

		const pathTesterToggle = container.querySelectorAll('.read-only-view-disclosure-toggle')[1];
		assert.ok(pathTesterToggle);
		pathTesterToggle.trigger('click');

		tab.hide();
		tab.display();

		const disclosures = container.querySelectorAll('.read-only-view-disclosure-row');
		assert.ok(!disclosures[1]?.matches('.is-open'));
	} finally {
		dom.restore();
	}
});

test('saved rule change preserves all-Markdown preset and updates active rules badge', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const { plugin, saveCalls, applyReasons } = createPlugin();
	plugin.settings.forceAllMarkdownReadOnly = true;
	const tab = new ForceReadModeSettingTab({} as never, plugin as never);
	tab.containerEl = container as unknown as HTMLElement;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			tab.display();
			const inputs = container.querySelectorAll('.read-only-view-rule-input');
			assert.equal(inputs.length, 1);

			inputs[0]!.value = 'docs/changed.md';
			inputs[0]!.trigger('input');
			await flushAll();

			assert.equal(plugin.settings.forceAllMarkdownReadOnly, true);
			assert.deepEqual(saveCalls, [
				{ forceAllMarkdownReadOnly: true, includeRules: ['docs/changed.md'], excludeRules: [] },
			]);
			assert.deepEqual(applyReasons, ['settings-include-rules']);
			const texts = collectTexts(container);
			assert.ok(texts.includes('Active rules: 0'));
			assert.ok(texts.includes('All Markdown files mode is enabled'));
			const selectedOption = container
				.querySelectorAll('.read-only-view-mode-option')
				.find((option) => option.matches('.is-selected'));
			assert.ok(selectedOption);
			assert.ok(collectTexts(selectedOption).includes('All Markdown files'));
		});
	} finally {
		dom.restore();
	}
});
