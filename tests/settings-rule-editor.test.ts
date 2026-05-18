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

test('rules editor renders ignored-line warning after ignored indexes are updated', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		const controller = renderRuleEditor({
			containerEl: container as unknown as HTMLElement,
			title: 'Include rules',
			description: 'desc',
			initialText: 'docs/a.md\ndocs/b.md',
			useGlobPatterns: true,
			onChange: async () => undefined,
		});

		controller.setIgnoredLineIndexes([1]);

		const texts = collectTexts(container);
		assert.ok(texts.includes('⚠️ [2] docs/b.md'));
		assert.ok(texts.includes(' Ignored'));
		assert.ok(texts.includes('Ignored due to rule limit.'));
		assert.ok(container.querySelector('.read-only-view-diagnostics-item-ignored'));
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
