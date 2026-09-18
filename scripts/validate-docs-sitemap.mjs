import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('docs-site/.vitepress/dist');
const sitemapPath = path.join(distDir, 'sitemap.xml');
const robotsPath = path.join(distDir, 'robots.txt');
const siteUrl = 'https://mrkazzila.github.io/Read-Only-View/';
const duplicatedBase = '/Read-Only-View/Read-Only-View/';
const sitemapNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function validateXmlStructure(xml) {
	const tags = xml.match(/<[^>]+>/g) ?? [];
	assert(tags.length > 0, 'sitemap.xml does not contain XML tags');

	const stack = [];
	let offset = 0;
	for (const tag of tags) {
		const index = xml.indexOf(tag, offset);
		assert(!xml.slice(offset, index).includes('<'), 'sitemap.xml contains a malformed tag');
		offset = index + tag.length;

		if (/^<\?xml\s/.test(tag) || /^<!--/.test(tag)) continue;
		const close = tag.match(/^<\/([\w:.-]+)\s*>$/);
		if (close) {
			assert(stack.pop() === close[1], `sitemap.xml has an unmatched closing tag: ${tag}`);
			continue;
		}

		const open = tag.match(/^<([\w:.-]+)(?:\s[^<>]*)?\/?\s*>$/);
		assert(open, `sitemap.xml has a malformed tag: ${tag}`);
		if (!/\/\s*>$/.test(tag)) stack.push(open[1]);
	}

	assert(!xml.slice(offset).includes('<'), 'sitemap.xml contains a malformed trailing tag');
	assert(stack.length === 0, `sitemap.xml has an unclosed tag: ${stack.at(-1)}`);
}

async function listHtmlFiles(directory, prefix = '') {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.name === 'assets') continue;
		const relativePath = path.posix.join(prefix, entry.name);
		if (entry.isDirectory()) files.push(...await listHtmlFiles(path.join(directory, entry.name), relativePath));
		else if (entry.name.endsWith('.html') && relativePath !== '404.html') files.push(relativePath);
	}
	return files;
}

async function listSourcePages(directory, prefix = '') {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.name.startsWith('.') || entry.name === 'public') continue;
		const relativePath = path.posix.join(prefix, entry.name);
		if (entry.isDirectory()) files.push(...await listSourcePages(path.join(directory, entry.name), relativePath));
		else if (entry.name.endsWith('.md')) {
			files.push(relativePath === 'index.md' ? 'index.html' : relativePath.replace(/\.md$/, '.html'));
		}
	}
	return files;
}

const xml = await readFile(sitemapPath, 'utf8');
validateXmlStructure(xml);
assert(
	new RegExp(`<urlset\\s+[^>]*xmlns=["']${sitemapNamespace.replaceAll('.', '\\.')}["']`).test(xml),
	`Sitemap must use the ${sitemapNamespace} namespace`,
);

const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert(locations.length > 0, 'sitemap.xml must contain at least one URL');

const sitemapFiles = new Set();
const generatedHtml = new Set(await listHtmlFiles(distDir));
for (const location of locations) {
	assert(location.startsWith(siteUrl), `Sitemap URL is outside the site property: ${location}`);
	assert(!location.includes(duplicatedBase), `Sitemap URL contains a duplicated base: ${location}`);
	assert(!location.includes('localhost'), `Sitemap URL contains localhost: ${location}`);

	const url = new URL(location);
	assert(url.protocol === 'https:', `Sitemap URL is not HTTPS: ${location}`);
	assert(!url.pathname.slice(1).includes('//'), `Sitemap URL contains a double slash: ${location}`);

	const relativeUrl = location.slice(siteUrl.length);
	const outputFile = relativeUrl === '' ? 'index.html' : `${relativeUrl}.html`;
	assert(generatedHtml.has(outputFile), `Sitemap URL has no generated HTML file: ${location}`);
	sitemapFiles.add(outputFile);
}

const sourcePages = new Set(await listSourcePages(path.resolve('docs-site')));
assert(
	sourcePages.size === sitemapFiles.size
		&& [...sourcePages].every((file) => sitemapFiles.has(file)),
	`Sitemap pages do not match documentation sources. Sources: ${[...sourcePages].join(', ')}; sitemap: ${[...sitemapFiles].join(', ')}`,
);

const robots = await readFile(robotsPath, 'utf8');
assert(robots.includes(`Sitemap: ${siteUrl}sitemap.xml`), 'robots.txt does not reference the public sitemap URL');

console.log(`Validated sitemap.xml: ${locations.length} URLs match ${sourcePages.size} generated documentation pages.`);
console.log('Validated robots.txt: public sitemap URL is present.');
