import { ToggleComponent } from 'obsidian';
import type { ForceReadModeSettings, SettingsTabPlugin } from './plugin-types';

type BooleanSettingKey = {
	[K in keyof ForceReadModeSettings]: ForceReadModeSettings[K] extends boolean ? K : never;
}[keyof ForceReadModeSettings];

type ToggleSettingConfig = {
	name: string;
	description: string;
	settingKey: BooleanSettingKey;
	reapplyReason?: string;
};

const TOGGLE_SETTINGS: ToggleSettingConfig[] = [
	{
		name: 'Enabled',
		description: 'Enable or disable read-only enforcement globally.',
		settingKey: 'enabled',
		reapplyReason: 'settings-enabled',
	},
	{
		name: 'Use glob patterns',
		description: 'Use glob tokens (*, **, ?) for matching. Disable for literal prefix compatibility mode.',
		settingKey: 'useGlobPatterns',
		reapplyReason: 'settings-use-glob-patterns',
	},
	{
		name: 'Case sensitive',
		description: 'When disabled, both rules and file paths are compared in lower case.',
		settingKey: 'caseSensitive',
		reapplyReason: 'settings-case-sensitive',
	},
	{
		name: 'Debug logging',
		description: 'Write detailed logs to the developer console.',
		settingKey: 'debug',
	},
	{
		name: 'Debug: verbose paths',
		description: 'When enabled, debug logs include full file paths. Keep disabled for safer default redaction.',
		settingKey: 'debugVerbosePaths',
	},
];

const PRIMARY_TOGGLE_SETTING_KEYS: BooleanSettingKey[] = ['enabled'];

const MATCHING_TOGGLE_SETTING_KEYS: BooleanSettingKey[] = [
	'useGlobPatterns',
	'caseSensitive',
];

const DEBUG_TOGGLE_SETTING_KEYS: BooleanSettingKey[] = [
	'debug',
	'debugVerbosePaths',
];

function renderToggleSettings(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
	allowedSettingKeys: BooleanSettingKey[],
): void {
	for (const toggleSetting of TOGGLE_SETTINGS) {
		if (!allowedSettingKeys.includes(toggleSetting.settingKey)) {
			continue;
		}

		const settingEl = containerEl.createDiv({ cls: 'read-only-view-setting-item' });
		const infoEl = settingEl.createDiv({ cls: 'read-only-view-setting-info' });
		infoEl.createDiv({
			text: toggleSetting.name,
			cls: 'read-only-view-setting-name',
		});
		infoEl.createDiv({
			text: toggleSetting.description,
			cls: 'read-only-view-setting-description',
		});

		const controlEl = settingEl.createDiv({ cls: 'read-only-view-setting-control' });
		const toggle = new ToggleComponent(controlEl);
		toggle.toggleEl.addClass('read-only-view-setting-toggle');
		toggle
			.setValue(plugin.settings[toggleSetting.settingKey])
			.onChange(async (value) => {
				await updateBooleanSetting(
					plugin,
					toggleSetting.settingKey,
					value,
					refresh,
					toggleSetting.reapplyReason,
				);
			});
	}
}

function createModeOption(
	containerEl: HTMLElement,
	option: {
		value: boolean;
		title: string;
		description: string;
		selected: boolean;
	},
	onSelect: (value: boolean) => Promise<void>,
): void {
	const labelEl = containerEl.createEl('label', { cls: 'read-only-view-mode-option' });
	const radioEl = labelEl.createEl('input', { type: 'radio' });
	radioEl.setAttr('name', 'read-only-view-mode');
	radioEl.setAttr('aria-label', option.title);
	radioEl.value = option.value ? 'all-markdown' : 'matched-paths';
	if (option.selected) {
		radioEl.setAttr('checked', 'checked');
	}
	radioEl.checked = option.selected;

	const textEl = labelEl.createDiv({ cls: 'read-only-view-mode-option-copy' });
	textEl.createDiv({
		text: option.title,
		cls: 'read-only-view-mode-option-title',
	});
	textEl.createDiv({
		text: option.description,
		cls: 'read-only-view-mode-option-description',
	});

	const activate = async () => {
		await onSelect(option.value);
	};

	const setSelectedClass = (element: Element, selected: boolean) => {
		if ('classList' in element && element.classList) {
			if (selected) {
				element.classList.add('is-selected');
			} else {
				element.classList.remove('is-selected');
			}
			return;
		}

		const fallbackElement = element as Element & {
			addClass?: (cls: string) => void;
			removeClass?: (cls: string) => void;
		};
		if (selected) {
			fallbackElement.addClass?.('is-selected');
			return;
		}
		fallbackElement.removeClass?.('is-selected');
	};

	const syncSelectedState = () => {
		const siblings = Array.from(containerEl.querySelectorAll('.read-only-view-mode-option'));
		for (const sibling of siblings) {
			setSelectedClass(sibling, false);
		}
		setSelectedClass(labelEl, radioEl.checked);
	};

	setSelectedClass(labelEl, option.selected);

	radioEl.addEventListener('change', () => {
		syncSelectedState();
		void activate();
	});
}

export function getMatchingSummary(settings: ForceReadModeSettings): string {
	const modeLabel = settings.useGlobPatterns ? 'Glob matching' : 'Prefix matching';
	const caseLabel = settings.caseSensitive ? 'Case-sensitive' : 'Case-insensitive';
	return `${modeLabel} · ${caseLabel}`;
}

export function getDebugSummary(settings: ForceReadModeSettings): string {
	if (settings.debugVerbosePaths) {
		return 'Verbose paths on';
	}
	if (settings.debug) {
		return 'Debug on';
	}
	return 'Off';
}

export function renderPrimarySettings(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
): void {
	renderToggleSettings(containerEl, plugin, refresh, PRIMARY_TOGGLE_SETTING_KEYS);
}

export function renderModeSelector(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
): void {
	const sectionEl = containerEl.createDiv({ cls: 'read-only-view-mode-card' });
	sectionEl.createDiv({
		text: 'Mode',
		cls: 'read-only-view-block-title',
	});
	sectionEl.createDiv({
		text: 'Choose whether read-only behavior is driven by path rules or applied to all Markdown notes.',
		cls: 'read-only-view-block-description',
	});

	const optionsEl = sectionEl.createDiv({ cls: 'read-only-view-mode-options' });
	const renderOption = (option: {
		value: boolean;
		title: string;
		description: string;
	}) => {
		createModeOption(
			optionsEl,
			{
				...option,
				selected: plugin.settings.forceAllMarkdownReadOnly === option.value,
			},
			async (value) => {
				if (plugin.settings.forceAllMarkdownReadOnly === value) {
					return;
				}
				await updateBooleanSetting(
					plugin,
					'forceAllMarkdownReadOnly',
					value,
					refresh,
					'settings-force-all-markdown-read-only',
				);
			},
		);
	};

	renderOption({
		value: false,
		title: 'Only matched paths',
		description: 'Include rules decide which Markdown notes stay in Reading view.',
	});
	renderOption({
		value: true,
		title: 'All Markdown files',
		description: 'Every Markdown note stays in Reading view unless an exclude rule matches.',
	});

	const priorityEl = sectionEl.createDiv({ cls: 'read-only-view-priority-copy' });
	priorityEl.createEl('p', { text: 'Exclude rules always win.' });
	priorityEl.createEl('p', {
		text: 'Priority: Exclude rules → all Markdown files mode → include rules.',
	});
	priorityEl.createEl('p', {
		text: 'All Markdown files mode ignores include rules. Exclude rules still win.',
	});

	if (plugin.settings.forceAllMarkdownReadOnly) {
		const warningEl = sectionEl.createDiv({ cls: 'read-only-view-global-warning' });
		warningEl.setText('All Markdown files mode is enabled');
	}
}

export function renderMatchingSettings(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
): void {
	renderToggleSettings(containerEl, plugin, refresh, MATCHING_TOGGLE_SETTING_KEYS);
}

export function renderDebugSettings(
	containerEl: HTMLElement,
	plugin: SettingsTabPlugin,
	refresh: () => void,
): void {
	renderToggleSettings(containerEl, plugin, refresh, DEBUG_TOGGLE_SETTING_KEYS);
}

export async function updateBooleanSetting(
	plugin: SettingsTabPlugin,
	settingKey: BooleanSettingKey,
	value: boolean,
	refresh: () => void,
	reapplyReason?: string,
): Promise<void> {
	plugin.settings[settingKey] = value;
	await plugin.saveSettings();
	if (reapplyReason) {
		plugin.refreshEditorOptions();
	}
	if (reapplyReason && (settingKey !== 'enabled' || value)) {
		await plugin.applyAllOpenMarkdownLeaves(reapplyReason);
	}
	refresh();
}
