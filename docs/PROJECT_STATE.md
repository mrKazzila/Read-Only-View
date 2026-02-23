# PROJECT_STATE

Last updated: 2026-02-23

This document is a living system map for the `read-only-view` Obsidian plugin.

## 1) Architecture

High-level modules:

- `src/main.ts`
  - Plugin lifecycle (`onload`, `onunload`)
  - Event wiring (`file-open`, `active-leaf-change`, `layout-change`) with event coalescing
  - Orchestration for enforcement service calls
  - Settings tab wiring (without UI-render details)
  - Best-effort popover handling via `MutationObserver` with prefilter, batched candidate handling, and `containerEl -> leaf` cache
- `src/enforcement.ts`
  - Typed enforcement service (`createEnforcementService`)
  - Enforcement loop, lock/pending queue, and per-leaf preview throttle
  - Leaf-level preview forcing with fallback logging
- `src/settings-tab.ts`
  - `ForceReadModeSettingTab` UI module (settings controls, rules editor, diagnostics panel, path tester)
  - `DebouncedRuleChangeSaver` for input-save debounce and flush
- `src/rule-diagnostics.ts`
  - Rule text parsing and diagnostics helpers
  - Path tester matching helpers for include/exclude/result output
- `src/matcher.ts`
  - `normalizeVaultPath(path)`
  - `compileGlobToRegex(pattern, caseSensitive)` with bounded FIFO cache (`cap=512`)
  - `clearGlobRegexCache()` service API for explicit cache invalidation (used in tests/tooling)
  - `matchPath(filePath, pattern, options)`
  - `shouldForceReadOnly(filePath, settings)`
- `tests/matcher.test.ts`
  - Node test runner coverage for matcher behavior (glob/prefix/case/normalization/exclude-wins)
- `tests/matcher.stress.test.ts`
  - Stress/perf coverage for long path + wildcard matcher workloads with conservative runtime budgets (`*`, `**`, `?`)
- `tests/helpers/obsidian-mocks.ts`
  - Factory mocks `workspace/app/leaf/viewState` for orchestration tests from `main.ts`
- `tests/helpers/dom-mocks.ts`
  - Replacement for `MutationObserver`, `HTMLElement`, and minimal `document.body` for Node tests
- `tests/helpers/test-setup.ts`
  - Reusable test framework setup for future `main.ts` tests
- `tests/main-test-harness.test.ts`
  - Framework smoke test: validity of leaf/workspace mocks and DOM/observer replacements
- `tests/main.enforcement.test.ts`
  - Integration coverage for `main.ts` orchestration over enforcement paths
- `tests/enforcement.test.ts`
  - Unit coverage for enforcement service contracts: pending queue, throttle behavior, and fallback logging
- `tests/main.observer.test.ts`
  - Observer and workspace event coverage for `main.ts`: mutation prefiltering, batched popover/editor enforcement path, leaf lookup cache hit/miss behavior, cache invalidation, unload disconnect, and coalesced event-driven reapply
- `tests/rules-save-debounce.test.ts`
  - Debounced rules-save coverage for settings module: burst collapse, immediate flush, and latest-value persistence
- `tests/rule-diagnostics.test.ts`
  - Diagnostics and path tester helper coverage for inline warnings and include/exclude/result computation
- `tests/debug-logging.test.ts`
  - Debug logging privacy coverage for path redaction/verbose mode and fallback error diagnostics

Design intent:

- Read-only policy is enforced by view mode (`preview`) rather than command interception.
- Exclude rules always override include rules.
- Only markdown files are in scope.

## 2) Key Flows

### A. Startup flow

1. Load persisted settings (`loadData`).
2. Register commands.
3. Register workspace event listeners.
4. Start mutation observer.
5. Perform initial enforcement pass (`applyAllOpenMarkdownLeaves('onload')`).

### B. Enforcement flow

1. Triggered by workspace events or manual command.
2. Iterate `app.workspace.getLeavesOfType('markdown')`.
3. For each `MarkdownView` with file:
   - ignore non-`.md`
   - evaluate `shouldForceReadOnly(file.path, settings)`
4. If match: call `ensurePreview(leaf, reason)`.

Workspace-event coalescing:

- `file-open`, `active-leaf-change`, and `layout-change` are combined in a 150 ms window.
- One coalesced run executes with reason format `workspace-events:<joined reasons>`.
- Manual command `Re-apply rules now` still runs immediately.

Observer optimization:

- Mutation batches are prefiltered to skip non-relevant nodes quickly.
- Candidate nodes are handled in one batch function per mutation callback.
- Leaf lookup uses `containerEl -> leaf` cache with fallback scan on miss.
- Leaf lookup cache is invalidated on `layout-change` and `onunload`.

Loop protection:

- Global lock (`enforcing`) + pending reason queue (`pendingReapply`)
- Per-leaf throttle (`WeakMap<WorkspaceLeaf, number>`) to reduce repeated `setViewState` calls.

Command entry points:

- `Enable read-only mode` (shown only when currently disabled)
- `Disable read-only mode` (shown only when currently enabled)
- `Toggle plugin enabled`
- `Re-apply rules now`

### C. Matching flow

1. Normalize path (trim, slash normalization, remove leading `./`, collapse `//`).
2. If `useGlobPatterns=true`: anchored regex (`^...$`) using internal glob conversion.
   - Compiled regex entries are cached with fixed FIFO cap (`512`) to bound memory for highly unique rule sets.
3. If `useGlobPatterns=false`: literal prefix mode with optional folder slash hint.
4. Include must match, then exclude must *not* match.

### D. Settings UX flow

UI module split:

- `src/settings-tab.ts` owns rendering and handlers for settings UI sections.
- `src/rule-diagnostics.ts` provides pure helpers used by settings UI (rule diagnostics + path tester computations).

- Toggles: `Enabled`, `Use glob patterns`, `Case sensitive`, `Debug logging`
- `Debug: verbose paths` toggle allows full file paths in debug logs; default keeps paths redacted
- Rule textareas: include/exclude (one rule per line)
- Rules-save behavior:
  - save on `input` with 400 ms debounce
  - flush on `blur` and `change`
  - status text: `Saving...`, `Saved.`, `Save failed.`
- Diagnostics list per line:
  - `✅` healthy
  - `⚠️` suspicious (empty lines, wildcard in prefix mode, normalization/folder-hint changes)
  - empty lines render as `(empty line)` and do not receive synthetic `/` normalization
  - warning details are rendered inline in nested semantic lists (`ul/li`) and announced via `aria-live`
  - diagnostics panel is capped with local scroll for mobile/tablet readability
- Path tester:
  - include matches
  - exclude matches
  - final `READ-ONLY ON/OFF`
  - long strings wrap to avoid horizontal overflow on narrow screens

## 3) Important Files and Config

Build/test/lint commands are sourced from:

- `Justfile`
  - `install`, `dev`, `build`, `test`, `lint`, `check`, `clean`
- `package.json`
  - `npm run dev|build|test|lint`

Core config:

- `manifest.json`
  - `id: read-only-view`
  - `isDesktopOnly: false`
- `esbuild.config.mjs`
  - entry: `src/main.ts`
  - output: `main.js`
  - bundle format: `cjs`
- `tsconfig.json`
  - strict-ish TS options for `src/**/*.ts`
- `tsconfig.test.json`
  - test compile output to `build-tests/`
- `eslint.config.mts`
  - Obsidian lint preset + repo ignores + test-file overrides
- Dependency strategy:
  - `obsidian` is pinned to an exact version (`1.10.3`) in `package.json`
  - version updates are explicit and validated with full lint/test/build and runtime smoke checks

Generated artifacts (not source of truth):

- `main.js`
- `build-tests/`

## 4) Known Gotchas

- `build-tests/` is generated by tests and can pollute lint if ignored patterns/config are changed.
- `ensurePreview` uses `setViewState` with `{ replace: true }` and fallback call style; API behavior can differ across Obsidian versions.
- Matching is intentionally limited to `.md`; attachments and other extensions are untouched.
- Prefix mode treats `*` and `?` as literal characters, which can surprise users.
- Rule diagnostics are advisory; they do not block saving rules.
- Debug logs use path redaction by default; full path output is opt-in via `Debug: verbose paths`.
- Fallback from `setViewState(..., { replace: true })` logs error type/message in debug mode.

## 5) Not Sure / Verify Here

Items where behavior depends on Obsidian internals and is best-effort:

- Manual compatibility tracking matrix:
  - See `docs/compatibility-matrix.md` for platform/version/scenario results and pending checks.

- Hover/popover edit prevention coverage is not guaranteed for every internal view implementation.
  - Verify in: `src/main.ts` (`installMutationObserver`, `handlePotentialPopoverNode`, `findLeafByNode`).
- Whether every embedded note context maps to a real markdown leaf in all app versions.
  - Verify in: runtime behavior + `src/main.ts` enforcement path.

## 6) Maintenance Rule

When plugin behavior changes (matching logic, enforcement behavior, commands, settings UX):

1. Update this file (`docs/PROJECT_STATE.md`).
2. Update user-facing docs (`README.md`).
3. Re-run validation: `just lint && just test && just build`.
