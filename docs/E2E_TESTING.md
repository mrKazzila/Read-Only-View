# E2E testing

This repository includes a small, opt-in WebdriverIO smoke suite for desktop Obsidian.

## What it covers

- Launching desktop Obsidian against the repo-generated `demo-vault`
- Confirming the plugin is enabled in that synthetic vault
- Confirming a protected note under `Read Only/` returns to Reading view
- Confirming an excluded draft under `Read Only/Drafts/` can stay in source mode
- Confirming `Inbox/Quick capture.md`, imported from an Obsidian URL, is protected
- Resolving an Obsidian URL in Path tester and reporting its detected source and vault path
- Resolving a copied desktop system-folder path in Path tester
- Capping an over-limit Path tester value, exposing the error text, and setting `aria-invalid`
- Confirming `Inbox/Meeting recap.md`, imported from a desktop system path, is protected
- Confirming the ordinary `Inbox/Idea parking lot.md` note can stay in source mode
- Real Explorer indicators: opt-in through Settings, protected note/folder, excluded draft, native Vault rename into/out of an excluded folder, host-created replacement Explorer pane, feature disable and plugin-unload cleanup
- Optional Settings screenshots across light/dark themes, desktop/narrow widths and collapsed/expanded plugin disclosures

## What it does not cover

- Mobile behavior (a narrow desktop window does not emulate Obsidian mobile)
- Real detached/popout windows
- A complete traversal of the **Mode**, **Path rules**, and **Advanced** settings UI
- Welcome modal flows
- Every popover or hover-preview edge case
- Exhaustive editor interaction coverage

Mock multi-document tests exercise controller bookkeeping; they do not prove real popout or mobile host behavior. Those host checks remain manual.

## Safety model

- E2E uses only the synthetic repo-local `./demo-vault`.
- Obsidian launches with a dedicated `--user-data-dir` under `.tmp/obsidian-e2e-profile`; its vault registry contains only the repo-local fixture.
- The suite checks the adapter's full vault path before its tests and before destructive fixture operations. A matching vault name alone is insufficient.
- Personal vaults are never opened by the E2E scripts.
- The vault is recreated from `scripts/create_demo_vault.py`.
- The plugin files are linked or copied into the generated vault by the existing demo-vault flow.

The dedicated profile isolates recent-vault metadata. Do not remove the profile argument or run these tests against an already-open personal vault. The smoke renames one generated note and restores it in `finally`; recreating the fixture also resets interrupted runs.

## Prerequisites

- Node.js 22 and npm (Node 26 currently fails WebdriverIO session creation with `UND_ERR_INVALID_ARG`)
- Python 3
- Desktop Obsidian installed locally
- Repo dependencies installed with `npm install`

Build the plugin before E2E:

```bash
npm run build
```

You can also let the E2E script build for you.

## Obsidian binary path

The suite reads `OBSIDIAN_PATH`. Record the running Obsidian app version as well as
the Electron version: the isolated profile can download Obsidian app updates on
first launch. Warm it once, then use the same app version for both visual runs.

- On macOS, the default fallback is:
  `/Applications/Obsidian.app/Contents/MacOS/Obsidian`
- On other platforms, set `OBSIDIAN_PATH` explicitly.

Examples:

```bash
OBSIDIAN_PATH="/Applications/Obsidian.app/Contents/MacOS/Obsidian" npm run test:e2e
OBSIDIAN_PATH="/path/to/Obsidian.exe" npm run test:e2e
```

## Obsidian Electron version

The suite selects Chromedriver from the Electron version embedded in Obsidian,
not from the repository's `electron` development dependency. The tested default
is Electron `32.2.5`. Override it when testing an Obsidian build based on a
different Electron version:

```bash
OBSIDIAN_ELECTRON_VERSION="32.2.5" npm run test:e2e
```

If the value does not match the Electron runtime used by `OBSIDIAN_PATH`, session
creation fails with a ChromeDriver/browser version mismatch.

## Running the suite

Standard run (under Node 22):

```bash
npm run test:e2e
```

If your default Node is newer, a temporary Node 22 runner also works:

```bash
npx --yes --package=node@22 -c 'npm run test:e2e'
```

Debug-friendly run:

```bash
npm run test:e2e:debug
```

Each run does the following:

1. Builds the plugin bundle.
2. Recreates `./demo-vault` with `python3 scripts/create_demo_vault.py --force`.
3. Launches Obsidian against that generated vault.
4. Runs the WebdriverIO smoke tests.

If you want to inspect the fixture before running tests:

```bash
just demo-reset 1.1.3.2
```

## Artifacts and troubleshooting

- Failure screenshots are written under `.tmp/wdio-artifacts/`.
- If Obsidian does not launch into `demo-vault`, verify `OBSIDIAN_PATH`.
- If community plugins do not load, recreate the vault with `python3 scripts/create_demo_vault.py --force` and rerun.
- If the suite fails on a future Obsidian release, prefer adjusting the E2E helper layer rather than widening assertions.

## Known limitations

- The suite uses Obsidian renderer APIs to open files and inspect the active mode. This is more stable than driving the file explorer DOM, but it is still tied to Obsidian desktop internals.
- Helpers follow native Settings into its separate window on newer hosts, then return to the exact synthetic vault window for file operations.
- The smoke tests prove the real desktop integration path, not every user interaction path.
- Different Obsidian or Electron versions may change startup timing or mode-switch behavior.
- Current runs may log `EnableNodeCliInspectArguments fuse is disabled - CDP bridge will not work`. That warning is expected for this Obsidian build and does not block the current smoke assertions because they do not rely on the CDP bridge.

## Reproducible Settings comparison

The opt-in `settings-visual.e2e.mjs` writes PNGs and JSON metadata under
`.tmp/wdio-artifacts/<label>/`. It captures overlapping viewports across the settings scroll range, requesting
1400×1000 and 600×1000 desktop windows (the screen may constrain actual size), light/dark theme classes,
and collapsed/expanded plugin disclosures. Metadata records the actual viewport,
scale and native Settings branch. It does not force a legacy renderer on a newer
host, or claim that screenshots alone prove keyboard accessibility.

1. Build the baseline revision in a separate worktree. Save its `main.js`,
   `styles.css` and `manifest.json` outside `demo-vault` (which reset deletes).
2. In the working checkout, generate the fixture. Replace the three plugin
   symlinks in `demo-vault/.obsidian/plugins/read-only-view/` with **copies** of
   those baseline files; do not overwrite symlink targets.
3. Run `E2E_VISUAL_LABEL=before npx wdio run wdio.conf.mjs --spec tests/e2e/specs/settings-visual.e2e.mjs`.
4. Run `E2E_VISUAL_LABEL=after npm run test:e2e` to rebuild and reset to the current
   plugin. Use the same Obsidian binary, zoom, display scale and Electron version.
5. Compare each matching PNG pair and its JSON metadata. Inspect card geometry,
   order, spacing, text, icons, disclosure states and overflow. Record the host
   version and differences; screenshots are artifacts for review, not an automatic
   visual pass. Tab/Shift-Tab through switches, disclosures and rule fields, check
   visible focus and keyboard activation, and record those manual results separately.
6. Repeat on a native legacy host (1.10.3–1.12.x) and a declarative host (1.13+),
   using separate labels such as `legacy-before` / `legacy-after`. Explicitly mark
   unavailable hosts as untested. For real popouts and mobile, follow the same
   state matrix manually in a copy of the synthetic vault; never use personal notes.

Ticket 007 changes test infrastructure only: production TypeScript and CSS are
unchanged. Desktop execution and visual comparison results are recorded in
`docs/PROJECT_STATE.md`; no mobile or popout pass is inferred from Node tests.
