import { Modal, type App } from 'obsidian';
import type { ReadOnlyExplanation } from './read-only-explanation';

export class ReadOnlyStatusModal extends Modal {
	constructor(app: App, private readonly explanation: ReadOnlyExplanation) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const explanation = this.explanation;
		contentEl.empty();
		contentEl.addClass('read-only-view-status-modal');
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- Plugin's proper name.
		contentEl.createEl('h2', { text: 'Read Only View' });
		contentEl.createEl('p', { text: explanation.path });
		if (explanation.kind === 'note') {
			contentEl.createEl('strong', { text: explanation.result.finalReadOnly ? 'READ-ONLY ON' : 'READ-ONLY OFF' });
			this.section('Reason', [explanation.result.reason]);
			this.section('Matched include', explanation.result.includeMatches);
			this.section('Matched exclude', explanation.result.excludeMatches);
		} else {
			const result = explanation.result;
			contentEl.createEl('strong', { text: result.status });
			contentEl.createEl('p', { text: `Markdown notes: ${result.total} · Protected: ${result.protectedCount} · Editable: ${result.editableCount}` });
			if (result.total === 0) {
				contentEl.createEl('p', { text: 'No Markdown notes were found in this folder.' });
			} else {
				this.section('Matched include rules', result.includeMatches);
				this.section('Matched exclude rules', result.excludeMatches);
				if (result.editableExamples.length) this.section('Editable examples', result.editableExamples);
			}
		}
		const actions = contentEl.createDiv({ cls: 'modal-button-container' });
		const closeButton = actions.createEl('button', { text: 'Close', type: 'button' });
		closeButton.addEventListener('click', () => this.close());
		(contentEl.querySelector<HTMLElement>('.read-only-view-status-values') ?? closeButton).focus();
	}

	private section(title: string, values: string[]): void {
		this.contentEl.createEl('h3', { text: title });
		const list = this.contentEl.createDiv({ cls: 'read-only-view-status-values' });
		list.setAttr('tabindex', '0');
		list.setAttr('role', 'region');
		list.setAttr('aria-label', title);
		for (const value of values.length ? values : ['None']) list.createDiv({ text: value });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
