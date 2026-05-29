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

test('rules editor renders ignored-line warning after ignored indexes are updated', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			const controller = renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				title: 'Include rules',
				description: 'desc',
				initialText: 'docs/a.md\ndocs/b.md',
				useGlobPatterns: true,
				onChange: async () => undefined,
			});

			controller.setIgnoredLineIndexes([1]);
			await flushAll();
		});

		const texts = collectTexts(container);
		assert.ok(texts.includes('⚠️'));
		assert.ok(texts.includes(' Warning [2] docs/b.md'));
		assert.ok(texts.includes(' Ignored'));
		assert.ok(texts.includes('Ignored due to rule limit.'));
		assert.ok(container.querySelector('.read-only-view-diagnostics-item-ignored'));
	} finally {
		dom.restore();
	}
});

test('rules editor exposes textarea description and live save status to assistive tech', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			title: 'Include rules',
			description: 'One rule per line.',
			initialText: 'docs/a.md',
			useGlobPatterns: true,
			onChange: async () => undefined,
		});

		const textarea = container.querySelector('textarea');
		const saveStatus = container.querySelector('#read-only-view-include-rules-save-status');
		const diagnostics = container.querySelector('#read-only-view-include-rules-diagnostics');

		assert.ok(textarea);
		assert.equal(textarea.getAttr('aria-label'), 'Include rules');
		assert.equal(
			textarea.getAttr('aria-describedby'),
			'read-only-view-include-rules-description read-only-view-include-rules-save-status read-only-view-include-rules-diagnostics',
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
	const committed: string[] = [];

	try {
		renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			title: 'Include rules',
			description: 'desc',
			initialText: 'docs/a.md',
			useGlobPatterns: true,
			onChange: async (value) => {
				committed.push(value);
			},
		});

		const textarea = container.querySelector('textarea');
		assert.ok(textarea);

		await withFakeTimeouts(async ({ flushAll }) => {
			textarea.value = 'docs/updated.md';
			textarea.trigger('input');

			assert.ok(collectTexts(container).includes('Saving...'));
			await flushAll();
		});

		assert.deepEqual(committed, ['docs/updated.md']);
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
			title: 'Include rules',
			description: 'desc',
			initialText: 'docs/a.md',
			useGlobPatterns: true,
			onChange: async () => {
				throw new Error('save failed');
			},
		});

		const textarea = container.querySelector('textarea');
		assert.ok(textarea);

		await withFakeTimeouts(async ({ flushAll }) => {
			textarea.value = 'docs/b.md';
			textarea.trigger('input');
			await flushAll();
		});

		assert.ok(collectTexts(container).includes('Save failed.'));
	} finally {
		dom.restore();
	}
});

test('rules editor debounces diagnostics input and eventually renders latest state once', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				title: 'Include rules',
				description: 'desc',
				initialText: 'docs/a.md',
				useGlobPatterns: true,
				onChange: async () => undefined,
			});

			const textarea = container.querySelector('textarea');
			assert.ok(textarea);
			textarea.value = 'docs/first.md';
			textarea.trigger('input');
			textarea.value = 'docs/latest.md';
			textarea.trigger('input');

			const textsBeforeFlush = collectTexts(container);
			assert.ok(!textsBeforeFlush.includes(' OK [1] docs/latest.md'));

			await flushAll();

			const textsAfterFlush = collectTexts(container);
			assert.ok(textsAfterFlush.includes(' OK [1] docs/latest.md'));
			assert.ok(!textsAfterFlush.includes(' OK [1] docs/first.md'));
		});
	} finally {
		dom.restore();
	}
});

test('rules editor blur flushes pending diagnostics render immediately', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withFakeTimeouts(async () => {
			renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				title: 'Include rules',
				description: 'desc',
				initialText: 'docs/a.md',
				useGlobPatterns: true,
				onChange: async () => undefined,
			});

			const textarea = container.querySelector('textarea');
			assert.ok(textarea);
			textarea.value = 'docs/blurred.md';
			textarea.trigger('input');
			assert.ok(!collectTexts(container).includes(' OK [1] docs/blurred.md'));

			textarea.trigger('blur');
			assert.ok(collectTexts(container).includes(' OK [1] docs/blurred.md'));
		});
	} finally {
		dom.restore();
	}
});

test('rules editor dispose cancels pending diagnostics render', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withFakeTimeouts(async ({ flushAll }) => {
			const controller = renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				title: 'Include rules',
				description: 'desc',
				initialText: 'docs/a.md',
				useGlobPatterns: true,
				onChange: async () => undefined,
			});

			const textarea = container.querySelector('textarea');
			assert.ok(textarea);
			textarea.value = 'docs/cancelled.md';
			textarea.trigger('input');
			controller.dispose();

			await flushAll();

			const texts = collectTexts(container);
			assert.ok(!texts.includes(' OK [1] docs/cancelled.md'));
			assert.ok(texts.includes(' OK [1] docs/a.md'));
		});
	} finally {
		dom.restore();
	}
});

test('rules editor dispose clears diagnostics debounce through owner window after focus switch', async () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		await withOwnedFakeTimeoutWindows(async ({ switchActiveWindow, windowA, windowB }) => {
			container.ownerDocument = { defaultView: windowA } as unknown as typeof container.ownerDocument;
			const controller = renderRuleEditor({
				containerEl: container as unknown as HTMLElement,
				title: 'Include rules',
				description: 'desc',
				initialText: 'docs/a.md',
				useGlobPatterns: true,
				onChange: async () => undefined,
			});

			const textarea = container.querySelector('textarea');
			assert.ok(textarea);
			textarea.value = 'docs/cancelled.md';
			textarea.trigger('input');
			switchActiveWindow('B');
			controller.dispose();

			assert.deepEqual(windowA.clearedIds, [2, 1]);
			assert.deepEqual(windowB.clearedIds, []);
		});
	} finally {
		dom.restore();
	}
});
