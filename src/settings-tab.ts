import { App, Plugin, PluginSettingTab } from 'obsidian';
import type { PathTesterController } from './settings-path-tester';
import {
	splitRulesFromText,
	stringifyRules,
} from './rule-diagnostics';
import {
	renderDebugSettings,
	renderMatchingSettings,
	renderPrimarySettings,
} from './settings-general';
import { renderPathTester } from './settings-path-tester';
import { renderRuleEditor } from './settings-rule-editor';
import { computeRuleLimitsUiState } from './settings-ui-state';
import type { SettingsTabPlugin } from './plugin-types';
import type { RuleEditorController } from './settings-rule-editor';

export { computeRuleLimitsUiState } from './settings-ui-state';
export { DebouncedRuleChangeSaver } from './settings-rule-editor';

type SettingsSectionKey = 'matching' | 'pathRules' | 'pathTester' | 'debugFlags';

export class ForceReadModeSettingTab extends PluginSettingTab {
	plugin: SettingsTabPlugin;
	private ruleEditors: RuleEditorController[] = [];
	private pathTesterController: PathTesterController | null = null;
	private readonly sectionOpenState = new Map<SettingsSectionKey, boolean>();

	constructor(app: App, plugin: Plugin & SettingsTabPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.disposeUiControllers();
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('read-only-view-settings');

		this.renderPrimarySection(containerEl);
		this.renderMatchingSection(containerEl);

		const includeRulesTextInitial = stringifyRules(this.plugin.settings.includeRules);
		const excludeRulesTextInitial = stringifyRules(this.plugin.settings.excludeRules);

		const rulesUi = this.renderRulesSection(
			containerEl,
			includeRulesTextInitial,
			excludeRulesTextInitial,
		);

		let includeRulesText = includeRulesTextInitial;
		let excludeRulesText = excludeRulesTextInitial;

		const includeEditor = renderRuleEditor({
			containerEl: rulesUi.contentEl,
			title: 'Include rules',
			description: 'One rule per line. These files become read-only if not excluded.',
			initialText: includeRulesTextInitial,
			useGlobPatterns: this.plugin.settings.useGlobPatterns,
			onChange: async (value) => {
				this.plugin.settings.includeRules = splitRulesFromText(value);
				if (this.plugin.settings.forceAllMarkdownReadOnly) {
					this.plugin.settings.forceAllMarkdownReadOnly = false;
				}
				await this.plugin.saveSettings();
				this.plugin.refreshEditorOptions();
				await this.plugin.applyAllOpenMarkdownLeaves('settings-include-rules');
			},
			onTextInput: (value) => {
				includeRulesText = value;
				renderRuleLimitsState();
			},
		});

		const excludeEditor = renderRuleEditor({
			containerEl: rulesUi.contentEl,
			title: 'Exclude rules',
			description: 'One rule per line. Exclude wins when include and exclude both match.',
			initialText: excludeRulesTextInitial,
			useGlobPatterns: this.plugin.settings.useGlobPatterns,
			onChange: async (value) => {
				this.plugin.settings.excludeRules = splitRulesFromText(value);
				if (this.plugin.settings.forceAllMarkdownReadOnly) {
					this.plugin.settings.forceAllMarkdownReadOnly = false;
				}
				await this.plugin.saveSettings();
				this.plugin.refreshEditorOptions();
				await this.plugin.applyAllOpenMarkdownLeaves('settings-exclude-rules');
			},
			onTextInput: (value) => {
				excludeRulesText = value;
				renderRuleLimitsState();
			},
		});
		this.ruleEditors = [includeEditor, excludeEditor];

		const renderRuleLimitsState = () => {
			const uiState = computeRuleLimitsUiState(includeRulesText, excludeRulesText);
			rulesUi.summaryEl.setText(uiState.summaryText);
			rulesUi.warningEl.empty();
			if (uiState.volumeWarningMessage) {
				rulesUi.warningEl.setText(uiState.volumeWarningMessage);
				rulesUi.warningEl.addClass('is-visible');
			} else {
				rulesUi.warningEl.removeClass('is-visible');
			}

			rulesUi.hardCapWarningEl.empty();
			if (uiState.hardCapWarningMessage) {
				rulesUi.hardCapWarningEl.setText(uiState.hardCapWarningMessage);
				rulesUi.hardCapWarningEl.addClass('is-visible');
			} else {
				rulesUi.hardCapWarningEl.removeClass('is-visible');
			}

			includeEditor.setIgnoredLineIndexes(uiState.ignoredIncludeLineIndexes);
			excludeEditor.setIgnoredLineIndexes(uiState.ignoredExcludeLineIndexes);
		};

		renderRuleLimitsState();

		this.renderPathTesterSection(containerEl);
		this.renderDebugSection(containerEl);
	}

	hide(): void {
		this.disposeUiControllers();
		this.sectionOpenState.clear();
	}

	private renderPrimarySection(containerEl: HTMLElement): void {
		const contentEl = this.createStaticSection(containerEl, 'Plugin');
		contentEl.createEl('p', {
			text: 'Read only view keeps matched Markdown notes in reading view and helps you configure matching without changing rule behavior.',
			cls: 'read-only-view-muted',
		});
		renderPrimarySettings(contentEl, this.plugin, () => this.display());
	}

	private renderMatchingSection(containerEl: HTMLElement): void {
		const contentEl = this.createCollapsibleSection(
			containerEl,
			'matching',
			'Matching',
			'Choose how paths are compared before any include or exclude rule is evaluated.',
			false,
			'plain',
		);
		renderMatchingSettings(contentEl, this.plugin, () => this.display());
	}

	private renderRulesSection(
		containerEl: HTMLElement,
		includeRulesText: string,
		excludeRulesText: string,
	): {
		contentEl: HTMLElement;
		summaryEl: HTMLElement;
		warningEl: HTMLElement;
		hardCapWarningEl: HTMLElement;
	} {
		const contentEl = this.createCollapsibleSection(
			containerEl,
			'pathRules',
			'Path rules',
			'Configure include and exclude path rules. Exclude rules always win over matching include rules.',
			false,
			'panel',
		);
		const presetNoteEl = contentEl.createDiv({ cls: 'read-only-view-rules-preset-note' });
		if (this.plugin.settings.forceAllMarkdownReadOnly) {
			presetNoteEl.setText('Preset active: all Markdown files are read-only. Saved path rules are currently ignored.');
		}
		const summaryEl = contentEl.createDiv({ cls: 'read-only-view-rules-summary' });
		const warningEl = contentEl.createDiv({ cls: 'read-only-view-rule-warning-banner' });
		const hardCapWarningEl = contentEl.createDiv({ cls: 'read-only-view-rule-warning-banner' });
		summaryEl.setText(computeRuleLimitsUiState(includeRulesText, excludeRulesText).summaryText);
		return {
			contentEl,
			summaryEl,
			warningEl,
			hardCapWarningEl,
		};
	}

	private renderPathTesterSection(containerEl: HTMLElement): void {
		const contentEl = this.createCollapsibleSection(
			containerEl,
			'pathTester',
			'Path tester',
			'Test a vault path against the current rules before you change matching settings or rule text.',
			false,
			'panel',
		);
		this.pathTesterController = renderPathTester(contentEl, {
			settings: this.plugin.settings,
			getCompiledRuleMatcher: this.plugin.getCompiledRuleMatcher?.bind(this.plugin),
		});
	}

	private renderDebugSection(containerEl: HTMLElement): void {
		const contentEl = this.createCollapsibleSection(
			containerEl,
			'debugFlags',
			'Debug flags',
			'Enable extra logging only when diagnosing rule behavior. Verbose path logging may expose full file paths in developer console logs.',
			false,
			'plain',
		);
		renderDebugSettings(contentEl, this.plugin, () => this.display());
	}

	private createStaticSection(containerEl: HTMLElement, title: string): HTMLElement {
		const sectionEl = containerEl.createDiv({ cls: 'read-only-view-section read-only-view-section-static' });
		sectionEl.createDiv({
			text: title,
			cls: 'read-only-view-section-title',
		});
		return sectionEl.createDiv({ cls: 'read-only-view-section-body' });
	}

	private createCollapsibleSection(
		containerEl: HTMLElement,
		sectionKey: SettingsSectionKey,
		title: string,
		description: string,
		defaultOpen: boolean,
		style: 'plain' | 'panel',
	): HTMLElement {
		const open = this.sectionOpenState.get(sectionKey) ?? defaultOpen;
		const wrapperEl = containerEl.createDiv({
			cls: `read-only-view-disclosure read-only-view-disclosure-${style}${open ? ' is-open' : ''}`,
		});
		wrapperEl.createEl('p', {
			text: description,
			cls: 'read-only-view-disclosure-description',
		});
		const toggleEl = wrapperEl.createEl('button', {
			cls: 'read-only-view-disclosure-toggle',
			type: 'button',
		});
		toggleEl.setAttr('aria-expanded', open ? 'true' : 'false');
		toggleEl.createSpan({
			text: open ? '▼' : '▶',
			cls: 'read-only-view-disclosure-arrow',
		});
		toggleEl.createSpan({
			text: title,
			cls: 'read-only-view-disclosure-title',
		});

		const sectionEl = wrapperEl.createDiv({
			cls: `read-only-view-section read-only-view-section-${style}${open ? '' : ' is-collapsed'}`,
		});
		const bodyEl = sectionEl.createDiv({ cls: 'read-only-view-section-body' });

		toggleEl.addEventListener('click', () => {
			const isOpen = wrapperEl.matches('.is-open');
			if (isOpen) {
				this.sectionOpenState.set(sectionKey, false);
				wrapperEl.removeClass('is-open');
				sectionEl.addClass('is-collapsed');
				toggleEl.setAttr('aria-expanded', 'false');
				toggleEl.querySelector('.read-only-view-disclosure-arrow')?.setText('▶');
				return;
			}

			this.sectionOpenState.set(sectionKey, true);
			wrapperEl.addClass('is-open');
			sectionEl.removeClass('is-collapsed');
			toggleEl.setAttr('aria-expanded', 'true');
			toggleEl.querySelector('.read-only-view-disclosure-arrow')?.setText('▼');
		});

		return bodyEl;
	}

	private disposeUiControllers(): void {
		for (const editor of this.ruleEditors) {
			editor.dispose();
		}
		this.ruleEditors = [];
		this.pathTesterController?.dispose();
		this.pathTesterController = null;
	}
}
