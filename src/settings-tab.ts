import { App, PluginSettingTab, Setting } from 'obsidian';
import { normalizeVaultPath } from './matcher';
import {
	buildPathTesterResult,
	buildRuleDiagnosticsWithIgnoredLines,
	getRuleVolumeWarningMessage,
	splitRulesFromText,
	stringifyRules,
	type RuleDiagnosticsEntry,
} from './rule-diagnostics';
import { buildEffectiveRules } from './rule-limits';

type RuleSaveState = 'saving' | 'saved' | 'error';
const RULES_SAVE_DEBOUNCE_MS = 400;

export interface SettingsTabPlugin {
	settings: {
		enabled: boolean;
		useGlobPatterns: boolean;
		caseSensitive: boolean;
		debug: boolean;
		debugVerbosePaths: boolean;
		includeRules: string[];
		excludeRules: string[];
	};
	saveSettings: () => Promise<void>;
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
}

export type RuleLimitsUiState = {
	summaryText: string;
	volumeWarningMessage: string | null;
	hardCapWarningMessage: string | null;
	ignoredIncludeLineIndexes: number[];
	ignoredExcludeLineIndexes: number[];
};

export function computeRuleLimitsUiState(includeRulesText: string, excludeRulesText: string): RuleLimitsUiState {
	const effectiveRules = buildEffectiveRules(
		includeRulesText.split('\n'),
		excludeRulesText.split('\n'),
	);
	const ignoredSuffix = effectiveRules.counts.totalIgnored > 0
		? ` (+${effectiveRules.counts.totalIgnored} ignored)`
		: '';
	const summaryText =
		`Include: ${effectiveRules.counts.includeUsed} rules · Exclude: ${effectiveRules.counts.excludeUsed} rules · Total: ${effectiveRules.counts.totalUsed}${ignoredSuffix}`;
	const volumeWarningMessage = getRuleVolumeWarningMessage(effectiveRules.warningLevel);
	const hardCapWarningMessage = effectiveRules.hardCapExceeded
		? 'Too many rules. Extra lines are ignored.'
		: null;

	return {
		summaryText,
		volumeWarningMessage,
		hardCapWarningMessage,
		ignoredIncludeLineIndexes: effectiveRules.ignoredIncludeLineIndexes,
		ignoredExcludeLineIndexes: effectiveRules.ignoredExcludeLineIndexes,
	};
}

export class DebouncedRuleChangeSaver {
	private timer: ReturnType<typeof setTimeout> | null = null;
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
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.runCommit();
		}, this.delayMs);
	}

	async flush(value?: string): Promise<void> {
		if (value !== undefined) {
			this.lastValue = value;
		}
		if (this.timer) {
			clearTimeout(this.timer);
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
		const summaryEl = itemEl.createEl('div', {
			text: summary,
			cls: 'read-only-view-diagnostics-summary',
		});
		if (entry.ignoredByRuleLimit) {
			summaryEl.createEl('span', {
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

export class ForceReadModeSettingTab extends PluginSettingTab {
	plugin: SettingsTabPlugin;

	constructor(app: App, plugin: SettingsTabPlugin) {
		super(app, plugin as never);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Read-only view').setHeading();

		new Setting(containerEl)
			.setName('Enabled')
			.setDesc('Enable or disable read-only enforcement globally.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enabled)
					.onChange(async (value) => {
						this.plugin.settings.enabled = value;
						await this.plugin.saveSettings();
						if (value) {
							await this.plugin.applyAllOpenMarkdownLeaves('settings-enabled');
						}
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Use glob patterns')
			.setDesc('Use glob tokens (*, **, ?) for matching. Disable for literal prefix compatibility mode.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.useGlobPatterns)
					.onChange(async (value) => {
						this.plugin.settings.useGlobPatterns = value;
						await this.plugin.saveSettings();
						await this.plugin.applyAllOpenMarkdownLeaves('settings-use-glob-patterns');
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Case sensitive')
			.setDesc('When disabled, both rules and file paths are compared in lower case.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.caseSensitive)
					.onChange(async (value) => {
						this.plugin.settings.caseSensitive = value;
						await this.plugin.saveSettings();
						await this.plugin.applyAllOpenMarkdownLeaves('settings-case-sensitive');
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc('Write detailed logs to the developer console.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Debug: verbose paths')
			.setDesc('When enabled, debug logs include full file paths. Keep disabled for safer default redaction.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.debugVerbosePaths)
					.onChange(async (value) => {
						this.plugin.settings.debugVerbosePaths = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		const rulesSummaryEl = containerEl.createDiv({ cls: 'read-only-view-rules-summary' });
		const ruleWarningEl = containerEl.createDiv({ cls: 'read-only-view-rule-warning-banner' });
		const hardCapWarningEl = containerEl.createDiv({ cls: 'read-only-view-rule-warning-banner' });

		let includeRulesText = stringifyRules(this.plugin.settings.includeRules);
		let excludeRulesText = stringifyRules(this.plugin.settings.excludeRules);

		const includeEditor = this.renderRulesEditor(
			'Include rules',
			'One rule per line. These files become read-only if not excluded.',
			this.plugin.settings.includeRules,
			async (value) => {
			this.plugin.settings.includeRules = splitRulesFromText(value);
			await this.plugin.saveSettings();
			await this.plugin.applyAllOpenMarkdownLeaves('settings-include-rules');
			},
			(value) => {
				includeRulesText = value;
				renderRuleLimitsState();
			},
		);

		const excludeEditor = this.renderRulesEditor(
			'Exclude rules',
			'One rule per line. Exclude wins when include and exclude both match.',
			this.plugin.settings.excludeRules,
			async (value) => {
			this.plugin.settings.excludeRules = splitRulesFromText(value);
			await this.plugin.saveSettings();
			await this.plugin.applyAllOpenMarkdownLeaves('settings-exclude-rules');
			},
			(value) => {
				excludeRulesText = value;
				renderRuleLimitsState();
			},
		);

		const renderRuleLimitsState = () => {
			const uiState = computeRuleLimitsUiState(includeRulesText, excludeRulesText);
			rulesSummaryEl.setText(uiState.summaryText);
			ruleWarningEl.empty();
			if (uiState.volumeWarningMessage) {
				ruleWarningEl.setText(uiState.volumeWarningMessage);
				ruleWarningEl.addClass('is-visible');
			} else {
				ruleWarningEl.removeClass('is-visible');
			}

			hardCapWarningEl.empty();
			if (uiState.hardCapWarningMessage) {
				hardCapWarningEl.setText(uiState.hardCapWarningMessage);
				hardCapWarningEl.addClass('is-visible');
			} else {
				hardCapWarningEl.removeClass('is-visible');
			}

			includeEditor.setIgnoredLineIndexes(uiState.ignoredIncludeLineIndexes);
			excludeEditor.setIgnoredLineIndexes(uiState.ignoredExcludeLineIndexes);
		};

		renderRuleLimitsState();

		this.renderPathTester();
	}

	private renderRulesEditor(
		title: string,
		description: string,
		rules: string[],
		onChange: (value: string) => Promise<void>,
		onTextInput?: (value: string) => void,
	): { setIgnoredLineIndexes: (lineIndexes: number[]) => void } {
		const initialText = stringifyRules(rules);
		let currentText = initialText;
		let ignoredLineIndexes = new Set<number>();

		const sectionEl = this.containerEl.createDiv({ cls: 'read-only-view-rule-section' });
		new Setting(sectionEl).setName(title).setHeading();
		sectionEl.createEl('p', {
			text: description,
			cls: 'setting-item-description',
		});

		const textAreaEl = sectionEl.createEl('textarea');
		textAreaEl.value = initialText;
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
			onChange,
			setSaveState,
		);

		const diagnosticsEl = sectionEl.createDiv({ cls: 'read-only-view-rule-diagnostics' });
		new Setting(diagnosticsEl).setName('Rule diagnostics').setHeading();
		diagnosticsEl.setAttr('aria-live', 'polite');

		const renderDiagnostics = () => {
			const entries = buildRuleDiagnosticsWithIgnoredLines(
				currentText,
				this.plugin.settings.useGlobPatterns,
				ignoredLineIndexes,
			);
			renderDiagnosticsList(diagnosticsEl, entries);
		};

		renderDiagnostics();

		textAreaEl.addEventListener('input', () => {
			currentText = textAreaEl.value;
			onTextInput?.(currentText);
			saver.schedule(currentText);
			renderDiagnostics();
		});
		textAreaEl.addEventListener('change', () => {
			currentText = textAreaEl.value;
			onTextInput?.(currentText);
			void saver.flush(currentText);
			renderDiagnostics();
		});
		textAreaEl.addEventListener('blur', () => {
			currentText = textAreaEl.value;
			onTextInput?.(currentText);
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

	private renderPathTester(): void {
		const wrapperEl = this.containerEl.createDiv({ cls: 'read-only-view-path-tester' });
		new Setting(wrapperEl).setName('Path tester').setHeading();
		wrapperEl.createEl('p', {
			text: 'Enter a path exactly as file.path in Obsidian. Shows include/exclude matches and final read-only result.',
			cls: 'setting-item-description',
		});

		const inputEl = wrapperEl.createEl('input', { type: 'text' });
		inputEl.placeholder = 'project_a/subfolder/file_1.md';
		inputEl.addClass('read-only-view-full-width');

		const resultEl = wrapperEl.createDiv({ cls: 'read-only-view-path-tester-result' });

		const renderResult = () => {
			const { testPath, includeMatches, excludeMatches, finalReadOnly } = buildPathTesterResult(
				normalizeVaultPath(inputEl.value),
				this.plugin.settings,
			);
			resultEl.empty();

			if (!testPath) {
				resultEl.setText('Enter a file path to test.');
				return;
			}

			resultEl.createEl('div', {
				text: `Matched include: ${includeMatches.length > 0 ? includeMatches.join(', ') : 'none'}`,
			});
			resultEl.createEl('div', {
				text: `Matched exclude: ${excludeMatches.length > 0 ? excludeMatches.join(', ') : 'none'}`,
			});
			resultEl.createEl('div', {
				text: `Result: ${finalReadOnly ? 'READ-ONLY ON' : 'READ-ONLY OFF'}`,
			});
		};

		inputEl.addEventListener('input', renderResult);
		renderResult();
	}
}
