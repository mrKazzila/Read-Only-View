# Read Only View

[![CI](https://github.com/mrKazzila/Read-Only-View/actions/workflows/ci.yml/badge.svg)](https://github.com/mrKazzila/Read-Only-View/actions/workflows/ci.yml)
[![Release Obsidian plugin](https://github.com/mrKazzila/Read-Only-View/actions/workflows/release.yml/badge.svg)](https://github.com/mrKazzila/Read-Only-View/actions/workflows/release.yml)

Read Only View is an Obsidian community plugin that forces selected Markdown files to stay in reading mode (preview).

The plugin is designed for both desktop and mobile (`isDesktopOnly: false`) and uses simple, local rule matching with no extra runtime dependencies.

## Features

- Force matched `.md` files into preview mode.
- Prevent switching matched files to Source mode or Live Preview.
- Include and exclude rule lists (`exclude` has priority when both match).
- Two matching modes:
  - Glob mode (`*`, `**`, `?`)
  - Literal prefix mode (compatibility mode)
- Path normalization for reliable matching:
  - trims spaces
  - converts `\\` to `/`
  - removes leading `./`
  - collapses duplicate `/`
- Rule diagnostics in settings:
  - `✅` valid rule
  - `⚠️` suspicious/non-effective rule
  - warnings are shown inline under each rule (no hover required)
  - diagnostics area uses local scroll with capped height on small screens
- Rules editor save behavior:
  - saves on typing with debounce (~400 ms)
  - flushes pending save on `blur` / `change`
  - shows text status (`Saving...`, `Saved.`, `Save failed.`)
- Built-in path tester in settings:
  - matched include rules
  - matched exclude rules
  - final `READ-ONLY ON/OFF`
  - long values wrap safely on narrow/mobile layouts
- Commands:
  - `Enable read-only mode`
  - `Disable read-only mode`
  - `Toggle plugin enabled`
  - `Re-apply rules now`
- Debug logging via `console.debug` (optional).
  - file paths are redacted by default
  - enable `Debug: verbose paths` to include full file paths

## How It Works

1. On workspace events (`file-open`, `active-leaf-change`, `layout-change`), the plugin coalesces bursts into one re-apply pass (150 ms window) before scanning open Markdown leaves.
2. For each Markdown file, it evaluates `shouldForceReadOnly(file.path, settings)`.
3. If the file should be protected, the plugin forces the leaf view mode to `preview`.
4. If a user or UI action tries to switch back to edit mode, the plugin re-applies preview mode.

Matching rules:

- Only `.md` files are affected.
- If `enabled = false`, no enforcement is applied.
- Include must match first.
- Exclude then overrides include.

Glob semantics (`useGlobPatterns = true`):

- `*` matches within one path segment (`[^/]*`)
- `**` matches across segments (`.*`)
- `?` matches one non-`/` character (`[^/]`)
- compiled glob regexes are cached with a fixed FIFO cap (`512` entries) to prevent unbounded memory growth with many unique rules

Literal prefix mode (`useGlobPatterns = false`):

- Uses `normalizedFilePath.startsWith(normalizedPattern)`
- If rule has no `*`/`?`, does not end with `/`, and does not end with `.md`, the plugin appends `/` automatically (folder intent).

## How to Use

1. Install the plugin files into your vault:
   - `<Vault>/.obsidian/plugins/read-only-view/`
   - required files: `main.js`, `manifest.json`
   - optional: `styles.css`
2. Enable the plugin in **Settings → Community plugins**.
3. Open **Settings → Read Only View**.
4. Configure:
   - `Enabled`
   - `Use glob patterns`
   - `Case sensitive`
   - `Debug logging`
   - `Include rules`
   - `Exclude rules`
   - while editing rules, wait for `Saved.` status before closing settings if you need explicit confirmation
5. Use **Path tester** to validate rules before relying on them.
6. Quickly control enforcement from the Command Palette:
   - **Enable read-only mode**
   - **Disable read-only mode**

Example rules:

```text
Include:
project_a/**
**/README.md

Exclude:
project_a/archive/**
```

## Development

Requirements:

- Node.js 18+
- npm

Dependency policy:

- `obsidian` is pinned to an exact version in `package.json` (`1.10.3`) to keep local and CI builds reproducible.
- Update policy:
  - bump intentionally via `npm install obsidian@<version>`
  - run full validation (`just lint && just test && just build`)
  - smoke-check plugin loading in Obsidian desktop and mobile

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

Test suite note:

- includes matcher stress/perf checks for long path and wildcard workloads with conservative runtime budgets to catch obvious regressions without CI flakiness

Lint:

```bash
npm run lint
```

Watch mode:

```bash
npm run dev
```

Optional `just` shortcuts:

```bash
just install
just build
just test
just lint
just check
```

## Troubleshooting

- File is not forced to preview:
  - Check that plugin `Enabled` is on.
  - Confirm the file extension is `.md` (non-Markdown files are ignored).
  - Verify at least one include rule matches the file path.
  - Verify no exclude rule matches the same file path (exclude wins).
- Rule looks correct but still does not match:
  - Use the built-in **Path tester** with the exact `file.path`.
  - Check `Case sensitive` setting.
  - In prefix mode (`Use glob patterns` off), `*` and `?` are treated literally.
  - Check normalized path form (`\` vs `/`, leading `./`, duplicate `/`) in diagnostics.
  - Empty diagnostics lines are shown as `(empty line)` and are not converted to `/`.
  - Warning details are rendered inline (touch-friendly), not only in hover tooltips.
- Rule matches too broadly in prefix mode:
  - If you intended a folder, keep a trailing `/` in the rule.
  - Remember: prefix mode uses `startsWith`.
- Changes in rules do not appear immediately:
  - Run command **Re-apply rules now**.
  - Switch tabs or reopen the note to trigger workspace events.
- Need deeper investigation:
  - Enable `Debug logging` and inspect DevTools console output (`[read-only-view]` prefix).
  - Keep `Debug: verbose paths` disabled unless full-path diagnostics are required.
  - Fallback failures include error type/message in debug logs (`ensure-preview-fallback`).

## Compatibility Matrix

Manual cross-platform/version compatibility checks are tracked in:

- `docs/compatibility-matrix.md`
