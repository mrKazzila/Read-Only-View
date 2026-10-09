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
```

### Common commands

Prefer `just` if available:

```bash
just install
just dev
just build
just test
just lint
just lint-obsidian
just check
```

Equivalent npm scripts also exist:

```bash
npm run dev
npm run build
npm test
npm run lint
npm run lint:obsidian
```

`just lint-obsidian` runs a dedicated Obsidian Community Plugin preflight to catch review issues before release. It uses the existing pinned `eslint-plugin-obsidianmd` dependency and its recommended configuration, with the [official scanner exceptions](https://github.com/obsidianmd/eslint-plugin/blob/master/docs/configuration.md#community-plugin-scanner-configuration) and exclusions adapted to this repository. The five `no-unsafe-*` checks for assignment, argument, call, member access, and return remain errors. Generated output, the demo vault, tests (including mocks), scripts, documentation, agent tooling, and build/config files are excluded; there are currently no localization directories to exclude.

The preflight first runs `npm run typecheck:runtime`: `tsconfig.runtime.json` inherits the plugin's target and libraries and sets `types: []`, preventing automatically loaded development `@types` packages from masking unsupported APIs. Explicitly imported module types remain available. Tests retain their separate Node type configuration.

Inline ESLint configuration, including `eslint-disable` comments, is forbidden in the preflight scope. `noInlineConfig` makes directives ineffective and reports warnings; `--max-warnings 0` makes those warnings fail the check even when the underlying code is valid. Fix the source instead of suppressing review rules.

Normal `just lint` keeps its existing rules and scope. The preflight retains recommended severities instead of the scanner's general downgrade to warnings, and fails on warnings as well as errors. It is included in `just check` and runs as a separate **Obsidian Community preflight** step in CI and before release publishing. This approximates the scanner; it does not replace manual review or guarantee acceptance.

## Documentation website

Website builds also require Python 3.11+ for offline analytics; see [Star History maintenance](#star-history-maintenance).

The public VitePress site lives in `docs-site/`; `docs/` remains internal project documentation and the source of shared screenshots. Use Node.js 22.18+ (Node 22 is also used in CI) and the root npm lockfile:

```bash
npm ci
npm run docs:dev
npm run docs:build
npm run docs:preview
```

With `just`, run `just docs-dev` from the repository root to start the local site (equivalent to `npm run docs:dev`). It generates offline analytics before starting VitePress. Stop the server with `Ctrl+C`.

The root `package.json` overrides VitePress's Vite dependency to `^6.4.3`: VitePress 1.6.4 otherwise requires the vulnerable Vite 5 line and its older esbuild. The nested Vite override also uses `$esbuild` to reuse the root esbuild pin (currently 0.28.1), meeting the minimum fixed version reported by Dependabot. These overrides cross the declared Vite and esbuild version ranges, so validate `docs:dev`, `docs:build`, and `docs:preview` when updating these dependencies. The website explicitly targets Safari 14.1+ (instead of Vite 6's Safari 14 default) because esbuild 0.28 cannot lower destructuring for that older target; the other Vite 6 browser targets are retained. This affects the website only, not the Obsidian plugin runtime. Remove the overrides when a stable VitePress release natively uses a patched Vite version.

Open the URL printed by VitePress, including `/Read-Only-View/`. The build checks Markdown links and writes `docs-site/.vitepress/dist/`. Preview that production build to check images and navigation under the repository base path. VitePress configuration and theme files are separate from the Obsidian runtime lint configuration; validate them with the site build.

Use images from `docs/images/documentation/` for both the repository README and the docs site, with explicit Vue image imports in site Markdown (see `docs-site/index.md`). Vite includes them in the site output. `docs/images/community-images/` is reserved for the Obsidian Community plugin page; do not embed those files or raw sources in repository documentation. Follow [image storage and preparation rules](docs/images/README.md) when adding or replacing assets. Give each page a unique frontmatter title and description. Canonical URLs and Open Graph tags are generated from page metadata; the homepage also includes factual SoftwareApplication JSON-LD. The book-and-lock favicon is maintained as SVG in `docs-site/public/favicon.svg`; its head link includes the repository base path.

`.github/workflows/pages.yml` builds pull requests and deploys pushes to `master` through the official Pages artifact/deploy actions. In GitHub **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. Merge the site changes into `master` (or run **Documentation website** manually on `master`). The resulting URL is <https://mrkazzila.github.io/Read-Only-View/>. Existing plugin CI and release workflows are independent.

The site emits `sitemap.xml` and `robots.txt`. Because this is a project site, its robots file lives at `/Read-Only-View/robots.txt`; crawlers only use robots directives at the origin root. If you maintain `mrkazzila.github.io`, add the sitemap URL to its root robots file, or submit the sitemap directly in your search-engine webmaster tools.

## Star History maintenance

The [Star History dashboard](https://mrkazzila.github.io/Read-Only-View/star-history) displays aggregate data from GitHub's official [Star History and Count REST endpoints](https://docs.github.com/en/rest/activity/starring). No stargazer identities, profiles, avatars or visitor analytics are collected. This tooling runs outside the Obsidian plugin.

Committed data lives in `docs-site/public/data/star-history.json`. It contains two separate daily series:

- `reconstructed`: cumulative daily counts from all available API weeks, **not verified historical total snapshots**. GitHub can revise this history. API day boundaries may differ from UTC; dates use the UTC week timestamp plus the day index. The first week can include dates before repository creation, and the current day is incomplete.
- `snapshots`: actual total stars at collection time, one observation per UTC date. A same-day rerun replaces that day's observation; missing dates remain missing. Totals may decrease. `delta` compares adjacent available observations, which can span multiple days; the first delta is `null`.

Python 3.11+ is required for these scripts and website builds. The collector uses only the standard library:

```bash
# Initial historical import, or a subsequent daily update
python3 scripts/update_star_history.py
# Development tools, tests and formatting checks
uv sync --locked --group dev
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

Use the build and preview commands in [Documentation website](#documentation-website), then open `/Read-Only-View/star-history` on the preview server. `npm run docs:dev` and `docs:build` generate dashboard input offline from the saved JSON using `scripts/build_star_analytics.py`; rerun after editing data/events. Generated analytics are ignored by git. The browser never queries GitHub.

Public API requests need no token. Optionally provide `GITHUB_TOKEN` through your environment; never commit it. The collector retrieves up to 100 pages of 30 weeks each and fails rather than save a potentially truncated import. HTTP/rate-limit, network or validation failures return a nonzero exit status and preserve the previous file. Retry after resolving the error or rate limit. Writes use an atomic replace; an identical result preserves the file and `updated_at`.

The **Update star history** workflow runs daily at **03:17 UTC** (06:17 Minsk time), subject to GitHub scheduling delays, and supports manual dispatch on `master`. It uses `contents: write` only in its update job and the automatic `GITHUB_TOKEN` to commit changed history as `chore: update star history`. No PAT or additional secret is required. Repository rules must permit the bot to push to `master`; a rejected push fails without bypassing protections. A successful run triggers the existing Pages workflow through `workflow_run`, because token-authenticated pushes do not trigger ordinary push workflows. Forks do not collect or publish through this trigger.

### Adding project events

Edit `docs-site/public/data/events.json`, initially an empty array. Each entry requires `date` (`YYYY-MM-DD`), `type` and a nonempty `title`. Supported types: `release`, `forum`, `youtube`, `documentation`, `other`. The adjacent `events.schema.json` documents the format; the offline build validates it with equivalent standard-library checks. Add only verified public project events, with no personal information. Events are not discovered automatically.

This is a **fictional format example**, not an actual project event:

```json
[
  { "date": "2026-01-15", "type": "other", "title": "Fictional example milestone" }
]
```

### Analytics limitations

Current stars and the 7/30-day net-change cards use only observed total snapshots. Windows end on the latest snapshot, whose date is displayed; both exact boundary dates must exist. Otherwise the result is **Insufficient data**, not zero. Intermediate missing dates do not prevent a net difference between known endpoints, but are not interpolated. Average daily growth divides the first-to-last net difference by elapsed calendar days. Best growth day considers only consecutive dates; ties select the earliest. A single snapshot cannot establish growth.

An event's three-day window covers the preceding day, the event day and the following day. Its observed change compares snapshots at event date −2 and +1, requiring both. No removed-star history, end-of-day totals or historical net growth is inferred from the reconstructed API series.

**Star growth around an event is an observational metric and does not establish that the event caused the change.**

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
Build and prepare the synthetic desktop vault with `just demo 1.1.3.11`. To recreate it from scratch, use `just demo-reset 1.1.3.11`. These shared commands require no local configuration.

For mobile testing, configure the ignored `just/local.just` using `just/local.example.just` and the [mobile setup instructions](docs/DEMO_VAULT.md#machine-local-mobile-commands). Then use `just demo-mobile 1.1.3.11` or `just demo-all 1.1.3.11` to install one build on desktop and mobile. Keep personal paths only in local configuration.

To attach an already-built plugin to an existing vault, use the repo-supported `just` workflow so rebuilds land in place while the vault gets a dev-marked manifest copy:

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

For enforcement internals, settings UI behavior, and the system map, see [PROJECT_STATE.md](docs/PROJECT_STATE.md).

Repository layout (high level):

* `src/main.ts` — plugin lifecycle, enforcement orchestration, settings tab UI
* `src/matcher.ts` — path normalization and matching logic
* `tests/` — unit tests
* `main.js` and `build-tests/` — generated outputs (do not hand-edit)

### 3) Validate before opening a PR

Run at minimum:

```bash
just lint
just lint-obsidian
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
