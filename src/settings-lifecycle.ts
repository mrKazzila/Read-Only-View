import type { ForceReadModeSettings } from './plugin-types';

export interface SettingsChangeHost {
	settings: ForceReadModeSettings;
	saveSettings: (snapshot?: ForceReadModeSettings) => Promise<void>;
	settingsChanged?: () => void;
	refreshEditorOptions?: () => void;
	applyAllOpenMarkdownLeaves?: (reason: string) => Promise<void>;
}

type Mutation = (draft: ForceReadModeSettings) => void;
type PendingChange = {
	mutate: Mutation;
	reason?: string;
	effects: Promise<void>;
	resolve: () => void;
	reject: (error: unknown) => void;
};

function copySettings(settings: ForceReadModeSettings): ForceReadModeSettings {
	return {
		...settings,
		includeRules: [...settings.includeRules], excludeRules: [...settings.excludeRules],
		includeRuleEnabled: [...settings.includeRuleEnabled], excludeRuleEnabled: [...settings.excludeRuleEnabled],
		includeRuleEntries: settings.includeRuleEntries?.map((entry) => ({ ...entry })),
		excludeRuleEntries: settings.excludeRuleEntries?.map((entry) => ({ ...entry })),
	};
}

class SettingsLifecycle {
	private committed: ForceReadModeSettings;
	private readonly pending: PendingChange[] = [];
	private running = false;

	constructor(private readonly host: SettingsChangeHost) {
		this.committed = copySettings(host.settings);
	}

	change(mutate: Mutation, reason?: string): Promise<void> {
		const next = copySettings(this.host.settings);
		mutate(next);
		return new Promise((resolve, reject) => {
			const change = { mutate, reason, resolve, reject, effects: this.publish(next, reason) };
			// Observe immediately: storage can remain pending after effects fail.
			void change.effects.catch(() => undefined);
			this.pending.push(change);
			void this.drain();
		});
	}

	private async publish(next: ForceReadModeSettings, reason?: string): Promise<void> {
		// Keep the object stable for the path tester and other open Settings consumers.
		Object.assign(this.host.settings, next);
		this.host.settingsChanged?.();
		if (reason) {
			this.host.refreshEditorOptions?.();
			if (next.enabled) await this.host.applyAllOpenMarkdownLeaves?.(reason);
		}
	}

	private async drain(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			while (this.pending.length) {
				const change = this.pending[0]!;
				const snapshot = copySettings(this.committed);
				try {
					change.mutate(snapshot);
					await this.host.saveSettings(copySettings(snapshot));
				} catch (error) {
					this.pending.shift();
					const restored = copySettings(this.committed);
					for (const later of [...this.pending]) {
						const draft = copySettings(restored);
						try {
							later.mutate(draft);
							Object.assign(restored, draft);
						} catch (rebaseError) {
							this.pending.splice(this.pending.indexOf(later), 1);
							later.reject(rebaseError);
						}
					}
					try { await this.publish(restored, change.reason); }
					catch { /* Report the original persistence failure after restoring state. */ }
					change.reject(error);
					continue;
				}
				this.committed = snapshot;
				this.pending.shift();
				try { await change.effects; change.resolve(); }
				catch (error) { change.reject(error); }
			}
		} finally { this.running = false; }
	}
}

const lifecycles = new WeakMap<SettingsChangeHost, SettingsLifecycle>();

/** Mutations must be replayable: only modify the supplied draft, never the UI. */
export function changeSettings(host: SettingsChangeHost, mutate: Mutation, reason?: string): Promise<void> {
	let lifecycle = lifecycles.get(host);
	if (!lifecycle) {
		lifecycle = new SettingsLifecycle(host);
		lifecycles.set(host, lifecycle);
	}
	return lifecycle.change(mutate, reason);
}
