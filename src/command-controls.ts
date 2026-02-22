export function canRunEnableCommand(enabled: boolean): boolean {
	return !enabled;
}

export function canRunDisableCommand(enabled: boolean): boolean {
	return enabled;
}

export function shouldReapplyAfterEnabledChange(previousEnabled: boolean, nextEnabled: boolean): boolean {
	return !previousEnabled && nextEnabled;
}
