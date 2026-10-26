import assert from 'node:assert/strict';
import test from 'node:test';

import { EditorState, StateEffect, Transaction } from '@codemirror/state';
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
	doc = '',
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
		doc,
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

test('protected hover editor rejects direct menu insertions, replacements, and deletions', async () => {
	const original = '```ts\nconst value = 1;\n```';
	const state = await createStateForInfo({ file: { path: 'docs/snippets.md' } }, {}, original);
	for (const changes of [
		{ from: 6, insert: '\n| A | B |\n| --- | --- |\n|   |   |\n' },
		{ from: 6, insert: '[[Note]]' },
		{ from: 6, insert: '\n1. Item\n' },
		{ from: 6, to: 11, insert: '**replacement**' },
		{ from: 0, to: original.length },
	]) {
		// Menu commands need not supply a userEvent annotation or a workspace leaf.
		const transaction = state.update({ changes });
		assert.equal(transaction.docChanged, false);
		assert.equal(transaction.state.doc.toString(), original);
	}
	for (const userEvent of ['input', 'input.paste', 'delete', 'undo', 'redo']) {
		assert.equal(state.update({ changes: { from: 0, insert: 'x' }, userEvent }).docChanged, false);
	}
});

test('protected editor still accepts selection, effects, and explicitly remote updates', async () => {
	const state = await createStateForInfo({ file: { path: 'docs/snippets.md' } }, {}, 'original');
	const effect = StateEffect.define<boolean>().of(true);
	const selection = state.update({ selection: { anchor: 1, head: 4 }, effects: effect });
	assert.equal(selection.state.selection.main.from, 1);
	assert.equal(selection.state.selection.main.to, 4);
	assert.deepEqual(selection.effects, [effect]);
	assert.equal(selection.state.doc.toString(), 'original');
	const remote = state.update({
		changes: { from: 0, to: state.doc.length, insert: 'updated externally' },
		annotations: Transaction.remote.of(true),
	});
	assert.equal(remote.state.doc.toString(), 'updated externally');
});

test('document change guard preserves edits for excluded, disabled, and unidentified contexts', async () => {
	for (const [info, settings] of [
		[{ file: { path: 'docs/private/note.md' } }, { excludeRules: ['docs/private/**'] }],
		[{ file: { path: 'docs/note.md' } }, { enabled: false }],
		[{ file: { path: 'notes/note.md' } }, {}],
		[{ file: { path: 'docs/note.txt' } }, {}],
		[{ file: null }, {}],
		[null, {}],
	] satisfies [unknown, Partial<ForceReadModeSettings>][]) {
		const state = await createStateForInfo(info, { ...settings }, 'original');
		assert.equal(state.update({ changes: { from: 0, insert: 'new ' } }).state.doc.toString(), 'new original');
	}
});

test('document change guard rechecks rules for an already open editor', async () => {
	const runtime = await import('obsidian') as unknown as ObsidianRuntime;
	runtime.__setEditorInfo({ file: { path: 'docs/snippets.md' } });
	let protectedPath = false;
	let state = EditorState.create({
		doc: 'original',
		extensions: [runtime.editorInfoField as never, createEditorReadOnlyExtension({
			shouldForceReadOnlyPath: () => protectedPath,
		})],
	});
	state = state.update({ changes: { from: 0, insert: 'a' } }).state;
	protectedPath = true;
	state = state.update({ changes: { from: 0, insert: 'blocked' } }).state;
	assert.equal(state.doc.toString(), 'aoriginal');
	protectedPath = false;
	state = state.update({ changes: { from: 0, insert: 'b' } }).state;
	assert.equal(state.doc.toString(), 'baoriginal');
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
