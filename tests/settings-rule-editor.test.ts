import assert from 'node:assert/strict';
import test from 'node:test';

import { renderRuleEditor } from '../src/settings-rule-editor.js';
import { PATH_SOURCE_INPUT_MAX_LENGTH } from '../src/source-input-limits.js';
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

function collectTexts(root: MockHTMLElement): string[] {
	return [root.textContent, ...root.getChildren().flatMap((child) => collectTexts(child))]
		.filter((value) => value.length > 0);
}

function withOwnedFakeTimeoutWindows(
	callback: (tools: {
		switchActiveWindow: (name: 'A' | 'B') => void;
		windowA: { clearedIds: number[] };
		windowB: { clearedIds: number[] };
	}) => Promise<void>,
): Promise<void> {
	const originalActiveWindow = (globalThis as Record<string, unknown>).activeWindow;

	let nextId = 1;
	const createWindow = () => {
		const queue = new Map<number, () => void>();
		const clearedIds: number[] = [];
		return {
			clearedIds,
			setTimeout: ((handler: TimerHandler) => {
				const callbackHandler = typeof handler === 'function' ? handler : () => undefined;
				const id = nextId++;
				queue.set(id, callbackHandler as () => void);
				return id as unknown as ReturnType<typeof setTimeout>;
			}) as typeof setTimeout,
			clearTimeout: ((timeoutId: ReturnType<typeof setTimeout>) => {
				clearedIds.push(Number(timeoutId));
				queue.delete(Number(timeoutId));
			}) as typeof clearTimeout,
		};
	};

	const windowA = createWindow();
	const windowB = createWindow();
	(globalThis as Record<string, unknown>).activeWindow = windowB;

	return callback({
		switchActiveWindow: (name) => {
			(globalThis as Record<string, unknown>).activeWindow = name === 'A' ? windowA : windowB;
		},
		windowA,
		windowB,
	}).finally(() => {
		(globalThis as Record<string, unknown>).activeWindow = originalActiveWindow;
	});
}

test('rules editor renders table rows, help copy, and inline warnings', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				includeRules: ['docs/a.md'],
				excludeRules: ['drafts/*'],
				useGlobPatterns: false,
				onChange: async () => undefined,
			});

			await flushAll();
		});

		const texts = collectTexts(container);
		assert.ok(texts.includes('Exclude rules always win. Disable a rule to keep it without applying it.'));
		assert.ok(texts.includes('Rule examples in readme'));
		assert.ok(texts.includes('Examples: Notes/Summaries/ · Notes/Summaries/file.md · Archive/**/*.md · !Drafts/'));
		assert.ok(texts.includes('Contains wildcard in prefix mode. It is treated as a literal character.'));
		assert.equal(container.querySelectorAll('.read-only-view-rule-row').length, 2);
		const helpLinks = container.querySelectorAll('a');
		assert.equal(helpLinks.length, 1);
		assert.equal(helpLinks[0]?.getAttr('href'), 'https://github.com/mrKazzila/Read-Only-View#rule-examples');
		assert.equal(helpLinks[0]?.getAttr('aria-label'), 'Open path rule syntax examples');
	} finally {
		dom.restore();
	}
});

test('rules editor persists enabled checkbox changes', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const committed: Array<{ enabled: boolean[]; reason: string }> = [];

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: ['docs/a.md'],
			excludeRules: [],
			includeRuleEnabled: [true],
			excludeRuleEnabled: [],
			useGlobPatterns: true,
			onChange: async (state, reason) => {
				committed.push({ enabled: state.includeRuleEnabled, reason });
			},
		});

		const enabledToggle = container.querySelector('.read-only-view-rule-enabled-toggle');
		assert.ok(enabledToggle);
		assert.equal(enabledToggle.checked, true);

		enabledToggle.checked = false;
		enabledToggle.trigger('change');
		await Promise.resolve();
		await Promise.resolve();

		assert.deepEqual(committed.at(-1), {
			enabled: [false],
			reason: 'settings-rule-enabled',
		});
	} finally {
		dom.restore();
	}
});

test('rules editor keeps focus on a control when rows rerender', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	container.ownerDocument = dom.document;

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: ['docs/a.md'],
			excludeRules: [],
			includeRuleEnabled: [true],
			excludeRuleEnabled: [],
			useGlobPatterns: true,
			onChange: async () => undefined,
		});

		const initialToggle = container.querySelector('.read-only-view-rule-enabled-toggle');
		assert.ok(initialToggle);
		initialToggle.focus();
		initialToggle.checked = false;
		initialToggle.trigger('change');
		await Promise.resolve();

		const rerenderedToggle = container.querySelector('.read-only-view-rule-enabled-toggle');
		assert.ok(rerenderedToggle);
		assert.notEqual(rerenderedToggle, initialToggle);
		assert.equal(dom.document.activeElement, rerenderedToggle);
	} finally {
		dom.restore();
	}
});

test('rules editor changes rule type in place without refocusing the mobile select', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	container.ownerDocument = dom.document;
	const committed: Array<{ includeRules: string[]; excludeRules: string[]; reason: string }> = [];

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: ['docs/a.md'],
			excludeRules: [],
			useGlobPatterns: true,
			includeRulesActive: false,
			onChange: async (state, reason) => {
				committed.push({
					includeRules: state.includeRules,
					excludeRules: state.excludeRules,
					reason,
				});
			},
		});

		const initialSelect = container.querySelector('select');
		const initialRow = container.querySelector('.read-only-view-rule-row');
		const input = container.querySelector('.read-only-view-rule-input');
		const deleteButton = container.querySelector('.read-only-view-delete-rule-button');
		assert.ok(initialSelect);
		assert.ok(initialRow);
		assert.ok(input);
		assert.ok(deleteButton);
		assert.ok(initialRow.matches('.is-inactive-by-mode'));

		initialSelect.focus();
		initialSelect.value = 'exclude';
		initialSelect.trigger('change');
		await Promise.resolve();
		await Promise.resolve();

		assert.equal(container.querySelector('select'), initialSelect);
		assert.equal(dom.document.activeElement, initialSelect);
		assert.ok(!initialRow.matches('.is-inactive-by-mode'));
		assert.equal(input.placeholder, 'projects/drafts/');
		assert.equal(input.getAttr('aria-label'), 'Exclude rule value');
		assert.equal(deleteButton.getAttr('aria-label'), 'Delete exclude rule');
		assert.deepEqual(committed.at(-1), {
			includeRules: [],
			excludeRules: ['docs/a.md'],
			reason: 'settings-path-rules',
		});
	} finally {
		dom.restore();
	}
});

test('all-Markdown mode visually inactivates only include rules without changing enabled state', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: ['docs/a.md', 'docs/b.md'],
			excludeRules: ['docs/private.md', 'docs/archive.md'],
			includeRuleEnabled: [true, false],
			excludeRuleEnabled: [true, false],
			useGlobPatterns: true,
			includeRulesActive: false,
			onChange: async () => undefined,
		});

		const rows = container.querySelectorAll('.read-only-view-rule-row');
		assert.equal(rows.length, 4);
		assert.ok(rows[0]?.matches('.is-inactive-by-mode'));
		assert.ok(rows[1]?.matches('.is-inactive-by-mode'));
		assert.ok(!rows[2]?.matches('.is-inactive-by-mode'));
		assert.ok(!rows[3]?.matches('.is-inactive-by-mode'));
		assert.ok(rows[3]?.matches('.is-disabled'));

		const toggles = container.querySelectorAll('.read-only-view-rule-enabled-toggle');
		assert.equal(toggles[0]?.checked, true);
		assert.equal(toggles[1]?.checked, false);
		assert.equal(toggles[2]?.checked, true);
		assert.equal(toggles[3]?.checked, false);

		const texts = collectTexts(container);
		assert.ok(texts.includes('Include rules are inactive while all Markdown files mode is enabled.'));
		assert.ok(texts.includes('Inactive in all Markdown files mode.'));
		assert.ok(texts.includes('Include: 0 rules · Exclude: 1 rules · Total: 1'));
		assert.ok(!texts.includes('Include [1] (empty line)'));
		assert.ok(!texts.includes('Empty or whitespace-only line.'));
	} finally {
		dom.restore();
	}
});

test('rules editor exposes input description and live save status to assistive tech', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: ['docs/a.md'],
			excludeRules: [],
			useGlobPatterns: true,
			onChange: async () => undefined,
		});

		const input = container.querySelector('.read-only-view-rule-input');
		const saveStatus = container.querySelector('#read-only-view-path-rules-save-status');
		const diagnostics = container.querySelector('#read-only-view-path-rules-diagnostics');

		assert.ok(input);
		assert.equal(input.getAttr('aria-label'), 'Include rule value');
		assert.equal(
			input.getAttr('aria-describedby'),
			'read-only-view-path-rules-description read-only-view-path-rules-save-status read-only-view-path-rules-diagnostics',
		);
		assert.ok(saveStatus);
		assert.equal(saveStatus.getAttr('role'), 'status');
		assert.equal(saveStatus.getAttr('aria-live'), 'polite');
		assert.equal(saveStatus.getAttr('aria-atomic'), 'true');
		assert.ok(diagnostics);
		assert.equal(diagnostics.getAttr('aria-live'), 'polite');
	} finally {
		dom.restore();
	}
});

test('rules editor save status moves through saving to saved on committed input', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const committed: Array<{ includeRules: string[]; excludeRules: string[]; reason: string }> = [];

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: ['docs/a.md'],
			excludeRules: [],
			useGlobPatterns: true,
			onChange: async (state, reason) => {
				committed.push({ includeRules: state.includeRules, excludeRules: state.excludeRules, reason });
			},
		});

		const input = container.querySelector('.read-only-view-rule-input');
		assert.ok(input);

		await withFakeTimeouts(async ({ flushAll }) => {
			input.value = 'docs/updated.md';
			input.trigger('input');

			assert.ok(collectTexts(container).includes('Saving...'));
			await flushAll();
		});

		assert.deepEqual(committed, [
			{ includeRules: ['docs/updated.md'], excludeRules: [], reason: 'settings-include-rules' },
		]);
		assert.ok(collectTexts(container).includes('Saved.'));
	} finally {
		dom.restore();
	}
});

test('rules editor keeps Obsidian URL visible and saves its resolved path metadata', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	let savedState: { includeRules: string[]; includeRuleEntries?: Array<{ sourceValue: string; resolvedPath: string | null }> } | null = null;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				includeRules: [],
				excludeRules: [],
				useGlobPatterns: false,
				resolverContext: {
					vaultName: 'demo-vault',
					vaultBasePath: '/vaults/demo-vault',
					isMarkdownFile: (path) => path === 'Inbox/Quick capture.md',
					isFolder: () => false,
				},
				onChange: async (state) => {
					savedState = state;
				},
			});
			const addButton = container.querySelector('.read-only-view-add-rule-button');
			assert.ok(addButton);
			addButton.trigger('click');
			const input = container.querySelector('.read-only-view-rule-input');
			assert.ok(input);
			const uri = 'obsidian://open?vault=demo-vault&file=Inbox%2FQuick%20capture';
			input.value = uri;
			input.trigger('input');
			await flushAll();

			assert.equal(input.value, uri);
			assert.ok(collectTexts(container).includes('Obsidian URL · Resolved to: Inbox/Quick capture.md'));
			assert.deepEqual(savedState?.includeRules, ['Inbox/Quick capture.md']);
			assert.equal(savedState?.includeRuleEntries?.[0]?.sourceValue, uri);
		});
	} finally {
		dom.restore();
	}
});

test('rules editor recognizes a copied vault note path without the Markdown extension', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	let savedPath: string | undefined;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				includeRules: [],
				excludeRules: [],
				useGlobPatterns: false,
				resolverContext: {
					vaultName: 'demo-vault',
					vaultBasePath: '/vaults/demo-vault',
					isMarkdownFile: (path) => path === 'Archive/2025/Postmortem template.md',
					isFolder: () => false,
				},
				onChange: async (state) => {
					savedPath = state.includeRules[0];
				},
			});
			const addButton = container.querySelector('.read-only-view-add-rule-button');
			assert.ok(addButton);
			addButton.trigger('click');
			const input = container.querySelector('.read-only-view-rule-input');
			assert.ok(input);
			input.value = 'Archive/2025/Postmortem template';
			input.trigger('input');
			await flushAll();

			assert.equal(savedPath, 'Archive/2025/Postmortem template.md');
			assert.ok(collectTexts(container).includes(
				'Vault file · Resolved to: Archive/2025/Postmortem template.md',
			));
			assert.equal(collectTexts(container).some((text) => text.includes('folder hint applied')), false);
		});
	} finally {
		dom.restore();
	}
});

test('rules editor recognizes an existing vault folder without showing a folder-hint warning', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	let savedPath: string | undefined;

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				includeRules: [],
				excludeRules: [],
				useGlobPatterns: false,
				resolverContext: {
					vaultName: 'demo-vault',
					vaultBasePath: '/vaults/demo-vault',
					isMarkdownFile: () => false,
					isFolder: (path) => path === 'Archive/2024',
				},
				onChange: async (state) => {
					savedPath = state.includeRules[0];
				},
			});
			const addButton = container.querySelector('.read-only-view-add-rule-button');
			assert.ok(addButton);
			addButton.trigger('click');
			const input = container.querySelector('.read-only-view-rule-input');
			assert.ok(input);
			input.value = 'Archive/2024';
			input.trigger('input');
			await flushAll();

			assert.equal(savedPath, 'Archive/2024/');
			assert.ok(collectTexts(container).includes('Vault folder · Resolved to: Archive/2024/'));
			assert.equal(collectTexts(container).some((text) => text.includes('folder hint applied')), false);
		});
	} finally {
		dom.restore();
	}
});

test('rules editor imports a system folder as a privacy-safe vault folder rule', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const committed: Array<{
		includeRules: string[];
		sourceValue?: string;
		resolvedPath?: string | null;
	}> = [];

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				includeRules: [],
				excludeRules: [],
				useGlobPatterns: false,
				resolverContext: {
					vaultName: 'demo-vault',
					vaultBasePath: '/vaults/demo-vault',
					isMarkdownFile: () => false,
					isFolder: (path) => path === 'Knowledge Base/Productivity',
				},
				onChange: async (state) => {
					committed.push({
						includeRules: state.includeRules,
						sourceValue: state.includeRuleEntries?.[0]?.sourceValue,
						resolvedPath: state.includeRuleEntries?.[0]?.resolvedPath,
					});
				},
			});

			const addButton = container.querySelector('.read-only-view-add-rule-button');
			assert.ok(addButton);
			addButton.trigger('click');
			const input = container.querySelector('.read-only-view-rule-input');
			assert.ok(input);
			input.value = '/vaults/demo-vault/Knowledge Base/Productivity/';
			input.trigger('input');
			await flushAll();

			assert.ok(collectTexts(container).includes(
				'System path · Resolved to: Knowledge Base/Productivity/',
			));
			assert.deepEqual(committed.at(-1), {
				includeRules: ['Knowledge Base/Productivity/'],
				sourceValue: 'Knowledge Base/Productivity/',
				resolvedPath: 'Knowledge Base/Productivity/',
			});
		});
	} finally {
		dom.restore();
	}
});

test('rules editor blocks and does not save an over-limit rule value', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const committed: string[][] = [];

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				includeRules: [],
				excludeRules: [],
				useGlobPatterns: false,
				onChange: async (state) => {
					committed.push(state.includeRules);
				},
			});
			const addButton = container.querySelector('.read-only-view-add-rule-button');
			assert.ok(addButton);
			addButton.trigger('click');
			committed.length = 0;

			const input = container.querySelector('.read-only-view-rule-input');
			assert.ok(input);
			input.value = 'x'.repeat(PATH_SOURCE_INPUT_MAX_LENGTH + 1);
			input.trigger('input');
			await flushAll();

			assert.equal(input.value.length, PATH_SOURCE_INPUT_MAX_LENGTH);
			assert.equal(input.getAttr('aria-invalid'), 'true');
			assert.ok(input.matches('.is-input-error'));
			assert.ok(collectTexts(container).includes('Input is too long. Maximum: 40,000 characters.'));
			assert.deepEqual(committed, []);

			input.value = 'docs/valid.md';
			input.trigger('input');
			await flushAll();
			assert.equal(input.getAttr('aria-invalid'), 'false');
			assert.ok(!input.matches('.is-input-error'));
			assert.deepEqual(committed.at(-1), ['docs/valid.md']);
		});
	} finally {
		dom.restore();
	}
});

test('rules editor safely presents an over-limit persisted rule for correction', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const sourceValue = 'x'.repeat(PATH_SOURCE_INPUT_MAX_LENGTH + 1);

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: [],
			excludeRules: [],
			includeRuleEntries: [{
				sourceKind: 'vault-path',
				sourceValue,
				resolvedPath: sourceValue,
				enabled: true,
			}],
			useGlobPatterns: true,
			onChange: async () => undefined,
		});

		const input = container.querySelector('.read-only-view-rule-input');
		assert.ok(input);
		assert.equal(input.value.length, PATH_SOURCE_INPUT_MAX_LENGTH);
		assert.equal(input.getAttr('aria-invalid'), 'true');
		assert.ok(input.matches('.is-input-error'));
		assert.ok(collectTexts(container).includes('Input is too long. Maximum: 40,000 characters.'));
	} finally {
		dom.restore();
	}
});

test('rules editor starts with zero rows and no empty-rule warning in both modes', () => {
	for (const includeRulesActive of [true, false]) {
		const dom = installDomMocks();
		const container = new MockHTMLElement();

		try {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				includeRules: [],
				excludeRules: [],
				useGlobPatterns: true,
				includeRulesActive,
				onChange: async () => undefined,
			});

			const texts = collectTexts(container);
			assert.equal(container.querySelectorAll('.read-only-view-rule-row').length, 0);
			assert.ok(texts.includes('No path rules configured.'));
			assert.ok(!texts.includes('Include [1] (empty line)'));
			assert.ok(!texts.includes('Exclude [1] (empty line)'));
			assert.ok(!texts.includes('Empty or whitespace-only line.'));
		} finally {
			dom.restore();
		}
	}
});

test('deleting the final rule leaves zero rows and persists empty rule arrays', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const committed: Array<{ includeRules: string[]; excludeRules: string[] }> = [];

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: ['docs/a.md'],
			excludeRules: [],
			useGlobPatterns: true,
			onChange: async (state) => {
				committed.push({ includeRules: state.includeRules, excludeRules: state.excludeRules });
			},
		});

		const deleteButton = container.querySelector('.read-only-view-delete-rule-button');
		assert.ok(deleteButton);
		deleteButton.trigger('click');
		await Promise.resolve();
		await Promise.resolve();

		assert.equal(container.querySelectorAll('.read-only-view-rule-row').length, 0);
		assert.deepEqual(committed.at(-1), { includeRules: [], excludeRules: [] });
		const texts = collectTexts(container);
		assert.ok(texts.includes('No path rules configured.'));
		assert.ok(!texts.includes('Empty or whitespace-only line.'));
	} finally {
		dom.restore();
	}
});

test('rules editor save status shows failure when commit rejects', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: ['docs/a.md'],
			excludeRules: [],
			useGlobPatterns: true,
			onChange: async () => {
				throw new Error('save failed');
			},
		});

		const input = container.querySelector('.read-only-view-rule-input');
		assert.ok(input);

		await withFakeTimeouts(async ({ flushAll }) => {
			input.value = 'docs/b.md';
			input.trigger('input');
			await flushAll();
		});

		assert.ok(collectTexts(container).includes('Save failed.'));
	} finally {
		dom.restore();
	}
});

test('rules editor add rule button creates a new row and flushes combined save state', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const committed: Array<{ includeRules: string[]; excludeRules: string[]; reason: string }> = [];

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			includeRules: ['docs/a.md'],
			excludeRules: [],
			useGlobPatterns: true,
			onChange: async (state, reason) => {
				committed.push({ includeRules: state.includeRules, excludeRules: state.excludeRules, reason });
			},
		});

		const addButton = container.querySelector('.read-only-view-add-rule-button');
		assert.ok(addButton);
		addButton.trigger('click');

		const inputs = container.querySelectorAll('.read-only-view-rule-input');
		assert.equal(inputs.length, 2);
		inputs[1]!.value = 'docs/b.md';
		inputs[1]!.trigger('change');
		await Promise.resolve();
		await Promise.resolve();

		assert.deepEqual(committed.at(-1), {
			includeRules: ['docs/a.md', 'docs/b.md'],
			excludeRules: [],
			reason: 'settings-path-rules',
		});
	} finally {
		dom.restore();
	}
});

test('rules editor blur flushes pending diagnostics render immediately', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();
	const committed: string[] = [];

	try {
		await withFakeTimeouts(async () => {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				includeRules: ['docs/a.md'],
				excludeRules: [],
				useGlobPatterns: true,
				onChange: async (state) => {
					committed.push(state.includeRules.join(','));
				},
			});

			const input = container.querySelector('.read-only-view-rule-input');
			assert.ok(input);
			input.value = 'docs/blurred.md';
			input.trigger('input');

			input.trigger('blur');
			await Promise.resolve();
			assert.deepEqual(committed, ['docs/blurred.md']);
		});
	} finally {
		dom.restore();
	}
});

test('rules editor dispose cancels pending work through owner window after focus switch', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withOwnedFakeTimeoutWindows(async ({ switchActiveWindow, windowA, windowB }) => {
			container.ownerDocument = { defaultView: windowA } as unknown as typeof container.ownerDocument;
			const controller = renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				includeRules: ['docs/a.md'],
				excludeRules: [],
				useGlobPatterns: true,
				onChange: async () => undefined,
			});

			const input = container.querySelector('.read-only-view-rule-input');
			assert.ok(input);
			input.value = 'docs/cancelled.md';
			input.trigger('input');
			switchActiveWindow('B');
			controller.dispose();

			assert.deepEqual([...windowA.clearedIds].sort((left, right) => left - right), [1, 2]);
			assert.deepEqual(windowB.clearedIds, []);
		});
	} finally {
		dom.restore();
	}
});
