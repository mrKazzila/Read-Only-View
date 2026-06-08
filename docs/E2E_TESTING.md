# E2E testing

This repository includes a small, opt-in WebdriverIO smoke suite for desktop Obsidian.

## What it covers

- Launching desktop Obsidian against the repo-generated `demo-vault`
- Confirming the plugin is enabled in that synthetic vault
- Confirming a protected note under `Read Only/` returns to Reading view
- Confirming an excluded draft under `Read Only/Drafts/` can stay in source mode
- Confirming a normal note outside the include rules can stay in source mode

## What it does not cover

- Mobile behavior
- Broad settings UI traversal
- Welcome modal flows
- Every popover or hover-preview edge case
- Exhaustive editor interaction coverage

Those areas already have good unit coverage or would be too brittle for a first desktop smoke suite.

## Safety model

- E2E uses only the synthetic repo-local `./demo-vault`.
- Personal vaults are never opened by the E2E scripts.
- The vault is recreated from `scripts/create_demo_vault.py`.
- The plugin files are linked or copied into the generated vault by the existing demo-vault flow.

Note: launching desktop Obsidian may still update Obsidian's own recent-vault metadata outside the repository. The E2E setup does not require you to edit global settings manually, but it does not fully sandbox Obsidian's global app state.

## Prerequisites

- Node.js and npm
- Python 3
- Desktop Obsidian installed locally
- Repo dependencies installed with `npm install`

Build the plugin before E2E:

```bash
npm run build
```

You can also let the E2E script build for you.

## Obsidian binary path

The suite reads `OBSIDIAN_PATH`.

- On macOS, the default fallback is:
  `/Applications/Obsidian.app/Contents/MacOS/Obsidian`
- On other platforms, set `OBSIDIAN_PATH` explicitly.

Examples:

```bash
OBSIDIAN_PATH="/Applications/Obsidian.app/Contents/MacOS/Obsidian" npm run test:e2e
OBSIDIAN_PATH="/path/to/Obsidian.exe" npm run test:e2e
```

## Running the suite

Standard run:

```bash
npm run test:e2e
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
just demo-vault-reset
```

## Artifacts and troubleshooting

- Failure screenshots are written under `.tmp/wdio-artifacts/`.
- If Obsidian does not launch into `demo-vault`, verify `OBSIDIAN_PATH`.
- If community plugins do not load, recreate the vault with `python3 scripts/create_demo_vault.py --force` and rerun.
- If the suite fails on a future Obsidian release, prefer adjusting the E2E helper layer rather than widening assertions.

## Known limitations

- The suite uses Obsidian renderer APIs to open files and inspect the active mode. This is more stable than driving the file explorer DOM, but it is still tied to Obsidian desktop internals.
- The smoke tests prove the real desktop integration path, not every user interaction path.
- Different Obsidian or Electron versions may change startup timing or mode-switch behavior.
- Current runs may log `EnableNodeCliInspectArguments fuse is disabled - CDP bridge will not work`. That warning is expected for this Obsidian build and does not block the current smoke assertions because they do not rely on the CDP bridge.
