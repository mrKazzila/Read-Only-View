import assert from 'node:assert/strict';
import test from 'node:test';

import { renderRuleEditor } from '../src/settings-rule-editor.js';
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
		assert.ok(texts.includes('Exclude rules always win. Enabled is visual-only in this version.'));
		assert.ok(texts.includes('Rule examples in readme'));
		assert.ok(texts.includes('Examples: Notes/Summaries/ · Notes/Summaries/file.md · Archive/**/*.md · !Drafts/'));
		assert.ok(texts.includes('Contains wildcard in prefix mode. It is treated as a literal character.'));
		assert.equal(container.querySelectorAll('.read-only-view-rule-row').length, 2);
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
