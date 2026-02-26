export function normalizeVaultPath(path: string): string {
	let normalized = path.trim();
	normalized = normalized.replace(/\\/g, '/');
	normalized = normalized.replace(/^(\.\/)+/, '');
	normalized = normalized.replace(/\/+/g, '/');
	return normalized;
}
