# Contributing

Thanks for considering a contribution! This repository is an Obsidian community plugin built with TypeScript + esbuild and targets both desktop and mobile.

## Quick start (local dev)

### Prerequisites
- Node.js 18+
- npm
- Obsidian (desktop recommended for development)

### Install
```bash
npm install
````

### Common commands

Prefer `just` if available:

```bash
just install
just dev
just build
just test
just lint
just check
```

Equivalent npm scripts also exist:

```bash
npm run dev
npm run build
npm test
npm run lint
```

## Documentation website

The public VitePress site lives in `docs-site/`; `docs/` remains internal project documentation and the source of shared screenshots. Use Node.js 22.18+ (Node 22 is also used in CI) and the root npm lockfile:

```bash
npm ci
npm run docs:dev
npm run docs:build
npm run docs:preview
```

Open the URL printed by VitePress, including `/Read-Only-View/`. The build checks Markdown links and writes `docs-site/.vitepress/dist/`. Preview that production build to check images and navigation under the repository base path. VitePress configuration and theme files are separate from the Obsidian runtime lint configuration; validate them with the site build.

Reuse images from `docs/images/` with relative Markdown image links; Vite includes them in the site's output without maintaining duplicate source copies. Give each page a unique frontmatter title and description. Canonical URLs and Open Graph tags are generated from page metadata; the homepage also includes factual SoftwareApplication JSON-LD. There is no standalone favicon asset in the current repository, so the site does not invent one.

`.github/workflows/pages.yml` builds pull requests and deploys pushes to `master` through the official Pages artifact/deploy actions. In GitHub **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. Merge the site changes into `master` (or run **Documentation website** manually on `master`). The resulting URL is <https://mrkazzila.github.io/Read-Only-View/>. Existing plugin CI and release workflows are independent.

The site emits `sitemap.xml` and `robots.txt`. Because this is a project site, its robots file lives at `/Read-Only-View/robots.txt`; crawlers only use robots directives at the origin root. If you maintain `mrkazzila.github.io`, add the sitemap URL to its root robots file, or submit the sitemap directly in your search-engine webmaster tools.

## Development workflow

### 1) Run in Obsidian

This plugin can be loaded from a vault folder.

**Option A: Manual (simple)**

1. Build once:

   ```bash
   npm run build
   ```
2. Copy the plugin folder into your vault:

   * `<Vault>/.obsidian/plugins/read-only-view/`
   * required files: `main.js`, `manifest.json`
   * optional: `styles.css`

**Option B: Local dev install (recommended)**
Use the repo-supported `just` workflow so rebuilds land in place while the vault gets a dev-marked manifest copy:

```bash
just link-plugin
```

This workflow:

* symlinks `main.js`
* symlinks `styles.css` when present
* generates a vault-local `manifest.json` marked as a DEV build, leaving the repo release manifest unchanged

You can override the dev manifest version if needed:

```bash
DEV_PLUGIN_VERSION=999.1.0 just link-plugin
```

Then run watch mode:

```bash
npm run dev
```

Restart Obsidian or reload plugins when needed.

To remove the local dev install later:

```bash
just unlink-plugin
```

Dev and release builds share the same plugin ID `read-only-view`, so they cannot coexist in one vault. After unlinking, reinstall the release build from Obsidian Community Plugins if needed.

### 2) Make changes

Repository layout (high level):

* `src/main.ts` — plugin lifecycle, enforcement orchestration, settings tab UI
* `src/matcher.ts` — path normalization and matching logic
* `tests/` — unit tests
* `main.js` and `build-tests/` — generated outputs (do not hand-edit)

### 3) Validate before opening a PR

Run at minimum:

```bash
just lint
just test
just build
```

If you can’t run something, say exactly what you didn’t run and why in the PR description.

## Guidelines

### Scope & behavior changes

* Keep runtime dependencies minimal. Avoid heavy matching libraries.
* Don’t change behavior silently.
* If behavior changes, update documentation:

  * `README.md` (user-facing behavior)
  * `docs/PROJECT_STATE.md` (internal system map)
* Keep command IDs stable unless there is an explicit migration plan.
* Preserve mobile compatibility; avoid Node/Electron-only runtime APIs.

### Coding style

* Follow the existing code style and patterns in the repo.
* Prefer small, focused changes.
* Add/adjust unit tests for matcher logic and enforcement flow when behavior changes.

### Tests

Tests include:

* Matcher correctness and edge cases (wildcards, long paths, normalization)
* Orchestration/enforcement flow tests (where applicable)

When adding new matching semantics or path normalization rules:

* Add both a “typical case” and at least one “tricky edge case” test.

## Reporting bugs / requesting features

### Bug reports should include

* Obsidian version + platform (desktop/mobile, OS)
* Plugin version
* A minimal rule set (include/exclude) that reproduces the issue
* A sample `file.path` string that fails
* Whether `Use glob patterns` and `Case sensitive` are enabled
* Any relevant console logs (avoid sharing full paths unless necessary)

### Feature requests

Please describe:

* The user story (what you’re trying to accomplish)
* How you expect it to behave on mobile
* Any compatibility concerns

## Security / privacy

This plugin is intended to evaluate rules locally and does not require network access for normal operation. If a proposed change introduces network requests or telemetry, it must be discussed explicitly and documented.

## License

By contributing, you agree that your contributions will be licensed under the repository’s license (see `LICENSE`).
