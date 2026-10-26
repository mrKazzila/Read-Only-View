import { EditorState, Prec, Transaction, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorInfoField, type MarkdownFileInfo } from 'obsidian';

export interface EditorReadOnlyDependencies {
	shouldForceReadOnlyPath: (path: string) => boolean;
	onReadOnlyInteraction?: (info: MarkdownFileInfo, reason: string) => void;
}

function shouldEditorBeReadOnly(
	path: string | null | undefined,
	shouldForceReadOnlyPath: (path: string) => boolean,
): boolean {
	if (!path) {
		return false;
	}
	return shouldForceReadOnlyPath(path);
}

export function notifyReadOnlyInteraction(
	state: EditorState,
	dependencies: EditorReadOnlyDependencies,
	reason: string,
): void {
	const info = state.field(editorInfoField, false);
	if (!info || !shouldEditorBeReadOnly(info.file?.path, dependencies.shouldForceReadOnlyPath)) {
		return;
	}
	dependencies.onReadOnlyInteraction?.(info, reason);
}

export function blockReadOnlyEnter(
	event: Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopImmediatePropagation'>,
	state: EditorState,
	dependencies: EditorReadOnlyDependencies,
): boolean {
	if (event.key !== 'Enter') {
		return false;
	}
	const info = state.field(editorInfoField, false);
	if (!shouldEditorBeReadOnly(info?.file?.path, dependencies.shouldForceReadOnlyPath)) {
		return false;
	}

	// Markdown commands may dispatch changes without respecting CM's readOnly facet.
	event.preventDefault();
	event.stopImmediatePropagation();
	notifyReadOnlyInteraction(state, dependencies, 'editor-readonly:enter');
	return true;
}

export function createEditorReadOnlyExtension(
	dependencies: EditorReadOnlyDependencies,
): Extension {
	const computeReadOnly = (state: EditorState): boolean => {
		const info = state.field(editorInfoField, false);
		return shouldEditorBeReadOnly(info?.file?.path, dependencies.shouldForceReadOnlyPath);
	};

	return [
		EditorState.changeFilter.of((transaction) => {
			// Menu commands can dispatch unannotated edits despite the readOnly facet.
			// Use current rules; existing editors can outlive a settings change.
			return !transaction.docChanged
				|| transaction.annotation(Transaction.remote) === true
				|| !computeReadOnly(transaction.startState);
		}),
		Prec.highest(EditorState.readOnly.compute([editorInfoField], computeReadOnly)),
		Prec.highest(EditorView.editable.compute([editorInfoField], (state) => !computeReadOnly(state))),
		Prec.highest(EditorView.domEventHandlers({
			keydown: (event, view) => blockReadOnlyEnter(event, view.state, dependencies),
		})),
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
