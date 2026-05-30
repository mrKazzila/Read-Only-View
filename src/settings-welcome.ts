import { App, Modal } from 'obsidian';
import type { ForceReadModeSettings } from './plugin-types';

export const WELCOME_VERSION = 1;

type WelcomeSettingsPlugin = {
	settings: ForceReadModeSettings;
	saveSettings: () => Promise<void>;
};

type AppWithOptionalSettings = App & {
	setting?: {
		open?: () => void;
		openTabById?: (id: string) => void;
	};
};

export function shouldShowWelcomeModal(settings: ForceReadModeSettings): boolean {
	return settings.dismissedWelcomeVersion < WELCOME_VERSION;
}

export class WelcomeModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: WelcomeSettingsPlugin,
		private readonly pluginId: string,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('read-only-view-welcome-modal');
		contentEl.createEl('h2', { text: 'Welcome to read only view' });
		contentEl.createEl('p', {
			text: 'Read only view keeps selected notes in reading view to reduce accidental edits.',
			cls: 'read-only-view-muted',
		});
		const stepsEl = contentEl.createEl('ol', { cls: 'read-only-view-welcome-steps' });
		stepsEl.createEl('li', { text: 'Add include rules for notes or folders that should stay read-only.' });
		stepsEl.createEl('li', { text: 'Add optional exclude rules for exceptions.' });
		stepsEl.createEl('li', { text: 'Use the path tester to verify matching.' });

		const actionsEl = contentEl.createDiv({ cls: 'read-only-view-welcome-actions' });
		const openSettingsButton = actionsEl.createEl('button', { text: 'Open settings' });
		openSettingsButton.addClass('mod-cta');
		openSettingsButton.addEventListener('click', () => {
			void this.dismissAndOpenSettings();
		});

		const closeButton = actionsEl.createEl('button', { text: 'Close' });
		closeButton.addEventListener('click', () => {
			void this.dismiss();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async dismiss(): Promise<void> {
		this.plugin.settings.dismissedWelcomeVersion = WELCOME_VERSION;
		await this.plugin.saveSettings();
		this.close();
	}

	private async dismissAndOpenSettings(): Promise<void> {
		await this.dismiss();
		openPluginSettingsBestEffort(this.app, this.pluginId);
	}
}

export function maybeShowWelcomeModal(
	app: App,
	plugin: WelcomeSettingsPlugin,
	pluginId: string,
): WelcomeModal | null {
	if (!shouldShowWelcomeModal(plugin.settings)) {
		return null;
	}

	const modal = new WelcomeModal(app, plugin, pluginId);
	modal.open();
	return modal;
}

export function openPluginSettingsBestEffort(app: App, pluginId: string): void {
	const settings = (app as AppWithOptionalSettings).setting;
	if (typeof settings?.open !== 'function') {
		return;
	}

	settings.open();
	if (typeof settings.openTabById === 'function') {
		settings.openTabById(pluginId);
	}
}
