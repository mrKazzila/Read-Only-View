import { ReadOnlyStatusModal } from '../src/read-only-status-modal.js';
import { installDomMocks, type MockHTMLElement } from './helpers/dom-mocks.js';
import { App, TFile, TFolder, type Menu, type MenuItem, type Vault } from 'obsidian';
import { mergeLoadedSettings } from '../src/plugin-settings.js';
import { explainNote, explainFolder, type ReadOnlyExplanation } from '../src/read-only-explanation.js';
import { addPathContextMenu, markdownDescendantPaths } from '../src/path-context-menu.js';
import { RULE_LIMIT_INCLUDE_MAX } from '../src/constants.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPathTesterResult, buildRuleDiagnostics } from '../src/rule-diagnostics.js';
import { createCompiledRuleMatcher, DEFAULT_SETTINGS } from '../src/matcher.js';

test('empty diagnostic line stays empty in prefix mode and keeps empty-line warning', () => {
	const diagnostics = buildRuleDiagnostics('', false);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.normalized, '');
	assert.equal(diagnostics[0]?.warnings.includes('Empty or whitespace-only line.'), true);
	assert.equal(
		diagnostics[0]?.warnings.some((warning) => warning.includes('Prefix mode folder hint applied')),
		false,
	);
});

test('empty diagnostic line stays empty in glob mode', () => {
	const diagnostics = buildRuleDiagnostics('', true);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.normalized, '');
	assert.equal(diagnostics[0]?.warnings.includes('Empty or whitespace-only line.'), true);
});

test('non-empty prefix diagnostics keep existing normalization behavior', () => {
	const diagnostics = buildRuleDiagnostics('docs', false);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.normalized, 'docs/');
	assert.equal(
		diagnostics[0]?.warnings.some((warning) => warning.includes('Prefix mode folder hint applied')),
		true,
	);
});

test('diagnostics provide inline-renderable warning data for suspicious prefix rules', () => {
	const diagnostics = buildRuleDiagnostics('*', false);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.isOk, false);
	assert.equal(diagnostics[0]?.warnings.length, 1);
	assert.equal(
		diagnostics[0]?.warnings[0],
		'Contains wildcard in prefix mode. It is treated as a literal character.',
	);
});

test('diagnostics provide empty warnings for healthy rules', () => {
	const diagnostics = buildRuleDiagnostics('docs/**', true);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0]?.isOk, true);
	assert.deepEqual(diagnostics[0]?.warnings, []);
});

test('path tester helper returns include/exclude matches and final read-only state', () => {
	const settings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		forceAllMarkdownReadOnly: false,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: ['docs/**'],
		excludeRules: ['docs/private/**'],
	};

	const included = buildPathTesterResult('docs/guide.md', settings);
	assert.deepEqual(included.includeMatches, ['docs/**']);
	assert.deepEqual(included.excludeMatches, []);
	assert.equal(included.finalReadOnly, true);

	const excluded = buildPathTesterResult('docs/private/secrets.md', settings);
	assert.deepEqual(excluded.includeMatches, ['docs/**']);
	assert.deepEqual(excluded.excludeMatches, ['docs/private/**']);
	assert.equal(excluded.finalReadOnly, false);
});

test('path tester reports exclude override when all-Markdown preset is enabled', () => {
	const settings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		forceAllMarkdownReadOnly: true,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: [],
		excludeRules: ['docs/private/**'],
	};

	const excluded = buildPathTesterResult('docs/private/secrets.md', settings);
	assert.deepEqual(excluded.excludeMatches, ['docs/private/**']);
	assert.equal(excluded.finalReadOnly, false);
	assert.equal(excluded.presetApplied, false);

	const protectedPath = buildPathTesterResult('docs/public/guide.md', settings);
	assert.deepEqual(protectedPath.excludeMatches, []);
	assert.equal(protectedPath.finalReadOnly, true);
	assert.equal(protectedPath.presetApplied, true);
});

test('path tester uses effective rules and does not match ignored tail rules', () => {
	const includeRules = Array.from({ length: 200 }, (_, index) => `notes/${index}.md`);
	includeRules.push('notes/ignored.md');
	const settings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		forceAllMarkdownReadOnly: false,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules,
		excludeRules: [],
	};

	const result = buildPathTesterResult('notes/ignored.md', settings);
	assert.deepEqual(result.includeMatches, []);
	assert.equal(result.finalReadOnly, false);
});

test('path tester helper preserves diagnostics result when reusing a compiled matcher', () => {
	const settings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		forceAllMarkdownReadOnly: false,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: ['docs/**'],
		excludeRules: ['docs/private/**'],
	};

	const withoutReuse = buildPathTesterResult('docs/private/secret.md', settings);
	const withReuse = buildPathTesterResult(
		'docs/private/secret.md',
		settings,
		createCompiledRuleMatcher(settings),
	);

	assert.deepEqual(withReuse, withoutReuse);
});

const settingsFor = (overrides = {}) => mergeLoadedSettings({ forceAllMarkdownReadOnly: false, includeRules: ['folder/'], ...overrides });

for (const [name, overrides, path, expected, reason] of [
	['prefix include', {}, 'folder/a.md', true, 'Matched an Include rule.'],
	['no include', {}, 'other/a.md', false, 'No Include rule matched this note.'],
	['exclude', { excludeRules: ['folder/'] }, 'folder/a.md', false, 'An Exclude rule takes priority.'],
	['global', { forceAllMarkdownReadOnly: true }, 'other/a.md', true, 'All Markdown files mode protects this note.'],
	['global exclude', { forceAllMarkdownReadOnly: true, excludeRules: ['folder/'] }, 'folder/a.md', false, 'An Exclude rule takes priority.'],
	['disabled', { enabled: false, forceAllMarkdownReadOnly: true, excludeRules: ['folder/'] }, 'folder/a.md', false, 'Plugin is disabled.'],
	['glob', { useGlobPatterns: true, includeRules: ['**/README.md'] }, 'folder/sub/README.md', true, 'Matched an Include rule.'],
	['case sensitive', { caseSensitive: true }, 'Folder/a.md', false, 'No Include rule matched this note.'],
	['case insensitive', { caseSensitive: false }, 'Folder/a.md', true, 'Matched an Include rule.'],
] as const) {
	test(`note explanation: ${name}`, () => {
		const settings = settingsFor(overrides);
		const matcher = createCompiledRuleMatcher(settings);
		const { reason: actualReason, ...result } = explainNote(path, settings, matcher);
		assert.deepEqual(result, buildPathTesterResult(path, settings, matcher));
		assert.equal(result.finalReadOnly, expected);
		assert.equal(result.finalReadOnly, matcher.shouldForceReadOnly(path));
		assert.equal(actualReason, reason);
	});
}

test('diagnostics preserve resolved exact entries, disabled entries and rule limits', () => {
	const settings = settingsFor({ includeRules: Array.from({ length: RULE_LIMIT_INCLUDE_MAX }, (_, i) => `x${i}/`).concat('folder/') });
	assert.equal(explainNote('folder/a.md', settings, createCompiledRuleMatcher(settings)).finalReadOnly, false);
	const resolved = settingsFor({ includeRuleEntries: [
		{ sourceKind: 'obsidian-uri', sourceValue: 'obsidian://open?vault=test&file=folder%2Fa.md', resolvedPath: 'folder/a.md', enabled: true },
	] });
	const matcher = createCompiledRuleMatcher(resolved);
	assert.equal(explainNote('folder/a.md', resolved, matcher).finalReadOnly, true);
	assert.equal(explainNote('folder/a.md/child.md', resolved, matcher).finalReadOnly, false);
	for (const path of ['folder/a.md', 'folder/a.md/child.md']) {
		const { reason: _reason, ...result } = explainNote(path, resolved, matcher);
		assert.deepEqual(result, buildPathTesterResult(path, resolved, matcher));
	}
	const disabled = settingsFor({ includeRuleEnabled: [false] });
	assert.equal(explainNote('folder/a.md', disabled, createCompiledRuleMatcher(disabled)).finalReadOnly, false);
});

test('folder aggregates actual descendants with excludes, globs, global mode and disabled state', () => {
	const paths = ['folder/a.md', 'folder/sub/README.md'];
	for (const [overrides, status, protectedCount] of [
		[{}, 'ALL PROTECTED', 2],
		[{ excludeRules: ['folder/sub/'] }, 'MIXED', 1],
		[{ includeRules: [] }, 'NOT PROTECTED', 0],
		[{ useGlobPatterns: true, includeRules: ['**/README.md'] }, 'MIXED', 1],
		[{ includeRules: [], forceAllMarkdownReadOnly: true }, 'ALL PROTECTED', 2],
		[{ forceAllMarkdownReadOnly: true, excludeRules: ['folder/sub/'] }, 'MIXED', 1],
		[{ enabled: false, forceAllMarkdownReadOnly: true }, 'NOT PROTECTED', 0],
	] as const) {
		const settings = settingsFor(overrides);
		const result = explainFolder(paths, settings, createCompiledRuleMatcher(settings));
		assert.equal(result.status, status);
		assert.equal(result.protectedCount, protectedCount);
		assert.equal(result.total, 2);
		assert.equal(result.editableCount, 2 - protectedCount);
	}
	const settings = settingsFor();
	assert.equal(explainFolder([], settings, createCompiledRuleMatcher(settings)).status, 'NO MARKDOWN NOTES');
});

test('folder rule unions follow effective order, deduplicate and bound examples', () => {
	const settings = settingsFor({ includeRules: ['folder/sub/', 'folder/', 'folder/'], excludeRules: ['folder/'] });
	const result = explainFolder(['folder/a.md', ...Array.from({ length: 50 }, (_, i) => `folder/sub/${i}.md`)], settings, createCompiledRuleMatcher(settings));
	assert.deepEqual(result.includeMatches, ['folder/sub/', 'folder/']);
	assert.deepEqual(result.excludeMatches, ['folder/']);
	assert.equal(result.editableExamples.length, 5);
	assert.equal(result.total, 51);
});

test('menu diagnostics traverse nested Markdown metadata, acquire matcher once and never mutate', () => {
	const note = (path: string, extension = 'md') => Object.assign(new TFile(), { path, extension });
	const nested = Object.assign(new TFolder(), { path: 'folder/sub', children: [note('folder/sub/b.MD', 'MD'), note('folder/sub/image.png', 'png')] });
	const folder = Object.assign(new TFolder(), { path: 'folder', children: [note('folder/a.md'), nested, note('folder/data.json', 'json')] });
	assert.deepEqual([...markdownDescendantPaths(folder)], ['folder/a.md', 'folder/sub/b.MD']);
	const settings = settingsFor();
	const before = structuredClone(settings);
	let acquisitions = 0;
	let shown: ReadOnlyExplanation | undefined;
	const fail = () => { throw new Error('Diagnostics must not mutate'); };
	const plugin = { settings, saveSettings: fail, refreshEditorOptions: fail, applyAllOpenMarkdownLeaves: fail,
		getCompiledRuleMatcher: () => { acquisitions++; return createCompiledRuleMatcher(settings); } };
	for (const target of [folder, note('folder/a.md')]) {
		const actions = new Map<string, () => void>();
		const menu = { addItem(callback: (item: MenuItem) => void) {
			let title = '';
			const item = { setTitle(value: string) { title = value; return this; }, setIcon() { return this; },
				onClick(action: () => void) { actions.set(title, action); return this; } };
			callback(item as unknown as MenuItem);
		} } as unknown as Menu;
		addPathContextMenu(menu, target, plugin, {} as Vault, (result) => { shown = result; });
		assert.equal(acquisitions, target === folder ? 0 : 1);
		actions.get('Explain read-only status')!();
		assert.equal(shown?.kind, target === folder ? 'folder' : 'note');
		assert.deepEqual(settings, before);
	}
	assert.equal(acquisitions, 2);
});


test('folder summaries retain the exact rule representation reported by Path tester', () => {
	const settings = settingsFor();
	settings.includeRuleEntries = undefined;
	settings.includeRules = [' folder/ '];
	const matcher = createCompiledRuleMatcher(settings);
	const expected = buildPathTesterResult('folder/a.md', settings, matcher).includeMatches;
	assert.deepEqual(expected, [' folder/ ']);
	assert.deepEqual(explainFolder(['folder/a.md'], settings, matcher).includeMatches, expected);
});


test('status modal keeps note and folder values static with initial focus on Close', () => {
	const dom = installDomMocks();
	try {
		const settings = settingsFor();
		const matcher = createCompiledRuleMatcher(settings);
		const explanations: ReadOnlyExplanation[] = [
			{ kind: 'note', path: 'folder/a.md', result: explainNote('folder/a.md', settings, matcher) },
			{ kind: 'folder', path: 'folder/', result: explainFolder(['folder/a.md'], settings, matcher) },
			{ kind: 'folder', path: 'other/', result: explainFolder(['other/a.md'], settings, matcher) },
			{ kind: 'folder', path: 'empty/', result: explainFolder([], settings, matcher) },
		];
		for (const explanation of explanations) {
			const modal = new ReadOnlyStatusModal(new App(), explanation);
			modal.open();
			const content = modal.contentEl as unknown as MockHTMLElement;
			assert.equal(content.querySelectorAll('[tabindex]').length, 0);
			assert.equal(content.querySelectorAll('[aria-label]').length, 0);
			if (explanation.kind === 'note') {
				assert.deepEqual(content.querySelectorAll('h3').map((el) => el.textContent), ['Reason', 'Matched rules']);
				assert.deepEqual(content.querySelectorAll('dt').map((el) => el.textContent), ['Include', 'Exclude']);
				assert.deepEqual(content.querySelectorAll('code').map((el) => el.textContent), ['folder/a.md', 'folder/']);
				assert.equal(content.querySelectorAll('[tabindex]').length, 0);
				assert.equal(content.querySelectorAll('[aria-label]').length, 0);
			}
			if (explanation.kind === 'folder') {
				assert.equal(content.querySelector('strong')?.textContent, explanation.result.status);
				assert.equal(content.querySelector('code')?.textContent, explanation.path);
				assert.deepEqual(content.querySelectorAll('dt').map((el) => el.textContent), explanation.result.total ? ['Include', 'Exclude'] : []);
				const codeValues = content.querySelectorAll('code').map((el) => el.textContent);
				for (const example of explanation.result.editableExamples) assert.ok(codeValues.includes(example));
			}
			const close = content.querySelector('button');
			assert.ok(close);
			assert.equal(close.textContent, 'Close');
			assert.equal(content.ownerDocument?.activeElement, close);
			close.trigger('click');
			assert.equal(content.querySelectorAll('button').length, 0);
		}
	} finally {
		dom.restore();
	}
});
