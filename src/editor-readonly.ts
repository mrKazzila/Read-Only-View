import { EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorInfoField, type MarkdownFileInfo } from 'obsidian';
import { shouldForceReadOnly } from './matcher';
import type { ForceReadModeSettings } from './plugin-types';

export interface EditorReadOnlyDependencies {
	getSettings: () => ForceReadModeSettings;
	onReadOnlyInteraction?: (info: MarkdownFileInfo, reason: string) => void;
}

function shouldEditorBeReadOnly(
	path: string | null | undefined,
	getSettings: () => ForceReadModeSettings,
): boolean {
	if (!path) {
		return false;
	}
	return shouldForceReadOnly(path, getSettings());
}

export function notifyReadOnlyInteraction(
	state: EditorState,
	dependencies: EditorReadOnlyDependencies,
	reason: string,
): void {
	const info = state.field(editorInfoField, false);
	if (!info || !shouldEditorBeReadOnly(info.file?.path, dependencies.getSettings)) {
		return;
	}
	dependencies.onReadOnlyInteraction?.(info, reason);
}

export function createEditorReadOnlyExtension(
	dependencies: EditorReadOnlyDependencies,
): Extension {
	const computeReadOnly = (state: EditorState): boolean => {
		const info = state.field(editorInfoField, false);
		return shouldEditorBeReadOnly(info?.file?.path, dependencies.getSettings);
	};

	return [
		Prec.highest(EditorState.readOnly.compute([editorInfoField], computeReadOnly)),
		Prec.highest(EditorView.editable.compute([editorInfoField], (state) => !computeReadOnly(state))),
		Prec.highest(EditorView.domEventObservers({
			pointerdown: (_event, view) => {
				notifyReadOnlyInteraction(view.state, dependencies, 'editor-readonly:pointerdown');
			},
			focus: (_event, view) => {
				notifyReadOnlyInteraction(view.state, dependencies, 'editor-readonly:focus');
			},
		})),
	];
}
