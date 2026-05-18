import { Setting } from 'obsidian';
import {
	buildRuleDiagnosticsWithIgnoredLines,
	type RuleDiagnosticsEntry,
} from './rule-diagnostics';

type RuleSaveState = 'saving' | 'saved' | 'error';

const RULES_SAVE_DEBOUNCE_MS = 400;

export type RuleEditorController = {
	setIgnoredLineIndexes: (lineIndexes: number[]) => void;
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

export class DebouncedRuleChangeSaver {
	private timer: ReturnType<Window['setTimeout']> | null = null;
	private lastValue = '';
	private running = false;
	private pendingRun = false;

	constructor(
		private readonly delayMs: number,
		private readonly commit: (value: string) => Promise<void>,
		private readonly onStateChange: (state: RuleSaveState) => void,
	) {}

	schedule(value: string): void {
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

	private async runCommit(): Promise<void> {
		if (this.running) {
			this.pendingRun = true;
			return;
		}

		this.running = true;
		try {
			await this.commit(this.lastValue);
			this.onStateChange('saved');
		} catch {
			this.onStateChange('error');
		} finally {
			this.running = false;
			if (this.pendingRun) {
				this.pendingRun = false;
				await this.runCommit();
			}
		}
	}
}

function renderDiagnosticsList(
	diagnosticsEl: HTMLElement,
	entries: RuleDiagnosticsEntry[],
): void {
	diagnosticsEl.querySelectorAll('ul').forEach((el) => el.remove());
	const listEl = diagnosticsEl.createEl('ul', { cls: 'read-only-view-diagnostics-list' });
	for (const entry of entries) {
		const bullet = entry.isOk ? '✅' : '⚠️';
		const summary = `${bullet} [${entry.lineNumber}] ${entry.normalized || '(empty line)'}`;
		const itemEl = listEl.createEl('li', {
			cls: [
				entry.isOk ? 'read-only-view-diagnostics-item-ok' : 'read-only-view-diagnostics-item-warning',
				entry.ignoredByRuleLimit ? 'read-only-view-diagnostics-item-ignored' : '',
			].filter(Boolean).join(' '),
		});
		const summaryEl = itemEl.createDiv({
			text: summary,
			cls: 'read-only-view-diagnostics-summary',
		});
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
	new Setting(sectionEl).setName(options.title).setHeading();
	sectionEl.createEl('p', {
		text: options.description,
		cls: 'setting-item-description',
	});

	const textAreaEl = sectionEl.createEl('textarea');
	textAreaEl.value = options.initialText;
	textAreaEl.placeholder ='Examples:\nproject_a/**\n**/README.md\nfolder/subfolder/';
	textAreaEl.rows = 6;
	textAreaEl.addClass('read-only-view-full-width');
	const saveStatusEl = sectionEl.createEl('p', {
		cls: 'setting-item-description',
		text: 'Saved.',
	});

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
	diagnosticsEl.setAttr('aria-live', 'polite');

	const renderDiagnostics = () => {
		const entries = buildRuleDiagnosticsWithIgnoredLines(
			currentText,
			options.useGlobPatterns,
			ignoredLineIndexes,
		);
		renderDiagnosticsList(diagnosticsEl, entries);
	};

	renderDiagnostics();

	textAreaEl.addEventListener('input', () => {
		currentText = textAreaEl.value;
		options.onTextInput?.(currentText);
		saver.schedule(currentText);
		renderDiagnostics();
	});
	textAreaEl.addEventListener('change', () => {
		currentText = textAreaEl.value;
		options.onTextInput?.(currentText);
		void saver.flush(currentText);
		renderDiagnostics();
	});
	textAreaEl.addEventListener('blur', () => {
		currentText = textAreaEl.value;
		options.onTextInput?.(currentText);
		void saver.flush(currentText);
		renderDiagnostics();
	});

	return {
		setIgnoredLineIndexes: (lineIndexes: number[]) => {
			ignoredLineIndexes = new Set<number>(lineIndexes);
			renderDiagnostics();
		},
	};
}
