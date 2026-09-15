import assert from 'node:assert/strict';
import test from 'node:test';

import {
	resolutionToRuleEntry,
	resolveRuleSource,
	type RuleResolverContext,
} from '../src/rule-source.js';

function context(overrides: Partial<RuleResolverContext> = {}): RuleResolverContext {
	const files = new Set([
		'Inbox/Quick capture.md',
		'Notes/Привет мир.md',
	]);
	const folders = new Set([
		'Inbox',
		'Knowledge Base/Productivity',
	]);
	return {
		vaultName: 'demo-vault',
		vaultBasePath: '/Users/test/demo-vault',
		isMarkdownFile: (path) => files.has(path),
		isFolder: (path) => folders.has(path),
		...overrides,
	};
}

test('vault paths retain prefix and glob syntax without requiring an existing file', () => {
	const result = resolveRuleSource(' ./Archive/**/*.md ', context());
	assert.deepEqual(result, {
		sourceKind: 'vault-path',
		sourceValue: 'Archive/**/*.md',
		resolvedPath: 'Archive/**/*.md',
		error: null,
	});
});

test('Obsidian URL resolves encoded file path and restores omitted Markdown extension', () => {
	const result = resolveRuleSource(
		'obsidian://open?vault=demo-vault&file=Inbox%2FQuick%20capture',
		context(),
	);
	assert.equal(result.sourceKind, 'obsidian-uri');
	assert.equal(result.resolvedPath, 'Inbox/Quick capture.md');
	assert.equal(result.error, null);
});

test('Obsidian URL copied for the Async IO note resolves without relying on custom-scheme host parsing', () => {
	const result = resolveRuleSource(
		'obsidian://open?vault=demo-vault&file=Knowledge%20Base%2FProgramming%2FPython%2FAsync%20IO%20notes',
		context({
			isMarkdownFile: (path) => path === 'Knowledge Base/Programming/Python/Async IO notes.md',
		}),
	);
	assert.deepEqual(result, {
		sourceKind: 'obsidian-uri',
		sourceValue: 'obsidian://open?vault=demo-vault&file=Knowledge%20Base%2FProgramming%2FPython%2FAsync%20IO%20notes',
		resolvedPath: 'Knowledge Base/Programming/Python/Async IO notes.md',
		error: null,
	});
});

test('Obsidian URL supports Unicode and removes heading or block locators', () => {
	const result = resolveRuleSource(
		'obsidian://open?vault=demo-vault&file=Notes%2F%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%20%D0%BC%D0%B8%D1%80%23Heading',
		context(),
	);
	assert.equal(result.resolvedPath, 'Notes/Привет мир.md');
});

test('Obsidian URL rejects malformed encoding, another vault, and traversal', () => {
	assert.match(resolveRuleSource(
		'obsidian://open?vault=demo-vault&file=Inbox%2GQuick',
		context(),
	).error ?? '', /malformed percent/i);
	assert.match(resolveRuleSource(
		'obsidian://open?vault=other&file=Inbox%2FQuick%20capture',
		context(),
	).error ?? '', /current vault/i);
	assert.match(resolveRuleSource(
		'obsidian://open?vault=demo-vault&file=..%2Fsecret',
		context(),
	).error ?? '', /parent path/i);
});

test('absolute Unix and Windows paths resolve only inside the current vault', () => {
	assert.equal(
		resolveRuleSource('/Users/test/demo-vault/Inbox/Quick capture.md', context()).resolvedPath,
		'Inbox/Quick capture.md',
	);
	assert.equal(
		resolveRuleSource(
			'C:\\Users\\test\\demo-vault\\Inbox\\Quick capture.md',
			context({ vaultBasePath: 'C:\\Users\\test\\demo-vault' }),
		).resolvedPath,
		'Inbox/Quick capture.md',
	);
	assert.match(
		resolveRuleSource('/Users/test/other/Inbox/Quick capture.md', context()).error ?? '',
		/outside/i,
	);
});

test('absolute folder paths resolve to portable vault folder rules', () => {
	assert.deepEqual(
		resolveRuleSource('/Users/test/demo-vault/Knowledge Base/Productivity/', context()),
		{
			sourceKind: 'absolute-path',
			sourceValue: '/Users/test/demo-vault/Knowledge Base/Productivity/',
			resolvedPath: 'Knowledge Base/Productivity/',
			error: null,
		},
	);
	assert.equal(
		resolveRuleSource('/Users/test/demo-vault/Knowledge Base/Productivity', context()).resolvedPath,
		'Knowledge Base/Productivity/',
	);
});

test('absolute paths reject traversal, missing directories, non-Markdown, and mobile import', () => {
	assert.match(resolveRuleSource(
		'/Users/test/demo-vault/Inbox/../secret.md',
		context(),
	).error ?? '', /parent path/i);
	assert.match(resolveRuleSource(
		'/Users/test/demo-vault/Missing folder/',
		context(),
	).error ?? '', /folder not found/i);
	assert.match(resolveRuleSource(
		'/Users/test/demo-vault/Inbox/image.png',
		context(),
	).error ?? '', /Markdown files only/i);
	assert.match(resolveRuleSource(
		'/Users/test/demo-vault/Inbox/Quick capture.md',
		context({ vaultBasePath: null }),
	).error ?? '', /desktop app/i);
});

test('obsidian path parameter resolves through the absolute path flow', () => {
	const result = resolveRuleSource(
		'obsidian://open?path=%2FUsers%2Ftest%2Fdemo-vault%2FInbox%2FQuick%20capture.md',
		context(),
	);
	assert.equal(result.sourceKind, 'obsidian-uri');
	assert.equal(result.resolvedPath, 'Inbox/Quick capture.md');
});

test('successful absolute import does not persist its sensitive source path', () => {
	const resolution = resolveRuleSource(
		'/Users/private-name/demo-vault/Inbox/Quick capture.md',
		context({ vaultBasePath: '/Users/private-name/demo-vault' }),
	);
	assert.deepEqual(resolutionToRuleEntry(resolution, true), {
		sourceKind: 'absolute-path',
		sourceValue: 'Inbox/Quick capture.md',
		resolvedPath: 'Inbox/Quick capture.md',
		enabled: true,
	});
});

test('successful absolute folder import persists only the portable vault path', () => {
	const resolution = resolveRuleSource(
		'/Users/private-name/demo-vault/Knowledge Base/Productivity/',
		context({ vaultBasePath: '/Users/private-name/demo-vault' }),
	);
	assert.deepEqual(resolutionToRuleEntry(resolution, true), {
		sourceKind: 'absolute-path',
		sourceValue: 'Knowledge Base/Productivity/',
		resolvedPath: 'Knowledge Base/Productivity/',
		enabled: true,
	});
});
