import assert from 'node:assert/strict';
import test from 'node:test';

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
	blockReadOnlyEnter,
	createEditorReadOnlyExtension,
	notifyReadOnlyInteraction,
} from '../src/editor-readonly.js';
import { createCompiledRuleMatcher, DEFAULT_SETTINGS, type ForceReadModeSettings } from '../src/matcher.js';

type ObsidianRuntime = {
	__setEditorInfo: (value: unknown) => void;
	editorInfoField: unknown;
};

async function createStateForInfo(
	info: unknown,
	settingsOverrides: Partial<ForceReadModeSettings> = {},
): Promise<EditorState> {
	const runtime = await import('obsidian') as unknown as ObsidianRuntime;
	const settings: ForceReadModeSettings = {
		...DEFAULT_SETTINGS,
		enabled: true,
		forceAllMarkdownReadOnly: false,
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: ['docs/**'],
		excludeRules: [],
		...settingsOverrides,
	};

	runtime.__setEditorInfo(info);
	const matcher = createCompiledRuleMatcher(settings);
	return EditorState.create({
		extensions: [
			runtime.editorInfoField as never,
			createEditorReadOnlyExtension({
				shouldForceReadOnlyPath: (path) => matcher.shouldForceReadOnly(path),
			}),
		],
	});
}

test('editor read-only extension marks matching path as read-only and non-editable', async () => {
	const state = await createStateForInfo({
		file: { path: 'docs/file.md', extension: 'md' },
	});

	assert.equal(state.readOnly, true);
	assert.equal(state.facet(EditorView.editable), false);
});

test('Enter is consumed in a protected hover editor without a workspace leaf', async () => {
	const state = await createStateForInfo({ file: { path: 'docs/snippets.md' } });
	const calls: string[] = [];
	const handled = blockReadOnlyEnter({
		key: 'Enter',
		preventDefault: () => calls.push('preventDefault'),
		stopImmediatePropagation: () => calls.push('stopImmediatePropagation'),
	}, state, {
		shouldForceReadOnlyPath: (path) => path === 'docs/snippets.md',
		onReadOnlyInteraction: (info, reason) => calls.push(`${info.file?.path}:${reason}`),
	});

	assert.equal(handled, true);
	assert.deepEqual(calls, [
		'preventDefault',
		'stopImmediatePropagation',
		'docs/snippets.md:editor-readonly:enter',
	]);
});

test('Enter guard preserves other keys and editable or unidentified editors', async () => {
	for (const { info, key, protectedPath } of [
		{ info: { file: { path: 'docs/snippets.md' } }, key: 'ArrowDown', protectedPath: true },
		{ info: { file: { path: 'docs/snippets.md' } }, key: 'c', protectedPath: true },
		{ info: { file: { path: 'docs/snippets.md' } }, key: 'Enter', protectedPath: false },
		{ info: { file: null }, key: 'Enter', protectedPath: true },
		{ info: null, key: 'Enter', protectedPath: true },
	]) {
		const state = await createStateForInfo(info);
		assert.equal(blockReadOnlyEnter({
			key,
			preventDefault: () => assert.fail('Unexpected prevented key'),
			stopImmediatePropagation: () => assert.fail('Unexpected stopped propagation'),
		}, state, { shouldForceReadOnlyPath: () => protectedPath }), false);
	}
});

test('Enter guard uses current rules when protection changes on an existing editor', async () => {
	const state = await createStateForInfo({ file: { path: 'docs/snippets.md' } });
	let protectedPath = false;
	let prevented = 0;
	const event = {
		key: 'Enter',
		preventDefault: () => { prevented++; },
		stopImmediatePropagation: () => {},
	};
	const dependencies = { shouldForceReadOnlyPath: () => protectedPath };
	assert.equal(blockReadOnlyEnter(event, state, dependencies), false);
	protectedPath = true;
	assert.equal(blockReadOnlyEnter(event, state, dependencies), true);
	protectedPath = false;
	assert.equal(blockReadOnlyEnter(event, state, dependencies), false);
	assert.equal(prevented, 1);
});

test('editor read-only extension keeps excluded path editable', async () => {
	const state = await createStateForInfo(
		{ file: { path: 'docs/private/file.md', extension: 'md' } },
		{ excludeRules: ['docs/private/**'] },
	);

	assert.equal(state.readOnly, false);
	assert.equal(state.facet(EditorView.editable), true);
});

test('editor read-only extension keeps non-matching path editable', async () => {
	const state = await createStateForInfo({
		file: { path: 'notes/file.md', extension: 'md' },
	});

	assert.equal(state.readOnly, false);
	assert.equal(state.facet(EditorView.editable), true);
});

test('editor read-only extension ignores missing or non-markdown files', async () => {
	const missingFileState = await createStateForInfo({ file: null });
	const nonMarkdownState = await createStateForInfo({
		file: { path: 'docs/file.txt', extension: 'txt' },
	});

	assert.equal(missingFileState.readOnly, false);
	assert.equal(missingFileState.facet(EditorView.editable), true);
	assert.equal(nonMarkdownState.readOnly, false);
	assert.equal(nonMarkdownState.facet(EditorView.editable), true);
});

test('editor read-only interaction callback fires only for matching read-only path', async () => {
	const calls: string[] = [];
	const readOnlyState = await createStateForInfo({
		file: { path: 'docs/file.md', extension: 'md' },
	});
	const editableState = await createStateForInfo({
		file: { path: 'notes/file.md', extension: 'md' },
	});
	const dependencies = {
		shouldForceReadOnlyPath: createCompiledRuleMatcher({
			...DEFAULT_SETTINGS,
			enabled: true,
			forceAllMarkdownReadOnly: false,
			useGlobPatterns: true,
			caseSensitive: true,
			includeRules: ['docs/**'],
			excludeRules: [],
			debug: false,
			debugVerbosePaths: false,
		}).shouldForceReadOnly,
		onReadOnlyInteraction: (_info: unknown, reason: string) => {
			calls.push(reason);
		},
	};

	notifyReadOnlyInteraction(readOnlyState, dependencies, 'editor-readonly:pointerdown');
	notifyReadOnlyInteraction(editableState, dependencies, 'editor-readonly:pointerdown');

	assert.deepEqual(calls, ['editor-readonly:pointerdown']);
});
