import { Setting } from 'obsidian';
import { DebouncedRenderScheduler } from './debounced-render';
import {
	buildRuleDiagnosticsWithIgnoredLines,
	type RuleDiagnosticsEntry,
} from './rule-diagnostics';

type RuleSaveState = 'saving' | 'saved' | 'error';

const RULES_SAVE_DEBOUNCE_MS = 400;
const DIAGNOSTICS_RENDER_DEBOUNCE_MS = 75;

export type RuleEditorController = {
	setIgnoredLineIndexes: (lineIndexes: number[]) => void;
	dispose: () => void;
};

type RenderRuleEditorOptions = {
	containerEl: HTMLElement;
	title: string;
	description: string;
	initialText: string;
	useGlobPatterns: boolean;
	onChange: (value: string) => Promise<void>;
	onTextInput?: (value: string) => void;
};

function buildElementId(title: string, suffix: string): string {
	return `read-only-view-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`;
}

export class DebouncedRuleChangeSaver {
	private timer: ReturnType<Window['setTimeout']> | null = null;
	private lastValue = '';
	private running = false;
	private pendingRun = false;
	private disposed = false;

	constructor(
		private readonly delayMs: number,
		private readonly commit: (value: string) => Promise<void>,
		private readonly onStateChange: (state: RuleSaveState) => void,
	) {}

	schedule(value: string): void {
		if (this.disposed) {
			return;
		}
		this.lastValue = value;
		this.onStateChange('saving');
		if (this.timer) {
			activeWindow.clearTimeout(this.timer);
		}
		this.timer = activeWindow.setTimeout(() => {
			this.timer = null;
			void this.runCommit();
		}, this.delayMs);
	}

	async flush(value?: string): Promise<void> {
		if (this.disposed) {
			return;
		}
		if (value !== undefined) {
			this.lastValue = value;
		}
		if (this.timer) {
			activeWindow.clearTimeout(this.timer);
			this.timer = null;
		}
		this.onStateChange('saving');
		await this.runCommit();
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.pendingRun = false;
		if (this.timer) {
			activeWindow.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private async runCommit(): Promise<void> {
		if (this.disposed) {
			return;
		}
		if (this.running) {
			this.pendingRun = true;
			return;
		}

		this.running = true;
		try {
			await this.commit(this.lastValue);
			if (!this.disposed) {
				this.onStateChange('saved');
			}
		} catch {
			if (!this.disposed) {
				this.onStateChange('error');
			}
		} finally {
			this.running = false;
			if (!this.disposed && this.pendingRun) {
				this.pendingRun = false;
				await this.runCommit();
			}
		}
	}
}

function renderDiagnosticsSummary(itemEl: HTMLElement, entry: RuleDiagnosticsEntry): HTMLElement {
	const summaryEl = itemEl.createDiv({
		cls: 'read-only-view-diagnostics-summary',
	});
	summaryEl.createSpan({
		text: entry.isOk ? '✅' : '⚠️',
		cls: 'read-only-view-diagnostics-icon',
	}).setAttr('aria-hidden', 'true');
	summaryEl.createSpan({
		text: ` ${entry.isOk ? 'OK' : 'Warning'} [${entry.lineNumber}] ${entry.normalized || '(empty line)'}`,
	});
	return summaryEl;
}

function renderDiagnosticsList(
	diagnosticsEl: HTMLElement,
	entries: RuleDiagnosticsEntry[],
): void {
	diagnosticsEl.querySelectorAll('ul').forEach((el) => el.remove());
	const listEl = diagnosticsEl.createEl('ul', { cls: 'read-only-view-diagnostics-list' });
	for (const entry of entries) {
		const itemEl = listEl.createEl('li', {
			cls: [
				entry.isOk ? 'read-only-view-diagnostics-item-ok' : 'read-only-view-diagnostics-item-warning',
				entry.ignoredByRuleLimit ? 'read-only-view-diagnostics-item-ignored' : '',
			].filter(Boolean).join(' '),
		});
		const summaryEl = renderDiagnosticsSummary(itemEl, entry);
		if (entry.ignoredByRuleLimit) {
			summaryEl.createSpan({
				text: ' Ignored',
				cls: 'read-only-view-diagnostics-ignored-pill',
			});
		}
		if (entry.warnings.length > 0) {
			const warningsListEl = itemEl.createEl('ul', { cls: 'read-only-view-diagnostics-warnings' });
			for (const warning of entry.warnings) {
				warningsListEl.createEl('li', {
					text: warning,
					cls: 'read-only-view-diagnostics-warning',
				});
			}
		}
	}
}

export function renderRuleEditor(options: RenderRuleEditorOptions): RuleEditorController {
	const { containerEl } = options;
	let currentText = options.initialText;
	let ignoredLineIndexes = new Set<number>();

	const sectionEl = containerEl.createDiv({ cls: 'read-only-view-rule-section' });
	const descriptionId = buildElementId(options.title, 'description');
	const saveStatusId = buildElementId(options.title, 'save-status');
	const diagnosticsId = buildElementId(options.title, 'diagnostics');
	new Setting(sectionEl).setName(options.title).setHeading();
	const descriptionEl = sectionEl.createEl('p', {
		text: options.description,
		cls: 'setting-item-description',
	});
	descriptionEl.setAttr('id', descriptionId);

	const textAreaEl = sectionEl.createEl('textarea');
	textAreaEl.value = options.initialText;
	textAreaEl.placeholder ='Examples:\nproject_a/**\n**/README.md\nfolder/subfolder/';
	textAreaEl.rows = 6;
	textAreaEl.addClass('read-only-view-full-width');
	textAreaEl.setAttr('aria-label', options.title);
	textAreaEl.setAttr('aria-describedby', `${descriptionId} ${saveStatusId} ${diagnosticsId}`);
	const saveStatusEl = sectionEl.createEl('p', {
		cls: 'setting-item-description',
		text: 'Saved.',
	});
	saveStatusEl.setAttr('id', saveStatusId);
	saveStatusEl.setAttr('role', 'status');
	saveStatusEl.setAttr('aria-live', 'polite');
	saveStatusEl.setAttr('aria-atomic', 'true');

	const setSaveState = (state: RuleSaveState) => {
		if (state === 'saving') {
			saveStatusEl.setText('Saving...');
			return;
		}
		if (state === 'error') {
			saveStatusEl.setText('Save failed.');
			return;
		}
		saveStatusEl.setText('Saved.');
	};

	const saver = new DebouncedRuleChangeSaver(
		RULES_SAVE_DEBOUNCE_MS,
		options.onChange,
		setSaveState,
	);

	const diagnosticsEl = sectionEl.createDiv({ cls: 'read-only-view-rule-diagnostics' });
	new Setting(diagnosticsEl).setName('Rule diagnostics').setHeading();
	diagnosticsEl.setAttr('id', diagnosticsId);
	diagnosticsEl.setAttr('aria-live', 'polite');

	const renderDiagnostics = () => {
		const entries = buildRuleDiagnosticsWithIgnoredLines(
			currentText,
			options.useGlobPatterns,
			ignoredLineIndexes,
		);
		renderDiagnosticsList(diagnosticsEl, entries);
	};
	const diagnosticsRenderScheduler = new DebouncedRenderScheduler(
		DIAGNOSTICS_RENDER_DEBOUNCE_MS,
		renderDiagnostics,
	);

	renderDiagnostics();

	textAreaEl.addEventListener('input', () => {
		currentText = textAreaEl.value;
		options.onTextInput?.(currentText);
		saver.schedule(currentText);
		diagnosticsRenderScheduler.schedule();
	});
	textAreaEl.addEventListener('change', () => {
		currentText = textAreaEl.value;
		options.onTextInput?.(currentText);
		void saver.flush(currentText);
		diagnosticsRenderScheduler.flush();
	});
	textAreaEl.addEventListener('blur', () => {
		currentText = textAreaEl.value;
		options.onTextInput?.(currentText);
		void saver.flush(currentText);
		diagnosticsRenderScheduler.flush();
	});

	return {
		setIgnoredLineIndexes: (lineIndexes: number[]) => {
			ignoredLineIndexes = new Set<number>(lineIndexes);
			diagnosticsRenderScheduler.schedule();
		},
		dispose: () => {
			diagnosticsRenderScheduler.dispose();
			saver.dispose();
		},
	};
}
