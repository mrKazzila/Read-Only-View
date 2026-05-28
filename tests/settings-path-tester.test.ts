import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS } from '../src/plugin-settings.js';
import { renderPathTester } from '../src/settings-path-tester.js';
import { installDomMocks, MockHTMLElement } from './helpers/dom-mocks.js';

function collectTexts(root: MockHTMLElement): string[] {
	return [root.textContent, ...root.getChildren().flatMap((child) => collectTexts(child))]
		.filter((value) => value.length > 0);
}

test('path tester renders empty-state prompt before input', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderPathTester(container as unknown as HTMLElement, { settings: { ...DEFAULT_SETTINGS } });

		assert.ok(collectTexts(container).includes('Enter a file path to test.'));
	} finally {
		dom.restore();
	}
});

test('path tester normalizes input path and renders include-only read-only result', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderPathTester(container as unknown as HTMLElement, {
			settings: {
				...DEFAULT_SETTINGS,
				enabled: true,
				useGlobPatterns: true,
				includeRules: ['docs/**'],
				excludeRules: [],
			},
		});

		const input = container.querySelector('input');
		assert.ok(input);
		input.value = '  ./docs\\\\guide.md  ';
		input.trigger('input');

		const texts = collectTexts(container);
		assert.ok(texts.includes('Matched include: docs/**'));
		assert.ok(texts.includes('Matched exclude: none'));
		assert.ok(texts.includes('Result: READ-ONLY ON'));
	} finally {
		dom.restore();
	}
});

test('path tester renders exclude override as read-only off', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		renderPathTester(container as unknown as HTMLElement, {
			settings: {
				...DEFAULT_SETTINGS,
				enabled: true,
				useGlobPatterns: true,
				includeRules: ['docs/**'],
				excludeRules: ['docs/private/**'],
			},
		});

		const input = container.querySelector('input');
		assert.ok(input);
		input.value = 'docs/private/secret.md';
		input.trigger('input');

		const texts = collectTexts(container);
		assert.ok(texts.includes('Matched include: docs/**'));
		assert.ok(texts.includes('Matched exclude: docs/private/**'));
		assert.ok(texts.includes('Result: READ-ONLY OFF'));
	} finally {
		dom.restore();
	}
});

test('path tester uses supplied compiled matcher instead of rebuilding from raw settings', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		const fakeMatcher = {
			matchIncludeRules: () => ['shared/include'],
			matchExcludeRules: () => [],
			shouldForceReadOnly: () => true,
		};

		renderPathTester(container as unknown as HTMLElement, {
			settings: {
				...DEFAULT_SETTINGS,
				enabled: true,
				useGlobPatterns: true,
				includeRules: [],
				excludeRules: [],
			},
			getCompiledRuleMatcher: () => fakeMatcher,
		});

		const input = container.querySelector('input');
		assert.ok(input);
		input.value = 'docs/guide.md';
		input.trigger('input');

		const texts = collectTexts(container);
		assert.ok(texts.includes('Matched include: shared/include'));
		assert.ok(texts.includes('Matched exclude: none'));
		assert.ok(texts.includes('Result: READ-ONLY ON'));
	} finally {
		dom.restore();
	}
});

test('path tester reflects matcher invalidation after rule changes', () => {
	const dom = installDomMocks();
	const container = new MockHTMLElement();

	try {
		let currentMatcher: {
			matchIncludeRules: () => string[];
			matchExcludeRules: () => string[];
			shouldForceReadOnly: () => boolean;
		} = {
			matchIncludeRules: () => ['docs/**'],
			matchExcludeRules: () => [],
			shouldForceReadOnly: () => true,
		};

		renderPathTester(container as unknown as HTMLElement, {
			settings: {
				...DEFAULT_SETTINGS,
				enabled: true,
				useGlobPatterns: true,
				includeRules: ['docs/**'],
				excludeRules: [],
			},
			getCompiledRuleMatcher: () => currentMatcher,
		});

		const input = container.querySelector('input');
		assert.ok(input);
		input.value = 'docs/private/secret.md';
		input.trigger('input');
		assert.ok(collectTexts(container).includes('Result: READ-ONLY ON'));

		currentMatcher = {
			matchIncludeRules: () => ['docs/**'],
			matchExcludeRules: () => ['docs/private/**'],
			shouldForceReadOnly: () => false,
		};
		input.trigger('input');

		const texts = collectTexts(container);
		assert.ok(texts.includes('Matched include: docs/**'));
		assert.ok(texts.includes('Matched exclude: docs/private/**'));
		assert.ok(texts.includes('Result: READ-ONLY OFF'));
	} finally {
		dom.restore();
	}
});
