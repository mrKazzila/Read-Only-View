# Read Only View

[![CI](https://github.com/mrKazzila/Read-Only-View/actions/workflows/ci.yml/badge.svg)](https://github.com/mrKazzila/Read-Only-View/actions/workflows/ci.yml)
[![Release Obsidian plugin](https://github.com/mrKazzila/Read-Only-View/actions/workflows/release.yml/badge.svg?event=push)](https://github.com/mrKazzila/Read-Only-View/actions/workflows/release.yml)

Read Only View is an Obsidian community plugin that forces selected Markdown files to stay in Reading mode (preview). It works on both desktop and mobile (`isDesktopOnly: false`) using simple local rule matching with no extra runtime dependencies.

Privacy: No network requests, rules evaluated locally.

## Quick Start

1. Install the plugin (manual installation steps below).
2. In Obsidian, open **Settings → Community plugins** and enable **Read Only View**.
3. Open **Settings → Read Only View**.
4. Make sure `Enabled` is on, then add an include rule such as:
   - `project_a/**`
5. Open a matching `.md` note. It should stay in Reading mode (preview).

If it does not apply immediately, run command **Re-apply rules now** from the Command Palette.

## Installation

### Community Plugins

- Not in Community Store yet.

### Manual installation

1. Download or build plugin files.
2. Copy files into your vault:
   - `<Vault>/.obsidian/plugins/read-only-view/`
   - required files: `main.js`, `manifest.json`
   - optional: `styles.css`
3. Restart Obsidian (or reload plugins), then enable **Read Only View** in **Settings → Community plugins**.

## Usage

### Settings overview

In **Settings → Read Only View**, configure:

- `Enabled`
- `Use glob patterns`
- `Case sensitive`
- `Debug logging`
- `Include rules`
- `Exclude rules`

While editing rules, the plugin autosaves with debounce (~400 ms) and shows status text: `Saving...`, `Saved.`, `Save failed.`  
If you need explicit confirmation, wait for `Saved.` before closing settings.

![DEMO](/docs/images/read-only-view-obsidian-plugin-demo.gif)

### Rule examples

Common scenarios:

1. Protect one project folder, but exclude archive subfolder:

```text
Include:
project_a/**
**/README.md

Exclude:
project_a/archive/**
```

2. Protect all README notes across the vault:

```text
Include:
**/README.md

Exclude:
```

3. Protect one specific note:

```text
Include:
notes/policies/security.md

Exclude:
```

4. Prefix mode folder rule (`Use glob patterns` off):

```text
Include:
projects/

Exclude:
projects/drafts/
```

### Path tester

Use **Path tester** to validate behavior before relying on a rule set. It shows:

- matched include rules
- matched exclude rules
- final `READ-ONLY ON/OFF`

![DEMO2](/docs/images/read-only-view-obsidian-plugin-demo4.gif)

![DEMO3](/docs/images/read-only-view-obsidian-plugin-demo3.png)

![DEMO4](/docs/images/read-only-view-obsidian-plugin-demo2.gif)

### Commands

Use the Command Palette:

- `Enable read-only mode`
- `Disable read-only mode`
- `Toggle plugin enabled`
- `Re-apply rules now`

`Enable read-only mode` is available only when the plugin is disabled.  
`Disable read-only mode` is available only when the plugin is enabled.

## Features

- Core enforcement:
  - Force matched `.md` files into Reading mode (preview).
  - Prevent switching matched files to Source mode or Live Preview.
- Matching:
  - Include and exclude rule lists (`exclude` has priority when both match).
  - Two modes:
    - Glob mode (`*`, `**`, `?`)
    - Literal prefix mode (compatibility mode)
  - Path normalization for reliable matching:
    - trims spaces
    - converts `\\` to `/`
    - removes leading `./`
    - collapses duplicate `/`
- Settings UX:
  - Rule diagnostics:
    - `✅` valid rule
    - `⚠️` suspicious/non-effective rule
    - warnings shown inline under each rule (no hover required)
    - diagnostics area uses local scroll with capped height on small screens
  - Rules editor save behavior:
    - saves on typing with debounce (~400 ms)
    - flushes pending save on `blur` / `change`
    - shows text status (`Saving...`, `Saved.`, `Save failed.`)
  - Built-in path tester:
    - matched include rules
    - matched exclude rules
    - final `READ-ONLY ON/OFF`
    - long values wrap safely on narrow/mobile layouts
- Commands:
  - `Enable read-only mode`
  - `Disable read-only mode`
  - `Toggle plugin enabled`
  - `Re-apply rules now`
  - `Enable read-only mode` is available only when the plugin is disabled; `Disable read-only mode` is available only when enabled
- Debug:
  - Debug logging via `console.debug` (optional)
  - file paths are redacted by default
  - enable `Debug: verbose paths` to include full file paths

## Limitations / Non-goals

- This plugin does not change OS-level file permissions and is not an OS-level read-only lock.
- It only affects Obsidian view mode behavior for Markdown (`.md`) files.
- It does not protect non-Markdown files.
- It is not a security boundary against external tools or other editors.
- Rule enforcement is app-level behavior inside Obsidian (re-applied on relevant workspace/UI events).

## Troubleshooting

- File is not forced to Reading mode (preview):
  - Check that plugin `Enabled` is on.
  - Confirm the file extension is `.md` (non-Markdown files are ignored).
  - Verify at least one include rule matches the file path.
  - Verify no exclude rule matches the same file path (exclude wins).
- Rule looks correct but still does not match:
  - Use the built-in **Path tester** with the exact `file.path`.
  - Check `Case sensitive` setting.
  - In prefix mode (`Use glob patterns` off), `*` and `?` are treated literally.
- Rule matches too broadly in prefix mode:
  - If you intended a folder, keep a trailing `/` in the rule.
  - Remember: prefix mode uses `startsWith`.
- Changes in rules do not appear immediately:
  - Run command **Re-apply rules now**.
  - Switch tabs or reopen the note to trigger workspace events.

<details>
<summary>Advanced troubleshooting</summary>

- Check normalized path form (`\` vs `/`, leading `./`, duplicate `/`) in diagnostics.
- Empty diagnostics lines are shown as `(empty line)` and are not converted to `/`.
- Warning details are rendered inline (touch-friendly), not only in hover tooltips.
- Enable `Debug logging` and inspect DevTools console output (`[read-only-view]` prefix).
- Keep `Debug: verbose paths` disabled unless full-path diagnostics are required.
- Fallback failures include error type/message in debug logs (`ensure-preview-fallback`).

</details>

## Compatibility

Manual cross-platform/version compatibility checks are tracked in:

- `docs/compatibility-matrix.md`

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
- includes `main.ts` orchestration tests for enforcement flow, observer wiring, command visibility rules, and debug-path redaction behavior

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
just clean
```

At minimum before finishing changes, run:

1. `just lint`
2. `just test`
3. `just build`

## Contributing

1. Create a branch for your change.
2. Run checks locally (`just check` recommended; minimum is lint + test + build).
3. Open a pull request with a clear behavior summary and test notes.
4. If behavior changes, update both `README.md` and `docs/PROJECT_STATE.md`.

## License

See `LICENSE`.

## Releases

See repository [Releases](../../releases).

## Deep Dive

<details>
<summary>How enforcement works</summary>

1. On workspace events (`file-open`, `active-leaf-change`, `layout-change`), the plugin coalesces bursts into one re-apply pass (150 ms window) before scanning open Markdown leaves.
2. For each Markdown file, it evaluates `shouldForceReadOnly(file.path, settings)`.
3. If the file should be protected, the plugin forces the leaf view mode to `preview`.
4. If a user or UI action tries to switch back to edit mode, the plugin re-applies preview mode.
5. A mutation observer watches popover containers (`.hover-popover`, `.popover`) and re-applies protection only when an editor node appears there.

</details>

<details>
<summary>Matching details and semantics</summary>

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

</details>
