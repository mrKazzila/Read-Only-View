export const PATH_SOURCE_INPUT_MAX_LENGTH = 40_000;
export const OBSIDIAN_URI_INPUT_MAX_LENGTH = 120_000;
export const SOURCE_VALUE_DISPLAY_MAX_LENGTH = 512;

export type LimitedSourceInput = {
	value: string;
	limit: number;
	exceeded: boolean;
};

export function getSourceInputMaxLength(value: string): number {
	return value.trimStart().toLowerCase().startsWith('obsidian://')
		? OBSIDIAN_URI_INPUT_MAX_LENGTH
		: PATH_SOURCE_INPUT_MAX_LENGTH;
}

export function limitSourceInput(value: string, keepExceeded = false): LimitedSourceInput {
	const limit = getSourceInputMaxLength(value);
	const exceeded = value.length > limit || (keepExceeded && value.length >= limit);
	return {
		value: exceeded ? value.slice(0, limit) : value,
		limit,
		exceeded,
	};
}

export function formatSourceValueForDisplay(
	value: string,
	maxLength = SOURCE_VALUE_DISPLAY_MAX_LENGTH,
): string {
	if (value.length <= maxLength) {
		return value;
	}
	const tailLength = Math.floor(maxLength / 4);
	const headLength = maxLength - tailLength - 1;
	return `${value.slice(0, headLength)}…${value.slice(-tailLength)} (${value.length} characters)`;
}

export function buildSourceInputLimitMessage(limit: number): string {
	return `Input is too long. Maximum: ${limit.toLocaleString('en-US')} characters.`;
}
