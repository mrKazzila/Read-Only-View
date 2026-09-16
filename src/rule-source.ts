import { FileSystemAdapter, TFile, TFolder, type Vault } from 'obsidian';
import { normalizeVaultPath } from './path-utils';
import type { RuleEntry, RuleSourceKind } from './plugin-types';

export type RuleResolverContext = {
	vaultName: string;
	vaultBasePath: string | null;
	isMarkdownFile: (path: string) => boolean;
	isFolder: (path: string) => boolean;
};

export type RuleResolution = {
	sourceKind: RuleSourceKind;
	sourceValue: string;
	resolvedPath: string | null;
	error: string | null;
};

function containsTraversal(path: string): boolean {
	return path.replace(/\\/g, '/').split('/').some((segment) => segment === '..');
}

function containsMalformedPercentEncoding(value: string): boolean {
	return /%(?![0-9a-fA-F]{2})/.test(value);
}

function removeFileLocator(path: string): string {
	const locatorIndex = path.indexOf('#');
	return locatorIndex === -1 ? path : path.slice(0, locatorIndex);
}

function ensureMarkdownExtension(path: string): string | null {
	const finalSegment = path.slice(path.lastIndexOf('/') + 1);
	if (!finalSegment.includes('.')) {
		return `${path}.md`;
	}
	return path.toLowerCase().endsWith('.md') ? path : null;
}

function resolveExactVaultFile(
	pathInput: string,
	sourceKind: RuleSourceKind,
	sourceValue: string,
	context: RuleResolverContext,
): RuleResolution {
	if (containsTraversal(pathInput)) {
		return { sourceKind, sourceValue, resolvedPath: null, error: 'Parent path segments (..) are not allowed.' };
	}
	const normalized = normalizeVaultPath(removeFileLocator(pathInput));
	if (!normalized || normalized.startsWith('/') || normalized.includes('*') || normalized.includes('?')) {
		return { sourceKind, sourceValue, resolvedPath: null, error: 'A single vault-relative file path is required.' };
	}
	const markdownPath = ensureMarkdownExtension(normalized);
	if (!markdownPath) {
		return { sourceKind, sourceValue, resolvedPath: null, error: 'Advanced rules can target Markdown files only.' };
	}
	if (!context.isMarkdownFile(markdownPath)) {
		return { sourceKind, sourceValue, resolvedPath: null, error: `Markdown file not found in this vault: ${markdownPath}` };
	}
	return { sourceKind, sourceValue, resolvedPath: markdownPath, error: null };
}

function isAbsolutePath(value: string): boolean {
	return value.startsWith('/') || value.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(value);
}

function normalizeAbsolutePath(value: string): string {
	let normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
	if (normalized.length > 1 && normalized.endsWith('/')) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

function resolveAbsolutePath(
	value: string,
	context: RuleResolverContext,
	sourceKind: RuleSourceKind = 'absolute-path',
	sourceValue = value,
): RuleResolution {
	if (!context.vaultBasePath) {
		return {
			sourceKind,
			sourceValue,
			resolvedPath: null,
			error: 'System paths can be imported only in the desktop app.',
		};
	}
	if (containsTraversal(value)) {
		return { sourceKind, sourceValue, resolvedPath: null, error: 'Parent path segments (..) are not allowed.' };
	}
	const folderHint = /[\\/]$/.test(value.trim());
	const absolutePath = normalizeAbsolutePath(value);
	const basePath = normalizeAbsolutePath(context.vaultBasePath);
	const caseInsensitive = /^[a-zA-Z]:\//.test(absolutePath) || absolutePath.startsWith('//');
	const comparablePath = caseInsensitive ? absolutePath.toLowerCase() : absolutePath;
	const comparableBase = caseInsensitive ? basePath.toLowerCase() : basePath;
	if (!comparablePath.startsWith(`${comparableBase}/`)) {
		return { sourceKind, sourceValue, resolvedPath: null, error: 'System path is outside the current vault.' };
	}
	const relativePath = normalizeVaultPath(absolutePath.slice(basePath.length + 1));
	if (context.isFolder(relativePath)) {
		return {
			sourceKind,
			sourceValue,
			resolvedPath: `${relativePath.replace(/\/$/, '')}/`,
			error: null,
		};
	}
	if (folderHint) {
		return {
			sourceKind,
			sourceValue,
			resolvedPath: null,
			error: `Folder not found in this vault: ${relativePath.replace(/\/$/, '')}/`,
		};
	}
	return resolveExactVaultFile(relativePath, sourceKind, sourceValue, context);
}

function resolveObsidianUri(value: string, context: RuleResolverContext): RuleResolution {
	const failure = (error: string): RuleResolution => ({
		sourceKind: 'obsidian-uri',
		sourceValue: value,
		resolvedPath: null,
		error,
	});
	if (containsMalformedPercentEncoding(value)) {
		return failure('Obsidian URL contains malformed percent encoding.');
	}
	const queryIndex = value.indexOf('?');
	const action = queryIndex === -1 ? value : value.slice(0, queryIndex);
	if (action.toLowerCase() !== 'obsidian://open') {
		return failure('Only obsidian://open URLs are supported.');
	}
	if (queryIndex === -1) {
		return failure('Obsidian URL does not contain query parameters.');
	}
	const searchParams = new URLSearchParams(value.slice(queryIndex + 1));
	const absolutePath = searchParams.get('path');
	if (absolutePath !== null) {
		if (!isAbsolutePath(absolutePath)) {
			return failure('The URL path parameter must contain an absolute system path.');
		}
		return resolveAbsolutePath(absolutePath, context, 'obsidian-uri', value);
	}
	const vault = searchParams.get('vault');
	if (!vault || vault !== context.vaultName) {
		return failure('Obsidian URL must reference the current vault by name.');
	}
	const file = searchParams.get('file');
	if (!file) {
		return failure('Obsidian URL does not contain a file parameter.');
	}
	return resolveExactVaultFile(file, 'obsidian-uri', value, context);
}

export function createRuleResolverContext(vault: Vault): RuleResolverContext {
	return {
		vaultName: vault.getName(),
		vaultBasePath: vault.adapter instanceof FileSystemAdapter ? vault.adapter.getBasePath() : null,
		isMarkdownFile: (path) => vault.getFileByPath(path) instanceof TFile,
		isFolder: (path) => vault.getAbstractFileByPath(path) instanceof TFolder,
	};
}

export function resolveRuleSource(valueInput: string, context: RuleResolverContext): RuleResolution {
	const value = valueInput.trim();
	if (!value) {
		return { sourceKind: 'vault-path', sourceValue: '', resolvedPath: null, error: 'Enter a rule value.' };
	}
	if (value.toLowerCase().startsWith('obsidian://')) {
		return resolveObsidianUri(value, context);
	}
	if (isAbsolutePath(value)) {
		return resolveAbsolutePath(value, context);
	}
	const normalized = normalizeVaultPath(value);
	return { sourceKind: 'vault-path', sourceValue: normalized, resolvedPath: normalized, error: null };
}

export function resolutionToRuleEntry(resolution: RuleResolution, enabled: boolean): RuleEntry {
	const sourceValue = resolution.sourceKind === 'absolute-path' && resolution.resolvedPath
		? resolution.resolvedPath
		: resolution.sourceValue;
	return {
		sourceKind: resolution.sourceKind,
		sourceValue,
		resolvedPath: resolution.resolvedPath,
		enabled,
	};
}
