import { App, PluginSettingTab } from 'obsidian';
import {
	splitRulesFromText,
	stringifyRules,
} from './rule-diagnostics';
import { renderGeneralSettings } from './settings-general';
import { renderPathTester } from './settings-path-tester';
import { renderRuleEditor } from './settings-rule-editor';
import { computeRuleLimitsUiState } from './settings-ui-state';
import type { SettingsTabPlugin } from './plugin-types';

export { computeRuleLimitsUiState } from './settings-ui-state';
export { DebouncedRuleChangeSaver } from './settings-rule-editor';

export class ForceReadModeSettingTab extends PluginSettingTab {
	plugin: SettingsTabPlugin;

	constructor(app: App, plugin: SettingsTabPlugin) {
		super(app, plugin as never);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		renderGeneralSettings(containerEl, this.plugin, () => this.display());

		const rulesSummaryEl = containerEl.createDiv({ cls: 'read-only-view-rules-summary' });
		const ruleWarningEl = containerEl.createDiv({ cls: 'read-only-view-rule-warning-banner' });
		const hardCapWarningEl = containerEl.createDiv({ cls: 'read-only-view-rule-warning-banner' });

		let includeRulesText = stringifyRules(this.plugin.settings.includeRules);
		let excludeRulesText = stringifyRules(this.plugin.settings.excludeRules);

		const includeEditor = renderRuleEditor({
			containerEl,
			title: 'Include rules',
			description: 'One rule per line. These files become read-only if not excluded.',
			initialText: stringifyRules(this.plugin.settings.includeRules),
			useGlobPatterns: this.plugin.settings.useGlobPatterns,
			onChange: async (value) => {
			this.plugin.settings.includeRules = splitRulesFromText(value);
			await this.plugin.saveSettings();
			await this.plugin.applyAllOpenMarkdownLeaves('settings-include-rules');
			},
			onTextInput: (value) => {
				includeRulesText = value;
				renderRuleLimitsState();
			},
		});

		const excludeEditor = renderRuleEditor({
			containerEl,
			title: 'Exclude rules',
			description: 'One rule per line. Exclude wins when include and exclude both match.',
			initialText: stringifyRules(this.plugin.settings.excludeRules),
			useGlobPatterns: this.plugin.settings.useGlobPatterns,
			onChange: async (value) => {
			this.plugin.settings.excludeRules = splitRulesFromText(value);
			await this.plugin.saveSettings();
			await this.plugin.applyAllOpenMarkdownLeaves('settings-exclude-rules');
			},
			onTextInput: (value) => {
				excludeRulesText = value;
				renderRuleLimitsState();
			},
		});

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

		renderPathTester(containerEl, this.plugin.settings);
	}
}
