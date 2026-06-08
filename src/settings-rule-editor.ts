import { DebouncedRenderScheduler } from './debounced-render';
import {
	buildRuleDiagnosticsWithIgnoredLines,
	type RuleDiagnosticsEntry,
	splitRulesFromText,
} from './rule-diagnostics';
import { computeRuleLimitsUiState } from './settings-ui-state';
import {
	clearOwnedTimeout,
	scheduleOwnedTimeout,
	type OwnedTimeout,
	type TimerWindow,
} from './window-ownership';

type RuleSaveState = 'saving' | 'saved' | 'error';
type RuleType = 'include' | 'exclude';

const RULES_SAVE_DEBOUNCE_MS = 400;
const DIAGNOSTICS_RENDER_DEBOUNCE_MS = 75;
const RULE_EXAMPLES_URL = 'https://github.com/mrKazzila/Read-Only-View#rule-examples';

type RuleRowState = {
	id: number;
	type: RuleType;
	value: string;
};

type RuleRowController = {
	type: RuleType;
	indexWithinType: number;
	messageEl: HTMLElement;
};

export type RuleEditorController = {
	dispose: () => void;
};

type RuleEditorUiState = {
	includeRules: string[];
	excludeRules: string[];
	includeText: string;
	excludeText: string;
};

type RuleEditorRenderState = {
	includeCount: number;
	excludeCount: number;
};

type RenderRuleEditorOptions = {
	containerEl: HTMLElement;
	includeRules: string[];
	excludeRules: string[];
	useGlobPatterns: boolean;
	onChange: (state: RuleEditorUiState, reason: string) => Promise<void>;
	onStateChange?: (state: RuleEditorRenderState) => void;
};

function buildElementId(suffix: string): string {
	return `read-only-view-path-rules-${suffix}`;
}

function buildRulesText(rows: RuleRowState[], type: RuleType): string {
	return rows
		.filter((row) => row.type === type)
		.map((row) => row.value)
		.join('\n');
}

function buildRuleCountsSummary(includeCount: number, excludeCount: number): string {
	return `${includeCount} include · ${excludeCount} exclude`;
}

function buildRulesPayload(rows: RuleRowState[]): RuleEditorUiState {
	const includeText = buildRulesText(rows, 'include');
	const excludeText = buildRulesText(rows, 'exclude');
	return {
		includeRules: splitRulesFromText(includeText),
		excludeRules: splitRulesFromText(excludeText),
		includeText,
		excludeText,
	};
}

function getRulesChangeReason(previous: RuleEditorUiState, next: RuleEditorUiState): string {
	const includeChanged = previous.includeText !== next.includeText;
	const excludeChanged = previous.excludeText !== next.excludeText;
	if (includeChanged && !excludeChanged) {
		return 'settings-include-rules';
	}
	if (!includeChanged && excludeChanged) {
		return 'settings-exclude-rules';
	}
	return 'settings-path-rules';
}

function getInlineMessages(entry: RuleDiagnosticsEntry | undefined): string[] {
	if (!entry) {
		return [];
	}
	return entry.warnings;
}

export class DebouncedRuleChangeSaver {
	private timer: OwnedTimeout | null = null;
	private lastValue: RuleEditorUiState = {
		includeRules: [],
		excludeRules: [],
		includeText: '',
		excludeText: '',
	};
	private running = false;
	private pendingRun = false;
	private disposed = false;
	private lastCommittedValue: RuleEditorUiState = {
		includeRules: [],
		excludeRules: [],
		includeText: '',
		excludeText: '',
	};

	constructor(
		private readonly delayMs: number,
		initialValue: RuleEditorUiState,
		private readonly commit: (value: RuleEditorUiState, reason: string) => Promise<void>,
		private readonly onStateChange: (state: RuleSaveState) => void,
		private readonly ownerWindow?: TimerWindow | null,
	) {
		this.lastValue = initialValue;
		this.lastCommittedValue = initialValue;
	}

	schedule(value: RuleEditorUiState): void {
		if (this.disposed) {
			return;
		}
		this.lastValue = value;
		this.onStateChange('saving');
		clearOwnedTimeout(this.timer);
		this.timer = scheduleOwnedTimeout(() => {
			this.timer = null;
			void this.runCommit();
		}, this.delayMs, this.ownerWindow);
	}

	async flush(value?: RuleEditorUiState): Promise<void> {
		if (this.disposed) {
			return;
		}
		if (value !== undefined) {
			this.lastValue = value;
		}
		clearOwnedTimeout(this.timer);
		this.timer = null;
		this.onStateChange('saving');
		await this.runCommit();
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.pendingRun = false;
		clearOwnedTimeout(this.timer);
		this.timer = null;
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
			const reason = getRulesChangeReason(this.lastCommittedValue, this.lastValue);
			await this.commit(this.lastValue, reason);
			this.lastCommittedValue = this.lastValue;
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

function renderHelpLink(containerEl: HTMLElement): void {
	const helpEl = containerEl.createDiv({ cls: 'read-only-view-rules-help' });
	const iconEl = helpEl.createEl('a', { text: '?' });
	iconEl.addClass('read-only-view-help-icon');
	iconEl.setAttr('href', RULE_EXAMPLES_URL);
	iconEl.setAttr('target', '_blank');
	iconEl.setAttr('rel', 'noopener noreferrer');
	iconEl.setAttr('aria-label', 'Path rule syntax help');
	iconEl.setAttr('data-tooltip-position', 'top');
	iconEl.setAttr('title', 'Syntax examples');

	const copyEl = helpEl.createDiv({ cls: 'read-only-view-rules-help-copy' });
	copyEl.createDiv({
		text: 'Examples: Notes/Summaries/ · Notes/Summaries/file.md · Archive/**/*.md · !Drafts/',
		cls: 'setting-item-description',
	});
	const linkEl = copyEl.createEl('a', { text: 'Rule examples in readme' });
	linkEl.setAttr('href', RULE_EXAMPLES_URL);
	linkEl.setAttr('target', '_blank');
	linkEl.setAttr('rel', 'noopener noreferrer');
}

export function getPathRulesSummary(includeRules: string[], excludeRules: string[]): string {
	return buildRuleCountsSummary(includeRules.length, excludeRules.length);
}

export function renderRuleEditor(options: RenderRuleEditorOptions): RuleEditorController {
	const { containerEl } = options;
	const ownerWindow = containerEl.ownerDocument?.defaultView;
	let nextRowId = 1;
	let rows: RuleRowState[] = [
		...options.includeRules.map((value) => ({ id: nextRowId++, type: 'include' as const, value })),
		...options.excludeRules.map((value) => ({ id: nextRowId++, type: 'exclude' as const, value })),
	];
	if (rows.length === 0) {
		rows = [{ id: nextRowId++, type: 'include', value: '' }];
	}

	const sectionEl = containerEl.createDiv({ cls: 'read-only-view-rule-section' });
	const descriptionId = buildElementId('description');
	const saveStatusId = buildElementId('save-status');
	const diagnosticsId = buildElementId('diagnostics');
	const rulesHelpRowEl = sectionEl.createDiv({ cls: 'read-only-view-rules-header-row' });
	const titleWrapEl = rulesHelpRowEl.createDiv({ cls: 'read-only-view-rules-header-copy' });
	const descriptionEl = titleWrapEl.createEl('p', {
		text: 'Exclude rules always win. Enabled is visual-only in this version.',
		cls: 'setting-item-description',
	});
	descriptionEl.setAttr('id', descriptionId);
	renderHelpLink(rulesHelpRowEl);

	const summaryEl = sectionEl.createDiv({ cls: 'read-only-view-rules-summary' });
	const warningEl = sectionEl.createDiv({ cls: 'read-only-view-rule-warning-banner' });
	const hardCapWarningEl = sectionEl.createDiv({ cls: 'read-only-view-rule-warning-banner' });

	const tableWrapEl = sectionEl.createDiv({ cls: 'read-only-view-rules-table-wrap' });
	const tableEl = tableWrapEl.createEl('table', { cls: 'read-only-view-rules-table' });
	const colgroupEl = tableEl.createEl('colgroup');
	colgroupEl.createEl('col', { cls: 'read-only-view-rules-col-enabled' });
	colgroupEl.createEl('col', { cls: 'read-only-view-rules-col-type' });
	colgroupEl.createEl('col', { cls: 'read-only-view-rules-col-value' });
	colgroupEl.createEl('col', { cls: 'read-only-view-rules-col-delete' });
	const theadEl = tableEl.createEl('thead');
	const headRowEl = theadEl.createEl('tr');
	for (const column of ['Enabled', 'Type', 'Value', 'Delete']) {
		headRowEl.createEl('th', { text: column });
	}
	const tbodyEl = tableEl.createEl('tbody');

	const addRuleButton = sectionEl.createEl('button', {
		text: 'Add rule',
		cls: 'mod-cta read-only-view-add-rule-button',
		type: 'button',
	});

	const saveStatusEl = sectionEl.createEl('p', {
		cls: 'setting-item-description',
		text: 'Saved.',
	});
	saveStatusEl.setAttr('id', saveStatusId);
	saveStatusEl.setAttr('role', 'status');
	saveStatusEl.setAttr('aria-live', 'polite');
	saveStatusEl.setAttr('aria-atomic', 'true');

	const diagnosticsEl = sectionEl.createDiv({ cls: 'read-only-view-rule-diagnostics' });
	diagnosticsEl.setAttr('id', diagnosticsId);
	diagnosticsEl.setAttr('aria-live', 'polite');

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

	const getCurrentPayload = (): RuleEditorUiState => buildRulesPayload(rows);
	let rowControllers = new Map<number, RuleRowController>();

	const saver = new DebouncedRuleChangeSaver(
		RULES_SAVE_DEBOUNCE_MS,
		getCurrentPayload(),
		options.onChange,
		setSaveState,
		ownerWindow,
	);

	const renderSummaryState = () => {
		const payload = getCurrentPayload();
		const uiState = computeRuleLimitsUiState(payload.includeText, payload.excludeText);
		summaryEl.setText(uiState.summaryText);
		warningEl.empty();
		if (uiState.volumeWarningMessage) {
			warningEl.setText(uiState.volumeWarningMessage);
			warningEl.addClass('is-visible');
		} else {
			warningEl.removeClass('is-visible');
		}

		hardCapWarningEl.empty();
		if (uiState.hardCapWarningMessage) {
			hardCapWarningEl.setText(uiState.hardCapWarningMessage);
			hardCapWarningEl.addClass('is-visible');
		} else {
			hardCapWarningEl.removeClass('is-visible');
		}

		options.onStateChange?.({
			includeCount: payload.includeRules.length,
			excludeCount: payload.excludeRules.length,
		});

		return uiState;
	};

	const renderDiagnostics = () => {
		const payload = getCurrentPayload();
		const uiState = renderSummaryState();
		const includeEntries = buildRuleDiagnosticsWithIgnoredLines(
			payload.includeText,
			options.useGlobPatterns,
			new Set<number>(uiState.ignoredIncludeLineIndexes),
		);
		const excludeEntries = buildRuleDiagnosticsWithIgnoredLines(
			payload.excludeText,
			options.useGlobPatterns,
			new Set<number>(uiState.ignoredExcludeLineIndexes),
		);

		for (const controller of rowControllers.values()) {
			controller.messageEl.empty();
			const entry = controller.type === 'include'
				? includeEntries[controller.indexWithinType]
				: excludeEntries[controller.indexWithinType];
			for (const warning of getInlineMessages(entry)) {
				controller.messageEl.createDiv({
					text: warning,
					cls: `read-only-view-rule-inline-message ${entry?.ignoredByRuleLimit ? 'is-ignored' : ''}`,
				});
			}
		}

		diagnosticsEl.empty();
		const listEl = diagnosticsEl.createEl('ul', { cls: 'read-only-view-diagnostics-list' });
		for (const [type, entries] of [
			['Include', includeEntries],
			['Exclude', excludeEntries],
		] as const) {
			for (const entry of entries) {
				if (entry.warnings.length === 0) {
					continue;
				}
				const itemEl = listEl.createEl('li', {
					cls: entry.ignoredByRuleLimit
						? 'read-only-view-diagnostics-item-warning read-only-view-diagnostics-item-ignored'
						: 'read-only-view-diagnostics-item-warning',
				});
				itemEl.createDiv({
					text: `${type} [${entry.lineNumber}] ${entry.normalized || '(empty line)'}`,
					cls: 'read-only-view-diagnostics-summary',
				});
				const warningsListEl = itemEl.createEl('ul', { cls: 'read-only-view-diagnostics-warnings' });
				for (const warning of entry.warnings) {
					warningsListEl.createEl('li', {
						text: warning,
						cls: 'read-only-view-diagnostics-warning',
					});
				}
			}
		}
		if (!diagnosticsEl.querySelector('li')) {
			const okEl = diagnosticsEl.createDiv({ cls: 'read-only-view-diagnostics-summary' });
			okEl.setText('All rules look valid.');
		}
	};

	const diagnosticsRenderScheduler = new DebouncedRenderScheduler(
		DIAGNOSTICS_RENDER_DEBOUNCE_MS,
		renderDiagnostics,
		ownerWindow,
	);

	const syncRows = (flush = false) => {
		const payload = getCurrentPayload();
		saver.schedule(payload);
		if (flush) {
			void saver.flush(payload);
		}
		diagnosticsRenderScheduler.schedule();
	};

	const renderRows = () => {
		tbodyEl.empty();
		rowControllers = new Map<number, RuleRowController>();
		let includeIndex = 0;
		let excludeIndex = 0;

		for (const row of rows) {
			const rowEl = tbodyEl.createEl('tr', { cls: 'read-only-view-rule-row' });

			const enabledCellEl = rowEl.createEl('td');
			enabledCellEl.setAttr('data-label', 'Enabled');
			const enabledSlotEl = enabledCellEl.createDiv({ cls: 'read-only-view-rule-cell-slot' });
			const enabledEl = enabledSlotEl.createEl('input', { type: 'checkbox' });
			enabledEl.setAttr('checked', 'checked');
			enabledEl.setAttr('disabled', 'disabled');
			enabledEl.setAttr('aria-label', 'Rule enabled');
			enabledEl.setAttr('title', 'Always enabled in this version');

			const typeCellEl = rowEl.createEl('td');
			typeCellEl.setAttr('data-label', 'Type');
			const typeSlotEl = typeCellEl.createDiv({ cls: 'read-only-view-rule-cell-slot' });
			const typeSelectEl = typeSlotEl.createEl('select');
			typeSelectEl.setAttr('aria-label', 'Rule type');
			const includeOptionEl = typeSelectEl.createEl('option', { text: 'Include' });
			includeOptionEl.value = 'include';
			if (row.type === 'include') {
				includeOptionEl.setAttr('selected', 'selected');
				typeSelectEl.value = 'include';
			}
			const excludeOptionEl = typeSelectEl.createEl('option', { text: 'Exclude' });
			excludeOptionEl.value = 'exclude';
			if (row.type === 'exclude') {
				excludeOptionEl.setAttr('selected', 'selected');
				typeSelectEl.value = 'exclude';
			}

			const valueCellEl = rowEl.createEl('td');
			valueCellEl.setAttr('data-label', 'Value');
			const valueStackEl = valueCellEl.createDiv({ cls: 'read-only-view-rule-value-stack' });
			const inputEl = valueStackEl.createEl('input', { type: 'text' });
			inputEl.value = row.value;
			inputEl.placeholder = row.type === 'include' ? 'projects/' : 'projects/drafts/';
			inputEl.addClass('read-only-view-rule-input');
			inputEl.setAttr('aria-label', `${row.type === 'include' ? 'Include' : 'Exclude'} rule value`);
			inputEl.setAttr('aria-describedby', `${descriptionId} ${saveStatusId} ${diagnosticsId}`);
			const messageEl = valueStackEl.createDiv({ cls: 'read-only-view-rule-inline-messages' });

			const deleteCellEl = rowEl.createEl('td');
			deleteCellEl.setAttr('data-label', 'Delete');
			const deleteSlotEl = deleteCellEl.createDiv({ cls: 'read-only-view-rule-cell-slot' });
			const deleteButtonEl = deleteSlotEl.createEl('button', {
				text: 'Delete',
				cls: 'clickable-icon read-only-view-delete-rule-button',
				type: 'button',
			});
			deleteButtonEl.setAttr('aria-label', `Delete ${row.type} rule`);
			deleteButtonEl.setAttr('title', 'Delete rule');

			const indexWithinType = row.type === 'include' ? includeIndex++ : excludeIndex++;
			rowControllers.set(row.id, {
				type: row.type,
				indexWithinType,
				messageEl,
			});

			typeSelectEl.addEventListener('change', () => {
				row.type = typeSelectEl.value === 'exclude' ? 'exclude' : 'include';
				renderRows();
				syncRows(true);
			});

			inputEl.addEventListener('input', () => {
				row.value = inputEl.value;
				syncRows();
			});
			inputEl.addEventListener('change', () => {
				row.value = inputEl.value;
				syncRows(true);
			});
			inputEl.addEventListener('blur', () => {
				row.value = inputEl.value;
				syncRows(true);
			});

			deleteButtonEl.addEventListener('click', () => {
				rows = rows.filter((candidate) => candidate.id !== row.id);
				if (rows.length === 0) {
					rows = [{ id: nextRowId++, type: 'include', value: '' }];
				}
				renderRows();
				syncRows(true);
			});
		}
		diagnosticsRenderScheduler.flush();
	};

	addRuleButton.addEventListener('click', () => {
		rows.push({ id: nextRowId++, type: 'include', value: '' });
		renderRows();
		syncRows(true);
	});

	renderRows();

	return {
		dispose: () => {
			diagnosticsRenderScheduler.dispose();
			saver.dispose();
		},
	};
}
