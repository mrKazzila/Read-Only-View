# Read Only View

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
- Built-in path tester in settings:
  - matched include rules
  - matched exclude rules
  - final `READ-ONLY ON/OFF`
- Commands:
  - `Toggle plugin enabled`
  - `Re-apply rules now`
- Debug logging via `console.debug` (optional).

## How It Works

1. On workspace events (`file-open`, `active-leaf-change`, `layout-change`), the plugin scans open Markdown leaves.
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
5. Use **Path tester** to validate rules before relying on them.

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
- Rule matches too broadly in prefix mode:
  - If you intended a folder, keep a trailing `/` in the rule.
  - Remember: prefix mode uses `startsWith`.
- Changes in rules do not appear immediately:
  - Run command **Re-apply rules now**.
  - Switch tabs or reopen the note to trigger workspace events.
- Need deeper investigation:
  - Enable `Debug logging` and inspect DevTools console output (`[read-only-view]` prefix).
