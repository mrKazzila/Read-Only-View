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
		this.containerEl.addClass('read-only-view-status-container');
		this.modalEl.addClass('read-only-view-status-dialog');
		contentEl.createEl('h2', { text: 'Read only view' });
		const pathEl = contentEl.createEl('p', { cls: 'read-only-view-status-path' });
		pathEl.createEl('code', { text: explanation.path });
		if (explanation.kind === 'note') {
			contentEl.createEl('strong', {
				text: explanation.result.finalReadOnly ? 'READ-ONLY ON' : 'READ-ONLY OFF',
				cls: 'read-only-view-status-result',
			});
			contentEl.createEl('h3', { text: 'Reason' });
			contentEl.createEl('p', { text: explanation.result.reason });
			this.matchedRules(explanation.result.includeMatches, explanation.result.excludeMatches);
		} else {
			const result = explanation.result;
			contentEl.createEl('strong', { text: result.status, cls: 'read-only-view-status-result' });
			contentEl.createEl('p', { text: `Markdown notes: ${result.total} · Protected: ${result.protectedCount} · Editable: ${result.editableCount}` });
			if (result.total === 0) {
				contentEl.createEl('p', { text: 'No Markdown notes were found in this folder.' });
			} else {
				this.matchedRules(result.includeMatches, result.excludeMatches);
				if (result.editableExamples.length) {
					contentEl.createEl('h3', { text: 'Editable examples' });
					for (const path of result.editableExamples) contentEl.createDiv().createEl('code', { text: path });
				}
			}
		}
		const actions = contentEl.createDiv({ cls: 'modal-button-container' });
		const closeButton = actions.createEl('button', { text: 'Close', type: 'button' });
		closeButton.addEventListener('click', () => this.close());
		closeButton.focus();
	}

	private ruleRow(container: HTMLElement, label: string, values: string[]): void {
		container.createEl('dt', { text: label });
		const valueEl = container.createEl('dd');
		if (!values.length) valueEl.createSpan({ text: 'None', cls: 'read-only-view-muted' });
		for (const value of values) valueEl.createDiv().createEl('code', { text: value });
	}

	private matchedRules(includes: string[], excludes: string[]): void {
		this.contentEl.createEl('h3', { text: 'Matched rules' });
		const rules = this.contentEl.createEl('dl', { cls: 'read-only-view-status-rules' });
		this.ruleRow(rules, 'Include', includes);
		this.ruleRow(rules, 'Exclude', excludes);
	}

	// Native Modal owns teardown; onOpen clears content if this instance is reused.
}
