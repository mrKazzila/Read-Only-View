import { buildRuntimeRules, isRuntimeRuleEntry, loadRuleEntries } from './rule-state';
import { DebouncedRenderScheduler } from './debounced-render';
import {
	buildRuleDiagnosticsWithIgnoredLines,
	type RuleDiagnosticsEntry,
} from './rule-diagnostics';
import { computeRuleLimitsUiState } from './settings-ui-state';
import {
	resolveRuleSource,
	resolutionToRuleEntry,
	type RuleResolution,
	type RuleResolverContext,
} from './rule-source';
import type { ForceReadModeSettings, IncludeRuleUpdate, RuleEntry } from './plugin-types';
import {
	buildSourceInputLimitMessage,
	formatSourceValueForDisplay,
	limitSourceInput,
} from './source-input-limits';
import {
	clearOwnedTimeout,
	scheduleOwnedTimeout,
	type OwnedTimeout,
	type TimerWindow,
} from './window-ownership';
import {
	captureSettingsFocus,
	restoreSettingsFocus,
	setSettingsFocusKey,
} from './settings-focus';

export type RuleSaveState = 'saving' | 'saved' | 'error';
type RuleType = 'include' | 'exclude';

const RULES_SAVE_DEBOUNCE_MS = 400;
const DIAGNOSTICS_RENDER_DEBOUNCE_MS = 75;
const RULE_EXAMPLES_URL = 'https://github.com/mrKazzila/Read-Only-View#rule-examples';

type RuleRowState = {
	id: number;
	type: RuleType;
	value: string;
	acceptedValue: string;
	enabled: boolean;
	storedEntry?: RuleEntry;
	inputLimitExceeded: boolean;
	inputLimit: number;
};

type RuleRowController = {
	row: RuleRowState;
	type: RuleType;
	enabled: boolean;
	inactiveByMode: boolean;
	messageEl: HTMLElement;
};

function createRuleRow(entry: RuleEntry, type: RuleType, id: number): RuleRowState {
	const limited = limitSourceInput(entry.sourceValue);
	return {
		id,
		type,
		value: limited.value,
		acceptedValue: limited.exceeded ? '' : limited.value,
		enabled: entry.enabled,
		storedEntry: limited.exceeded ? undefined : entry,
		inputLimitExceeded: limited.exceeded,
		inputLimit: limited.limit,
	};
}

export type RuleEditorController = {
	setInheritedSaveState: (state: RuleSaveState) => void;
	applyExternalUpdate: (settings: ForceReadModeSettings, update: IncludeRuleUpdate) => Promise<{ changed: boolean; error?: string }>;
	dispose: () => void;
};

export type RuleEditorUiState = {
	includeRules: string[];
	excludeRules: string[];
	includeRuleEnabled: boolean[];
	excludeRuleEnabled: boolean[];
	includeRuleEntries?: RuleEntry[];
	excludeRuleEntries?: RuleEntry[];
	includeText: string;
	excludeText: string;
	activeIncludeText: string;
	activeExcludeText: string;
};

type RuleEditorRenderState = {
	includeCount: number;
	excludeCount: number;
};

type RenderRuleEditorOptions = {
	containerEl: HTMLElement;
	includeRules: string[];
	excludeRules: string[];
	includeRuleEnabled?: boolean[];
	excludeRuleEnabled?: boolean[];
	includeRuleEntries?: RuleEntry[];
	excludeRuleEntries?: RuleEntry[];
	resolverContext?: RuleResolverContext;
	useGlobPatterns: boolean;
	includeRulesActive?: boolean;
	onChange: (state: RuleEditorUiState, reason: string) => Promise<void>;
	onStateChange?: (state: RuleEditorRenderState) => void;
};

function buildElementId(suffix: string): string {
	return `read-only-view-path-rules-${suffix}`;
}

const FALLBACK_RESOLVER_CONTEXT: RuleResolverContext = {
	vaultName: '',
	vaultBasePath: null,
	isMarkdownFile: () => false,
	isFolder: () => false,
};

function resolveRow(row: RuleRowState, context: RuleResolverContext): RuleResolution {
	const value = row.inputLimitExceeded ? row.acceptedValue : row.value;
	const storedEntry = row.storedEntry;
	const shouldReuseStoredResolution = storedEntry?.resolvedPath
		&& value === storedEntry.sourceValue
		&& (storedEntry.sourceKind !== 'vault-path' || storedEntry.resolvedPath !== storedEntry.sourceValue);
	if (shouldReuseStoredResolution && storedEntry) {
		return {
			sourceKind: storedEntry.sourceKind,
			sourceValue: storedEntry.sourceValue,
			resolvedPath: storedEntry.resolvedPath,
			error: null,
		};
	}
	return resolveRuleSource(value, context);
}

function buildRuleCountsSummary(includeCount: number, excludeCount: number): string {
	return `${includeCount} include · ${excludeCount} exclude`;
}

function buildRulesPayload(
	includeRuleEntries: RuleEntry[],
	excludeRuleEntries: RuleEntry[],
	includeRulesActive: boolean,
): RuleEditorUiState {
	const runtimeInclude = buildRuntimeRules(includeRuleEntries);
	const runtimeExclude = buildRuntimeRules(excludeRuleEntries);
	const includeRules = runtimeInclude.rules;
	const excludeRules = runtimeExclude.rules;
	const includeText = includeRules.join('\n');
	const excludeText = excludeRules.join('\n');
	return {
		includeRules,
		excludeRules,
		includeRuleEnabled: runtimeInclude.enabled,
		excludeRuleEnabled: runtimeExclude.enabled,
		includeRuleEntries,
		excludeRuleEntries,
		includeText,
		excludeText,
		activeIncludeText: includeRulesActive
			? runtimeInclude.activeRules.join('\n')
			: '',
		activeExcludeText: runtimeExclude.activeRules.join('\n'),
	};
}

/** Resolve once per editor revision, preserving the active runtime order for diagnostics. */
function buildEditorSnapshot(
	rows: RuleRowState[],
	includeRulesActive: boolean,
	context: RuleResolverContext,
	useGlobPatterns: boolean,
) {
	const entries: Record<RuleType, RuleEntry[]> = { include: [], exclude: [] };
	const activeIndexes = { include: 0, exclude: 0 };
	const resolvedRows = new Map<number, { resolution: RuleResolution; indexWithinType: number }>();
	for (const row of rows) {
		const resolution = resolveRow(row, context);
		const entry = resolutionToRuleEntry(resolution, row.enabled);
		const hasValue = row.acceptedValue.trim().length > 0;
		if (hasValue) entries[row.type].push(entry);
		const indexWithinType = hasValue && row.enabled && isRuntimeRuleEntry(entry)
			? activeIndexes[row.type]++
			: -1;
		resolvedRows.set(row.id, { resolution, indexWithinType });
	}
	const payload = buildRulesPayload(entries.include, entries.exclude, includeRulesActive);
	const uiState = computeRuleLimitsUiState(payload.activeIncludeText, payload.activeExcludeText);
	const diagnostics = (text: string, ignored: number[]) => text.length > 0
		? buildRuleDiagnosticsWithIgnoredLines(text, useGlobPatterns, new Set(ignored))
		: [];
	return {
		payload,
		resolvedRows,
		uiState,
		includeEntries: diagnostics(payload.activeIncludeText, uiState.ignoredIncludeLineIndexes),
		excludeEntries: diagnostics(payload.activeExcludeText, uiState.ignoredExcludeLineIndexes),
	};
}

function getRulesChangeReason(previous: RuleEditorUiState, next: RuleEditorUiState): string {
	const includeChanged = previous.includeText !== next.includeText;
	const excludeChanged = previous.excludeText !== next.excludeText;
	const enabledChanged = previous.includeRuleEnabled.join() !== next.includeRuleEnabled.join()
		|| previous.excludeRuleEnabled.join() !== next.excludeRuleEnabled.join();
	if (includeChanged && !excludeChanged) {
		return 'settings-include-rules';
	}
	if (!includeChanged && excludeChanged) {
		return 'settings-exclude-rules';
	}
	if (includeChanged && excludeChanged) {
		return 'settings-path-rules';
	}
	if (enabledChanged) {
		return 'settings-rule-enabled';
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
		includeRuleEnabled: [],
		excludeRuleEnabled: [],
		includeRuleEntries: [],
		excludeRuleEntries: [],
		includeText: '',
		excludeText: '',
		activeIncludeText: '',
		activeExcludeText: '',
	};
	private running = false;
	private completion: Promise<void> = Promise.resolve();
	private saveFailed = false;
	private externalFlushes = 0;
	private pendingRun = false;
	private disposed = false;
	private lastCommittedValue: RuleEditorUiState = {
		includeRules: [],
		excludeRules: [],
		includeRuleEnabled: [],
		excludeRuleEnabled: [],
		includeRuleEntries: [],
		excludeRuleEntries: [],
		includeText: '',
		excludeText: '',
		activeIncludeText: '',
		activeExcludeText: '',
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
		if (this.externalFlushes === 0) this.pendingRun = false;
		clearOwnedTimeout(this.timer);
		this.timer = null;
	}

	async flushExternal(value: RuleEditorUiState): Promise<void> {
		this.externalFlushes++;
		try {
			await this.flush(value);
			if (this.saveFailed) throw new Error('Could not save path rules.');
		} finally {
			this.externalFlushes--;
		}
	}

	private runCommit(): Promise<void> {
		if (this.disposed) return Promise.resolve();
		if (this.running) {
			this.pendingRun = true;
			return this.completion;
		}
		this.running = true;
		this.completion = this.drainCommits();
		return this.completion;
	}

	private async drainCommits(): Promise<void> {
		try {
			do {
				this.pendingRun = false;
				const value = this.lastValue;
				try {
					await this.commit(value, getRulesChangeReason(this.lastCommittedValue, value));
					this.lastCommittedValue = value;
					this.saveFailed = false;
					if (!this.disposed) this.onStateChange('saved');
				} catch {
					this.saveFailed = true;
					if (!this.disposed) this.onStateChange('error');
				}
			} while ((!this.disposed || this.externalFlushes > 0) && this.pendingRun);
		} finally {
			this.running = false;
		}
	}

}

function renderHelpLink(containerEl: HTMLElement): void {
	const helpEl = containerEl.createEl('a', { cls: 'read-only-view-rules-help' });
	helpEl.setAttr('href', RULE_EXAMPLES_URL);
	helpEl.setAttr('target', '_blank');
	helpEl.setAttr('rel', 'noopener noreferrer');
	helpEl.setAttr('aria-label', 'Open path rule syntax examples');
	helpEl.setAttr('data-tooltip-position', 'top');
	helpEl.setAttr('title', 'Open syntax examples');
	const iconEl = helpEl.createSpan({ text: '?' });
	iconEl.addClass('read-only-view-help-icon');
	iconEl.setAttr('aria-hidden', 'true');

	const copyEl = helpEl.createDiv({ cls: 'read-only-view-rules-help-copy' });
	copyEl.createDiv({
		text: 'Examples: Notes/Summaries/ · Notes/Summaries/file.md · Archive/**/*.md · !Drafts/',
		cls: 'setting-item-description',
	});
	copyEl.createSpan({
		text: 'Rule examples in readme',
		cls: 'read-only-view-rules-help-label',
	});

	helpEl.addEventListener('keydown', (event) => {
		if (event.key !== ' ') {
			return;
		}
		event.preventDefault();
		helpEl.click();
	});
}

export function getPathRulesSummary(
	includeRules: string[],
	excludeRules: string[],
	includeRuleEnabled: boolean[],
	excludeRuleEnabled: boolean[],
	includeRulesActive = true,
): string {
	const includeCount = includeRulesActive
		? includeRules.filter((_, index) => includeRuleEnabled[index] !== false).length
		: 0;
	const excludeCount = excludeRules.filter((_, index) => excludeRuleEnabled[index] !== false).length;
	return buildRuleCountsSummary(includeCount, excludeCount);
}

export function renderRuleEditor(options: RenderRuleEditorOptions): RuleEditorController {
	const { containerEl } = options;
	const includeRulesActive = options.includeRulesActive ?? true;
	const ownerWindow = containerEl.ownerDocument?.defaultView;
	let nextRowId = 1;
	const resolverContext = options.resolverContext ?? FALLBACK_RESOLVER_CONTEXT;
	const initialIncludeEntries = loadRuleEntries(options.includeRuleEntries, options.includeRules, options.includeRuleEnabled);
	const initialExcludeEntries = loadRuleEntries(options.excludeRuleEntries, options.excludeRules, options.excludeRuleEnabled);
	let rows: RuleRowState[] = [
		...initialIncludeEntries.map((entry) => createRuleRow(entry, 'include', nextRowId++)),
		...initialExcludeEntries.map((entry) => createRuleRow(entry, 'exclude', nextRowId++)),
	];

	const sectionEl = containerEl.createDiv({ cls: 'read-only-view-rule-section' });
	const descriptionId = buildElementId('description');
	const saveStatusId = buildElementId('save-status');
	const diagnosticsId = buildElementId('diagnostics');
	const rulesHelpRowEl = sectionEl.createDiv({ cls: 'read-only-view-rules-header-row' });
	const titleWrapEl = rulesHelpRowEl.createDiv({ cls: 'read-only-view-rules-header-copy' });
	const descriptionEl = titleWrapEl.createEl('p', {
		text: 'Exclude rules always win. Disable a rule to keep it without applying it.',
		cls: 'setting-item-description',
	});
	descriptionEl.setAttr('id', descriptionId);
	if (!includeRulesActive) {
		titleWrapEl.createEl('p', {
			text: 'Include rules are inactive while all Markdown files mode is enabled.',
			cls: 'setting-item-description',
		});
	}
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

	let hasLocalChanges = false;
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

	let snapshot: ReturnType<typeof buildEditorSnapshot> | undefined;
	const getSnapshot = () => snapshot ??= buildEditorSnapshot(rows, includeRulesActive, resolverContext, options.useGlobPatterns);
	const invalidateSnapshot = () => { snapshot = undefined; };
	const getCurrentPayload = (): RuleEditorUiState => getSnapshot().payload;
	let rowControllers = new Map<number, RuleRowController>();

	const saver = new DebouncedRuleChangeSaver(
		RULES_SAVE_DEBOUNCE_MS,
		getCurrentPayload(),
		options.onChange,
		setSaveState,
		ownerWindow,
	);

	const renderSummaryState = ({ payload, uiState }: ReturnType<typeof buildEditorSnapshot>) => {
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
			includeCount: includeRulesActive ? payload.includeRuleEnabled.filter(Boolean).length : 0,
			excludeCount: payload.excludeRuleEnabled.filter(Boolean).length,
		});
	};

	const renderDiagnostics = () => {
		const current = getSnapshot();
		renderSummaryState(current);
		const { includeEntries, excludeEntries, resolvedRows } = current;

		let hasSourceError = false;
		for (const controller of rowControllers.values()) {
			const resolved = resolvedRows.get(controller.row.id);
			if (!resolved) continue;
			const { resolution, indexWithinType } = resolved;
			controller.messageEl.empty();
			if (controller.row.inputLimitExceeded) {
				hasSourceError = true;
				controller.messageEl.createDiv({
					text: buildSourceInputLimitMessage(controller.row.inputLimit),
					cls: 'read-only-view-rule-inline-message is-error',
				});
				continue;
			}
			if (controller.inactiveByMode) {
				controller.messageEl.createDiv({
					text: 'Inactive in all Markdown files mode.',
					cls: 'read-only-view-rule-inline-message',
				});
				continue;
			}
			if (!controller.enabled) {
				continue;
			}
			if (resolution.error) {
				hasSourceError = true;
				controller.messageEl.createDiv({
					text: formatSourceValueForDisplay(resolution.error),
					cls: 'read-only-view-rule-inline-message is-error',
				});
				continue;
			}
			const resolvedVaultTarget = resolution.sourceKind === 'vault-path'
				&& resolution.resolvedPath
				&& resolution.resolvedPath !== resolution.sourceValue;
			if ((resolution.sourceKind !== 'vault-path' || resolvedVaultTarget)
				&& resolution.resolvedPath) {
				const sourceLabel = resolution.sourceKind === 'obsidian-uri'
					? 'Obsidian URL'
					: resolution.sourceKind === 'absolute-path'
						? 'System path'
						: resolution.resolvedPath.endsWith('/')
							? 'Vault folder'
							: 'Vault file';
				controller.messageEl.createDiv({
					text: `${sourceLabel} · Resolved to: ${formatSourceValueForDisplay(resolution.resolvedPath)}`,
					cls: 'read-only-view-rule-inline-message is-resolved',
				});
			}
			const entry = controller.type === 'include'
				? includeEntries[indexWithinType]
				: excludeEntries[indexWithinType];
			for (const warning of getInlineMessages(entry)) {
				controller.messageEl.createDiv({
					text: formatSourceValueForDisplay(warning),
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
					text: `${type} [${entry.lineNumber}] ${formatSourceValueForDisplay(entry.normalized || '(empty line)')}`,
					cls: 'read-only-view-diagnostics-summary',
				});
				const warningsListEl = itemEl.createEl('ul', { cls: 'read-only-view-diagnostics-warnings' });
				for (const warning of entry.warnings) {
					warningsListEl.createEl('li', {
						text: formatSourceValueForDisplay(warning),
						cls: 'read-only-view-diagnostics-warning',
					});
				}
			}
		}
		if (!diagnosticsEl.querySelector('li') && !hasSourceError) {
			const okEl = diagnosticsEl.createDiv({ cls: 'read-only-view-diagnostics-summary' });
			okEl.setText(rows.length === 0 ? 'No path rules configured.' : 'All rules look valid.');
		}
	};

	const diagnosticsRenderScheduler = new DebouncedRenderScheduler(
		DIAGNOSTICS_RENDER_DEBOUNCE_MS,
		renderDiagnostics,
		ownerWindow,
	);

	const syncRows = (flush = false) => {
		hasLocalChanges = true;
		const payload = getCurrentPayload();
		saver.schedule(payload);
		if (flush) {
			void saver.flush(payload);
		}
		diagnosticsRenderScheduler.schedule();
	};

	const renderRows = () => {
		const focusSnapshot = captureSettingsFocus(tbodyEl);
		tbodyEl.empty();
		rowControllers = new Map<number, RuleRowController>();

		for (const row of rows) {
			const inactiveByMode = row.type === 'include' && !includeRulesActive;
			const rowEl = tbodyEl.createEl('tr', {
				cls: `read-only-view-rule-row${row.enabled ? '' : ' is-disabled'}${inactiveByMode ? ' is-inactive-by-mode' : ''}`,
			});

			const enabledCellEl = rowEl.createEl('td');
			enabledCellEl.setAttr('data-label', 'Enabled');
			const enabledSlotEl = enabledCellEl.createEl('label', { cls: 'read-only-view-rule-cell-slot' });
			const enabledEl = enabledSlotEl.createEl('input', { type: 'checkbox' });
			enabledEl.addClass('read-only-view-rule-enabled-toggle');
			enabledEl.checked = row.enabled;
			enabledEl.setAttr('aria-label', 'Rule enabled');
			enabledEl.setAttr('title', row.enabled ? 'Disable rule' : 'Enable rule');
			setSettingsFocusKey(enabledEl, `rule-${row.id}-enabled`);

			const typeCellEl = rowEl.createEl('td');
			typeCellEl.setAttr('data-label', 'Type');
			const typeSlotEl = typeCellEl.createDiv({ cls: 'read-only-view-rule-cell-slot' });
			const typeSelectEl = typeSlotEl.createEl('select');
			typeSelectEl.setAttr('aria-label', 'Rule type');
			setSettingsFocusKey(typeSelectEl, `rule-${row.id}-type`);
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
			inputEl.setAttr('aria-invalid', row.inputLimitExceeded ? 'true' : 'false');
			setSettingsFocusKey(inputEl, `rule-${row.id}-value`);
			if (row.inputLimitExceeded) {
				inputEl.addClass('is-input-error');
			}
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
			setSettingsFocusKey(deleteButtonEl, `rule-${row.id}-delete`);

			const controller: RuleRowController = {
				row,
				type: row.type,
				enabled: row.enabled,
				inactiveByMode,
				messageEl,
			};
			rowControllers.set(row.id, controller);

			enabledEl.addEventListener('change', () => {
				row.enabled = enabledEl.checked;
				invalidateSnapshot();
				renderRows();
				syncRows(true);
			});

			typeSelectEl.addEventListener('change', () => {
				row.type = typeSelectEl.value === 'exclude' ? 'exclude' : 'include';
				invalidateSnapshot();
				const inactiveByMode = row.type === 'include' && !includeRulesActive;
				controller.type = row.type;
				controller.inactiveByMode = inactiveByMode;
				inputEl.placeholder = row.type === 'include' ? 'projects/' : 'projects/drafts/';
				inputEl.setAttr('aria-label', `${row.type === 'include' ? 'Include' : 'Exclude'} rule value`);
				deleteButtonEl.setAttr('aria-label', `Delete ${row.type} rule`);
				if (inactiveByMode) {
					rowEl.addClass('is-inactive-by-mode');
				} else {
					rowEl.removeClass('is-inactive-by-mode');
				}
				syncRows(true);
			});

			const readInput = (): boolean => {
				invalidateSnapshot();
				const limited = limitSourceInput(inputEl.value, row.inputLimitExceeded);
				inputEl.value = limited.value;
				row.value = limited.value;
				row.inputLimit = limited.limit;
				row.inputLimitExceeded = limited.exceeded;
				inputEl.setAttr('aria-invalid', limited.exceeded ? 'true' : 'false');
				if (limited.exceeded) {
					inputEl.addClass('is-input-error');
					diagnosticsRenderScheduler.schedule();
					return false;
				}
				inputEl.removeClass('is-input-error');
				row.acceptedValue = limited.value;
				row.storedEntry = undefined;
				return true;
			};

			inputEl.addEventListener('input', () => {
				if (readInput()) {
					syncRows();
				}
			});
			inputEl.addEventListener('change', () => {
				if (readInput()) {
					syncRows(true);
				}
			});
			inputEl.addEventListener('blur', () => {
				if (readInput()) {
					syncRows(true);
				}
			});

			deleteButtonEl.addEventListener('click', () => {
				rows = rows.filter((candidate) => candidate.id !== row.id);
				invalidateSnapshot();
				renderRows();
				syncRows(true);
			});
		}
		diagnosticsRenderScheduler.flush();
		restoreSettingsFocus(tbodyEl, focusSnapshot);
	};

	addRuleButton.addEventListener('click', () => {
		invalidateSnapshot();
		rows.push({
			id: nextRowId++,
			type: 'include',
			value: '',
			acceptedValue: '',
			enabled: true,
			inputLimitExceeded: false,
			inputLimit: limitSourceInput('').limit,
		});
		renderRows();
		syncRows(true);
	});

	renderRows();

	return {
		setInheritedSaveState: (state) => { if (!hasLocalChanges) setSaveState(state); },
		applyExternalUpdate: async (settings, update) => {
			hasLocalChanges = true;
			const payload = getCurrentPayload();
			const previous = payload.includeRuleEntries ?? [];
			const change = update({ ...settings, ...payload });
			if (change.error) return change;
			if (!change.changed) {
				await saver.flushExternal(payload);
				return change;
			}
			invalidateSnapshot();
			let index = 0;
			rows = rows.map((row) => {
				if (row.type !== 'include' || !row.acceptedValue.trim()) return row;
				const entry = change.entries[index];
				const oldEntry = previous[index++];
				return entry && entry !== oldEntry ? createRuleRow(entry, 'include', row.id) : row;
			});
			for (const entry of change.entries.slice(previous.length)) {
				rows.push(createRuleRow(entry, 'include', nextRowId++));
			}
			renderRows();
			await saver.flushExternal(getCurrentPayload());
			return { changed: true };
		},
		dispose: () => {
			diagnosticsRenderScheduler.dispose();
			saver.dispose();
		},
	};
}
