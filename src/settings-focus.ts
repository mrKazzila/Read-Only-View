const SETTINGS_FOCUS_ATTRIBUTE = 'data-read-only-view-focus';

export type SettingsFocusSnapshot = {
	key: string;
};

export function setSettingsFocusKey(element: HTMLElement, key: string): void {
	element.setAttr(SETTINGS_FOCUS_ATTRIBUTE, key);
}

export function captureSettingsFocus(containerEl: HTMLElement): SettingsFocusSnapshot | null {
	const activeElement = containerEl.ownerDocument?.activeElement;
	if (!activeElement || !containerEl.contains(activeElement)) {
		return null;
	}

	const key = activeElement.getAttribute(SETTINGS_FOCUS_ATTRIBUTE);
	return key ? { key } : null;
}

export function restoreSettingsFocus(
	containerEl: HTMLElement,
	snapshot: SettingsFocusSnapshot | null,
): boolean {
	if (!snapshot) {
		return false;
	}

	const candidates = containerEl.querySelectorAll<HTMLElement>(`[${SETTINGS_FOCUS_ATTRIBUTE}]`);
	for (const candidate of Array.from(candidates)) {
		if (candidate.getAttribute(SETTINGS_FOCUS_ATTRIBUTE) === snapshot.key) {
			candidate.focus({ preventScroll: true });
			return true;
		}
	}

	return false;
}

export function focusFirstSettingsControl(containerEl: HTMLElement): boolean {
	const firstControl = containerEl.querySelector<HTMLElement>(`[${SETTINGS_FOCUS_ATTRIBUTE}]`);
	if (!firstControl) {
		return false;
	}

	firstControl.focus({ preventScroll: true });
	return true;
}
