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

**Option B: Symlink (recommended)**
Symlink the repository into your vault plugin folder so rebuilds land in place:

```bash
ln -s /absolute/path/to/read-only-view <Vault>/.obsidian/plugins/read-only-view
```

Then run watch mode:

```bash
npm run dev
```

Restart Obsidian or reload plugins when needed.

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
