import { access, readFile, readdir } from 'node:fs/promises';
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
assert(new Set(locations).size === locations.length, 'sitemap.xml contains duplicate URLs');

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
assert(!/^Disallow:\s*\S+/im.test(robots), 'Project robots.txt must not block documentation');

// Read the controlled VitePress HTML output, excluding script/style bodies.
function decodeHtml(value) {
	return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
		if (entity.startsWith('#')) return String.fromCodePoint(entity[1].toLowerCase() === 'x'
			? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
		return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[entity.toLowerCase()];
	});
}

function tags(html, name) {
	return [...html.matchAll(new RegExp(`<${name}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, 'gi'))].map((match) =>
		Object.fromEntries([...match[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
			.map((attribute) => [attribute[1].toLowerCase(), decodeHtml(attribute[2] ?? attribute[3])])));
}

const pages = new Map();
const titles = new Set();
const descriptions = new Set();
for (const location of locations) {
	const relative = location.slice(siteUrl.length);
	const file = relative ? `${relative}.html` : 'index.html';
	const html = (await readFile(path.join(distDir, file), 'utf8'))
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
	const metadata = tags(html, 'meta');
	const meta = (key) => {
		const matches = metadata.filter((item) => (item.name ?? item.property) === key);
		assert(matches.length === 1 && matches[0].content?.trim(), `${file}: expected one nonempty ${key}`);
		return matches[0].content;
	};
	const pageTitles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)];
	assert(pageTitles.length === 1, `${file}: expected exactly one title`);
	const title = decodeHtml(pageTitles[0][1]).trim();
	const description = meta('description');
	assert(title && !titles.has(title), `${file}: missing or duplicate title: ${title}`);
	assert(!descriptions.has(description), `${file}: duplicate description: ${description}`);
	titles.add(title);
	descriptions.add(description);
	assert(tags(html, 'h1').length === 1, `${file}: expected exactly one H1`);
	assert(!metadata.some((item) => /robots|googlebot|bingbot/i.test(item.name ?? '')
		&& /noindex|nofollow|none/i.test(item.content ?? '')), `${file}: unintended indexing restriction`);
	const canonicals = tags(html, 'link').filter((item) => item.rel === 'canonical');
	assert(canonicals.length === 1 && canonicals[0].href === location, `${file}: canonical differs from sitemap URL`);
	assert(meta('og:url') === location, `${file}: og:url differs from canonical`);
	assert(meta('og:description') === description && meta('twitter:description') === description,
		`${file}: social descriptions differ from page description`);
	assert(meta('og:title') === meta('twitter:title'), `${file}: social titles differ`);
	assert(meta('twitter:card') === 'summary_large_image', `${file}: missing social card`);
	const preview = meta('og:image');
	assert(preview === meta('twitter:image') && preview.startsWith(siteUrl), `${file}: invalid social image URL`);
	meta('og:image:alt');
	meta('twitter:image:alt');
	for (const img of tags(html, 'img')) assert(img.alt?.trim(), `${file}: image has no descriptive alt text`);
	pages.set(location, {
		ids: new Set(tags(html, '[a-z][\\w:-]*').map((tag) => tag.id).filter(Boolean)),
		links: tags(html, 'a').map((tag) => tag.href).filter(Boolean),
		assets: [...tags(html, 'img').map((tag) => tag.src).filter(Boolean), preview],
	});
}

const site = new URL(siteUrl);
const graph = new Map();
let linkCount = 0;
for (const [location, page] of pages) {
	const linkedPages = new Set();
	for (const reference of [...page.links, ...page.assets]) {
		const target = new URL(reference, location);
		if (target.origin !== site.origin) continue;
		assert(target.pathname.startsWith(site.pathname), `${location}: local link escapes site base: ${reference}`);
		const canonical = `${target.origin}${target.pathname}`;
		const targetPage = pages.get(canonical);
		if (targetPage) {
			if (target.hash) assert(targetPage.ids.has(decodeURIComponent(target.hash.slice(1))),
				`${location}: missing fragment: ${reference}`);
			linkedPages.add(canonical);
		} else {
			const relative = decodeURIComponent(target.pathname.slice(site.pathname.length));
			assert(!relative.endsWith('.html'), `${location}: link uses noncanonical .html route: ${reference}`);
			await access(path.join(distDir, relative));
		}
		linkCount++;
	}
	graph.set(location, linkedPages);
}

const reachable = new Set();
const pending = [siteUrl];
while (pending.length) {
	const url = pending.pop();
	if (reachable.has(url)) continue;
	reachable.add(url);
	pending.push(...graph.get(url));
}
assert(reachable.size === pages.size, 'Some sitemap pages are not reachable from homepage links/navigation');

console.log(`Validated sitemap.xml: ${locations.length} URLs match ${sourcePages.size} generated documentation pages.`);
console.log('Validated robots.txt: public sitemap URL is present.');
console.log(`Validated ${pages.size} pages: unique metadata, canonicals, social previews, H1s, image alt text, and navigation reachability.`);
console.log(`Validated ${linkCount} local links/assets, including fragment targets.`);
