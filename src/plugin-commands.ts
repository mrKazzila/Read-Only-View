import type { Plugin } from 'obsidian';
import {
	canRunDisableCommand,
	canRunEnableCommand,
} from './command-controls';

export interface PluginCommandDependencies {
	addCommand: Plugin['addCommand'];
	isEnabled: () => boolean;
	setPluginEnabled: (enabled: boolean, reason: string) => Promise<void>;
	applyAllOpenMarkdownLeaves: (reason: string) => Promise<void>;
}

export function registerPluginCommands(dependencies: PluginCommandDependencies): void {
	dependencies.addCommand({
		id: 'toggle-plugin-enabled',
		name: 'Toggle read-only mode',
		callback: async () => {
			await dependencies.setPluginEnabled(!dependencies.isEnabled(), 'command-toggle-enabled');
		},
	});

	dependencies.addCommand({
		id: 'enable-plugin',
		name: 'Enable read-only mode',
		checkCallback: (checking: boolean) => {
			if (!canRunEnableCommand(dependencies.isEnabled())) {
				return false;
			}
			if (!checking) {
				void dependencies.setPluginEnabled(true, 'command-enable');
			}
			return true;
		},
	});

	dependencies.addCommand({
		id: 'disable-plugin',
		name: 'Disable read-only mode',
		checkCallback: (checking: boolean) => {
			if (!canRunDisableCommand(dependencies.isEnabled())) {
				return false;
			}
			if (!checking) {
				void dependencies.setPluginEnabled(false, 'command-disable');
			}
			return true;
		},
	});

	dependencies.addCommand({
		id: 're-apply-rules-now',
		name: 'Re-apply rules now',
		callback: async () => {
			await dependencies.applyAllOpenMarkdownLeaves('command-reapply');
		},
	});
}
