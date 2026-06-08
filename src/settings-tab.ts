import { App, Plugin, PluginSettingTab } from 'obsidian';
import type { PathTesterController } from './settings-path-tester';
import {
	getPathTesterSummary,
	renderPathTester,
} from './settings-path-tester';
import {
	getDebugSummary,
	getMatchingSummary,
	renderDebugSettings,
	renderMatchingSettings,
	renderModeSelector,
	renderPrimarySettings,
} from './settings-general';
import {
	getPathRulesSummary,
	renderRuleEditor,
	type RuleEditorController,
} from './settings-rule-editor';
import type { SettingsTabPlugin } from './plugin-types';

export { computeRuleLimitsUiState } from './settings-ui-state';
export { DebouncedRuleChangeSaver } from './settings-rule-editor';

type SettingsSectionKey = 'pathRules' | 'pathTester' | 'matching' | 'debugFlags';

type DisclosureController = {
	bodyEl: HTMLElement;
	setSummary: (summary: string) => void;
};

type StaticSectionController = {
	bodyEl: HTMLElement;
	setSummary: (summary: string) => void;
};

type HeaderIndicatorsController = {
	setActiveRulesCount: (count: number) => void;
};

function getActiveRulesCount(settings: SettingsTabPlugin['settings']): number {
	return settings.includeRules.length + settings.excludeRules.length;
}

export class ForceReadModeSettingTab extends PluginSettingTab {
	plugin: SettingsTabPlugin;
	private ruleEditor: RuleEditorController | null = null;
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

		const headerIndicators = this.renderHeaderSection(containerEl);

		const modeSectionEl = this.createCardSection(containerEl);
		renderPrimarySettings(modeSectionEl, this.plugin, () => this.display());
		renderModeSelector(modeSectionEl, this.plugin, () => this.display());

		const pathRulesSection = this.createStaticWorkflowSection(
			containerEl,
			'Path rules',
			'Choose folders or notes to keep in Reading view.',
			getPathRulesSummary(this.plugin.settings.includeRules, this.plugin.settings.excludeRules),
		);
		this.ruleEditor = renderRuleEditor({
			containerEl: pathRulesSection.bodyEl,
			includeRules: this.plugin.settings.includeRules,
			excludeRules: this.plugin.settings.excludeRules,
			useGlobPatterns: this.plugin.settings.useGlobPatterns,
			onChange: async (state, reason) => {
				const presetWasEnabled = this.plugin.settings.forceAllMarkdownReadOnly;
				this.plugin.settings.includeRules = state.includeRules;
				this.plugin.settings.excludeRules = state.excludeRules;
				if (presetWasEnabled) {
					this.plugin.settings.forceAllMarkdownReadOnly = false;
				}
				await this.plugin.saveSettings();
				this.plugin.refreshEditorOptions();
				await this.plugin.applyAllOpenMarkdownLeaves(reason);
				if (presetWasEnabled) {
					this.display();
					return;
				}
				pathRulesSection.setSummary(
					getPathRulesSummary(state.includeRules, state.excludeRules),
				);
			},
			onStateChange: ({ includeCount, excludeCount }) => {
				pathRulesSection.setSummary(buildRulesSummary(includeCount, excludeCount));
				headerIndicators.setActiveRulesCount(includeCount + excludeCount);
			},
		});

		const pathTesterSection = this.createStaticWorkflowSection(
			containerEl,
			'Path tester',
			'Test a vault path against the current rules.',
			getPathTesterSummary(),
		);
		this.pathTesterController = renderPathTester(pathTesterSection.bodyEl, {
			settings: this.plugin.settings,
			getCompiledRuleMatcher: this.plugin.getCompiledRuleMatcher?.bind(this.plugin),
		});

		const advancedSectionEl = this.createCardSection(containerEl, 'Advanced');
		const matchingSection = this.createCollapsibleSection(
			advancedSectionEl,
			'matching',
			'Matching',
			'Choose how paths are compared before rules are evaluated.',
			getMatchingSummary(this.plugin.settings),
			false,
		);
		renderMatchingSettings(matchingSection.bodyEl, this.plugin, () => this.display());

		const debugSection = this.createCollapsibleSection(
			advancedSectionEl,
			'debugFlags',
			'Debug flags',
			'Enable extra logging only when diagnosing rule behavior.',
			getDebugSummary(this.plugin.settings),
			false,
		);
		renderDebugSettings(debugSection.bodyEl, this.plugin, () => this.display());
	}

	hide(): void {
		this.disposeUiControllers();
		this.sectionOpenState.clear();
	}

	private renderHeaderSection(containerEl: HTMLElement): HeaderIndicatorsController {
		const sectionEl = containerEl.createDiv({ cls: 'read-only-view-header-card' });
		sectionEl.createDiv({
			text: 'Read Only View',
			cls: 'read-only-view-header-title',
		});
		sectionEl.createDiv({
			text: 'Read-only behavior',
			cls: 'read-only-view-header-subtitle',
		});
		sectionEl.createDiv({
			text: 'Keep selected Markdown notes in Reading view',
			cls: 'read-only-view-header-description',
		});

		const indicatorsEl = sectionEl.createDiv({ cls: 'read-only-view-header-indicators' });
		const activeRulesBadgeEl = indicatorsEl.createDiv({ cls: 'read-only-view-status-badge' });
		activeRulesBadgeEl.setText(`Active rules: ${getActiveRulesCount(this.plugin.settings)}`);
		if (this.plugin.settings.forceAllMarkdownReadOnly) {
			const warningEl = indicatorsEl.createDiv({ cls: 'read-only-view-global-warning' });
			warningEl.setText('All Markdown files mode is enabled');
		}
		return {
			setActiveRulesCount: (count: number) => {
				activeRulesBadgeEl.setText(`Active rules: ${count}`);
			},
		};
	}

	private createCardSection(containerEl: HTMLElement, title?: string): HTMLElement {
		const sectionEl = containerEl.createDiv({ cls: 'read-only-view-section-card' });
		if (title) {
			sectionEl.createDiv({
				text: title,
				cls: 'read-only-view-section-card-title',
			});
		}
		return sectionEl;
	}

	private createStaticWorkflowSection(
		containerEl: HTMLElement,
		title: string,
		description: string,
		summary: string,
	): StaticSectionController {
		const sectionEl = this.createCardSection(containerEl);
		const headerEl = sectionEl.createDiv({ cls: 'read-only-view-static-section-header' });
		const copyEl = headerEl.createDiv({ cls: 'read-only-view-static-section-copy' });
		copyEl.createDiv({
			text: title,
			cls: 'read-only-view-disclosure-title',
		});
		copyEl.createDiv({
			text: description,
			cls: 'read-only-view-disclosure-description',
		});
		const summaryEl = headerEl.createDiv({ cls: 'read-only-view-static-section-summary' });
		summaryEl.setText(summary);

		const bodyEl = sectionEl.createDiv({ cls: 'read-only-view-static-section-body' });
		return {
			bodyEl,
			setSummary: (nextSummary: string) => {
				summaryEl.setText(nextSummary);
			},
		};
	}

	private createCollapsibleSection(
		containerEl: HTMLElement,
		sectionKey: SettingsSectionKey,
		title: string,
		description: string,
		summary: string,
		defaultOpen: boolean,
	): DisclosureController {
		const open = this.sectionOpenState.get(sectionKey) ?? defaultOpen;
		const wrapperEl = containerEl.createDiv({
			cls: `read-only-view-disclosure-row${open ? ' is-open' : ''}`,
		});
		const toggleEl = wrapperEl.createEl('button', {
			cls: 'read-only-view-disclosure-toggle',
			type: 'button',
		});
		toggleEl.setAttr('aria-expanded', open ? 'true' : 'false');

		const copyEl = toggleEl.createSpan({ cls: 'read-only-view-disclosure-copy' });
		copyEl.createSpan({
			text: title,
			cls: 'read-only-view-disclosure-title',
		});
		copyEl.createSpan({
			text: description,
			cls: 'read-only-view-disclosure-description',
		});

		const metaEl = toggleEl.createSpan({ cls: 'read-only-view-disclosure-meta' });
		const summaryEl = metaEl.createSpan({ cls: 'read-only-view-disclosure-summary' });
		summaryEl.setText(summary);
		metaEl.createSpan({
			text: open ? '▼' : '▶',
			cls: 'read-only-view-disclosure-arrow',
		});

		const bodyEl = wrapperEl.createDiv({
			cls: `read-only-view-disclosure-body${open ? '' : ' is-collapsed'}`,
		});

		toggleEl.addEventListener('click', () => {
			const isOpen = wrapperEl.matches('.is-open');
			if (isOpen) {
				this.sectionOpenState.set(sectionKey, false);
				wrapperEl.removeClass('is-open');
				bodyEl.addClass('is-collapsed');
				toggleEl.setAttr('aria-expanded', 'false');
				toggleEl.querySelector('.read-only-view-disclosure-arrow')?.setText('▶');
				return;
			}

			this.sectionOpenState.set(sectionKey, true);
			wrapperEl.addClass('is-open');
			bodyEl.removeClass('is-collapsed');
			toggleEl.setAttr('aria-expanded', 'true');
			toggleEl.querySelector('.read-only-view-disclosure-arrow')?.setText('▼');
		});

		return {
			bodyEl,
			setSummary: (nextSummary: string) => {
				summaryEl.setText(nextSummary);
			},
		};
	}

	private disposeUiControllers(): void {
		this.ruleEditor?.dispose();
		this.ruleEditor = null;
		this.pathTesterController?.dispose();
		this.pathTesterController = null;
	}
}

function buildRulesSummary(includeCount: number, excludeCount: number): string {
	return `${includeCount} include · ${excludeCount} exclude`;
}
