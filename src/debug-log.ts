import { normalizeVaultPath } from './path-utils';

export function formatPathForDebug(path: string, verbosePaths: boolean): string {
	const normalized = normalizeVaultPath(path);
	if (verbosePaths) {
		return normalized;
	}
	const parts = normalized.split('/');
	const basename = parts[parts.length - 1] ?? '';
	return basename ? `[redacted]/${basename}` : '[redacted]';
}
