import { defineConfig } from 'vitepress';

// esbuild 0.28 cannot lower destructuring for Vite 6's default Safari 14 target.
const browserTargets = ['es2020', 'chrome87', 'edge88', 'firefox78', 'safari14.1'];
const siteUrl = 'https://mrkazzila.github.io/Read-Only-View/';
const description = 'Keep selected Obsidian notes in Reading view and prevent accidental edits with local include and exclude path rules.';
const guides = [
	{ text: 'Keep all notes in Reading view', link: '/guides/make-all-notes-read-only' },
	{ text: 'Make a note read-only', link: '/guides/make-note-read-only' },
	{ text: 'Make a folder read-only', link: '/guides/make-folder-read-only' },
	{ text: 'Prevent accidental editing', link: '/guides/prevent-accidental-editing' },
	{ text: 'Reading view on mobile', link: '/guides/mobile-reading-view' },
];

export default defineConfig({
	title: 'Read Only View',
	description,
	lang: 'en-US',
	base: '/Read-Only-View/',
	cleanUrls: true,
	vite: {
		build: { target: browserTargets },
		optimizeDeps: { esbuildOptions: { target: browserTargets } },
	},
	sitemap: { hostname: siteUrl },
	themeConfig: {
		nav: [
			{ text: 'Guides', link: '/guides/make-note-read-only' },
			{ text: 'Path rules', link: '/docs/path-rules' },
			{ text: 'FAQ', link: '/faq' },
		],
		sidebar: [
			{ text: 'Guides', items: guides },
			{ text: 'Documentation', items: [
				{ text: 'Path rules', link: '/docs/path-rules' },
				{ text: 'Path tester', link: '/docs/path-tester' },
				{ text: 'Troubleshooting', link: '/docs/troubleshooting' },
				{ text: 'FAQ', link: '/faq' },
			] },
		],
		socialLinks: [{ icon: 'github', link: 'https://github.com/mrKazzila/Read-Only-View' }],
		footer: { message: 'Released under the 0BSD license.' },
	},
	transformHead({ pageData }) {
		if (pageData.relativePath === '404.md') return [['meta', { name: 'robots', content: 'noindex' }]];
		const path = pageData.relativePath.replace(/index\.md$/, '').replace(/\.md$/, '');
		const url = new URL(path, siteUrl).href;
		return [
			['link', { rel: 'canonical', href: url }],
			['meta', { property: 'og:type', content: 'website' }],
			['meta', { property: 'og:site_name', content: 'Read Only View' }],
			['meta', { property: 'og:title', content: pageData.title }],
			['meta', { property: 'og:description', content: pageData.description || description }],
			['meta', { property: 'og:url', content: url }],
			...(pageData.relativePath === 'index.md' ? [[
				'script', { type: 'application/ld+json' }, JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'SoftwareApplication',
					name: 'Read Only View',
					applicationCategory: 'ProductivityApplication',
					description,
					url: siteUrl,
					downloadUrl: 'https://community.obsidian.md/plugins/read-only-view',
					softwareRequirements: 'Obsidian 1.10.3 or newer',
					license: 'https://github.com/mrKazzila/Read-Only-View/blob/master/LICENSE',
				}),
			] as [string, Record<string, string>, string]] : []),
		];
	},
});
