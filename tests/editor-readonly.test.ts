import assert from 'node:assert/strict';
import test from 'node:test';

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
	createEditorReadOnlyExtension,
	notifyReadOnlyInteraction,
} from '../src/editor-readonly.js';
import { DEFAULT_SETTINGS, type ForceReadModeSettings } from '../src/matcher.js';

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
		useGlobPatterns: true,
		caseSensitive: true,
		includeRules: ['docs/**'],
		excludeRules: [],
		...settingsOverrides,
	};

	runtime.__setEditorInfo(info);
	return EditorState.create({
		extensions: [
			runtime.editorInfoField as never,
			createEditorReadOnlyExtension({
				getSettings: () => settings,
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
		getSettings: () => ({
			...DEFAULT_SETTINGS,
			enabled: true,
			useGlobPatterns: true,
			caseSensitive: true,
			includeRules: ['docs/**'],
			excludeRules: [],
			debug: false,
			debugVerbosePaths: false,
		}),
		onReadOnlyInteraction: (_info: unknown, reason: string) => {
			calls.push(reason);
		},
	};

	notifyReadOnlyInteraction(readOnlyState, dependencies, 'editor-readonly:pointerdown');
	notifyReadOnlyInteraction(editableState, dependencies, 'editor-readonly:pointerdown');

	assert.deepEqual(calls, ['editor-readonly:pointerdown']);
});
