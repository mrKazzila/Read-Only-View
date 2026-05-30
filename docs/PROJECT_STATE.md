# PROJECT_STATE

Last updated: 2026-05-31

This document is a living system map for the `read-only-view` Obsidian plugin.

## 0) Development workflow

- Local vault installation uses `just link-plugin`.
- The default local QA target is the repo-local `./demo-vault`; `VAULT=...` can override it for a different vault.
- The workflow symlinks `main.js` and optional `styles.css` into the target vault plugin directory.
- `manifest.json` is generated as a vault-local DEV copy so the installed test build is visibly marked without mutating the repo release manifest.
- `just unlink-plugin` removes only that local dev install from the vault and also removes the plugin id from `.obsidian/community-plugins.json`; vault notes remain intact.
- Synthetic QA vault generation uses `python3 scripts/create_demo_vault.py` or the wrapper recipes `just demo-vault`, `just demo-vault-reset`, and `just demo-vault-no-plugin`.
- The demo vault lives at `./demo-vault`, is ignored by git, and contains only synthetic Markdown notes plus optional linked plugin files for safe screenshots and recordings.
- When plugin linking is enabled, the generator copies `manifest.json`, links `main.js`, links optional `styles.css`, writes plugin `data.json`, and enables the plugin in `.obsidian/community-plugins.json`.
- Demo vault default rules use prefix mode and configure:
  - include: `Read Only/`, `Archive/`
  - exclude: `Read Only/Drafts/`

## 1) Architecture

High-level modules:

- `src/main.ts`
  - Plugin lifecycle (`onload`, `onunload`)
  - Thin composition root for commands, workspace-event controller, enforcement service, settings tab, and popover observer service
- `src/command-controls.ts`
  - Command availability guards (`canRunEnableCommand`, `canRunDisableCommand`)
  - Re-apply decision helper for enabled-state transitions (`shouldReapplyAfterEnabledChange`)
- `src/plugin-commands.ts`
  - Command registration/composition for enable, disable, toggle, and manual re-apply commands
- `src/plugin-types.ts`
  - Shared plugin-facing settings and settings-tab contract types
- `src/plugin-settings.ts`
  - Default settings and persisted-settings merge helper
- `src/debug-log.ts`
  - Path redaction helper for debug logging
- `src/enforcement.ts`
  - Typed enforcement service (`createEnforcementService`)
  - Enforcement loop, lock/pending queue, and per-leaf preview throttle
  - Leaf-level preview forcing with fallback logging
  - Explicit `stop()` cleanup for deferred layout-change retry timers
- `src/editor-readonly.ts`
  - CodeMirror 6 read-only extension for markdown editors
  - Path-aware `EditorState.readOnly` and `EditorView.editable` gating via `editorInfoField`
- `src/settings-tab.ts`
  - `ForceReadModeSettingTab` composition entrypoint for sectioned settings UI
- `src/settings-general.ts`
  - General/debug toggle rendering with plugin-owned toggle rows and shared save/re-apply side-effect helper
- `src/settings-rule-editor.ts`
  - Rules editor section rendering, diagnostics list UI, and `DebouncedRuleChangeSaver`
- `src/settings-ui-state.ts`
  - Pure settings summary/warning state computation for rule-limit banners
- `src/settings-path-tester.ts`
  - Path tester section rendering
- `src/settings-welcome.ts`
  - Versioned onboarding modal and best-effort settings opening helper
- `src/constants.ts`
  - Rule volume thresholds and hard limits (`50/150`, `200/300/400`)
- `src/rule-limits.ts`
  - Single source of truth for effective include/exclude rules after cleanup + caps
  - Line-level ignored index tracking for settings diagnostics/UI
- `src/popover-observer.ts`
  - Typed popover observer service with explicit lifecycle (`start`, `stop`)
  - Centralized popover/editor selectors and mutation prefiltering
  - Popover candidate scope limited to `.hover-popover` and `.popover`
  - Batched candidate handling and `containerEl -> leaf` cache with explicit invalidation
  - Per-batch leaf deduplication to avoid repeated preview forcing for one leaf
- `src/rule-diagnostics.ts`
  - Rule text parsing and diagnostics helpers
  - Path tester matching helpers for include/exclude/result output
- `src/workspace-events.ts`
  - Workspace-event coalescing controller for targeted-vs-full reapply strategy
  - Timed burst scheduling and cleanup for `file-open`, `active-leaf-change`, and `layout-change`
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
- `tests/command-controls.test.ts`
  - Unit coverage for command visibility and enabled-change re-apply decisions
- `tests/helpers/obsidian-mocks.ts`
  - Factory mocks `workspace/app/leaf/viewState` for orchestration tests from `main.ts`
- `tests/helpers/dom-mocks.ts`
  - Replacement for `MutationObserver`, `HTMLElement`, and minimal `document.body` for Node tests
- `tests/helpers/test-setup.ts`
  - Reusable test framework setup for future `main.ts` tests
- `tests/helpers/prepare-obsidian-runtime.mjs`
  - Test-runtime bootstrap that prepares an `obsidian` module stub and patches build-time relative imports
- `tests/main-test-harness.test.ts`
  - Framework smoke test: validity of leaf/workspace mocks and DOM/observer replacements
- `tests/main.enforcement.test.ts`
  - Integration coverage for `main.ts` orchestration over enforcement paths
- `tests/enforcement.test.ts`
  - Unit coverage for enforcement service contracts: pending queue, throttle behavior, and fallback logging
- `tests/main.observer.test.ts`
  - Integration coverage for `main.ts` observer wiring and workspace event behavior
- `tests/popover-observer.test.ts`
  - Unit coverage for observer service lifecycle, prefilter, dispatch, selector contract, and leaf-cache invalidation
- `tests/rules-save-debounce.test.ts`
  - Debounced rules-save coverage for settings module: burst collapse, immediate flush, and latest-value persistence
- `tests/settings-general.test.ts`
  - Settings toggle side-effect coverage for save/re-apply behavior after UI extraction
- `tests/rule-diagnostics.test.ts`
  - Diagnostics and path tester helper coverage for inline warnings and include/exclude/result computation
- `tests/rule-limits.test.ts`
  - Rule cap/warning coverage and matching behavior with ignored tail rules
- `tests/debug-logging.test.ts`
  - Debug logging privacy coverage for path redaction/verbose mode and fallback error diagnostics
- `tests/workspace-events.test.ts`
  - Workspace-event controller coverage for targeted bursts, full-scan fallback, and timer cleanup

Design intent:

- Read-only policy is enforced by editor-level input blocking first, with view mode (`preview`) as a fallback/UX layer.
- Optional global preset can force all Markdown notes into read-only before include/exclude rules are considered.
- Exclude rules always override include rules.
- Only markdown files are in scope.

## 2) Key Flows

### A. Startup flow

1. Load persisted settings (`loadData`).
2. Register commands via `src/plugin-commands.ts`.
3. Register workspace event listeners that delegate to `src/workspace-events.ts`.
4. Register the editor read-only extension.
5. Start mutation observer.
6. Perform initial enforcement pass (`applyAllOpenMarkdownLeaves('onload')`).

### B. Enforcement flow

1. Triggered by workspace events or manual command.
2. Iterate `app.workspace.getLeavesOfType('markdown')`.
3. For each `MarkdownView` with file:
   - ignore non-`.md`
   - evaluate `shouldForceReadOnly(file.path, settings)`
4. If match: call `ensurePreview(leaf, reason)`.

Editor-level guard:

- Implemented in `src/editor-readonly.ts`.
- Reads `MarkdownFileInfo.file.path` from Obsidian `editorInfoField`.
- Applies CM6 `EditorState.readOnly=true` and `EditorView.editable=false` only for matched markdown paths.
- Observes read-only editor interaction (`pointerdown`, `focus`) and routes it back into `ensurePreview()` for faster return to Reading view.
- Covers CodeMirror-backed editors without requiring active-leaf lookups.
- Existing editor instances are reconfigured on settings changes via `workspace.updateOptions()`.

Workspace-event coalescing:

- `file-open`, `active-leaf-change`, and `layout-change` are combined in a 150 ms window by `WorkspaceEventController`.
- One coalesced run executes with reason format `workspace-events:<joined reasons>`.
- Optimization: when a coalesced batch contains only `active-leaf-change` and/or `file-open`, enforcement is applied only to the affected leaf instead of scanning all markdown leaves.
- Manual command `Re-apply rules now` still runs immediately.

Observer optimization:

- Implemented in `src/popover-observer.ts` with explicit service lifecycle.
- Mutation batches are prefiltered to skip non-relevant nodes quickly.
- Candidate nodes are handled in one batch function per mutation callback.
- Leaf lookup uses `containerEl -> leaf` cache with fallback scan on miss.
- Leaf lookup cache is invalidated on `layout-change` and `onunload`.

Loop protection:

- Global lock (`enforcing`) + pending reason queue (`pendingReapply`)
- Per-leaf throttle (`WeakMap<WorkspaceLeaf, number>`) to reduce repeated `setViewState` calls.
- Layout-change bursts use an extended per-leaf throttle window to reduce repeated reflow-prone mode flips during heavy UI relayouts.
- Throttled layout-change attempts schedule one trailing retry per leaf so a note is not left in source mode after the burst ends.
- Pending layout-change retry timers are cleared during plugin unload through `EnforcementService.stop()`.

Command entry points:

- `Enable read-only mode` (shown only when currently disabled)
- `Disable read-only mode` (shown only when currently enabled)
- `Toggle read-only mode`
- `Re-apply rules now`
- Command visibility and enable/disable transition rules are centralized in `src/command-controls.ts`.

### C. Matching flow

1. Normalize path (trim, slash normalization, remove leading `./`, collapse `//`).
2. If `useGlobPatterns=true`: anchored regex (`^...$`) using internal glob conversion.
   - Compiled regex entries are cached with fixed FIFO cap (`512`) to bound memory for highly unique rule sets.
3. If `useGlobPatterns=false`: literal prefix mode with optional folder slash hint.
4. Build effective rule sets from settings using hard-cap policy:
   - include is capped first (`200`)
   - exclude is capped second (`300`)
   - if total still exceeds `400`, exclude tail is trimmed first (include priority)
5. If `forceAllMarkdownReadOnly=true`, every `.md` path is immediately treated as read-only.
6. Otherwise include must match, then exclude must *not* match.

### D. Settings UX flow

UI module split:

- `src/settings-tab.ts` owns only top-level composition of settings UI sections.
- `src/settings-general.ts` owns general/debug toggle rendering and persistence side effects.
- `src/settings-rule-editor.ts` owns the include/exclude editor sections and debounced save helper.
- `src/settings-ui-state.ts` owns the pure summary/warning calculation used by the rules section.
- `src/settings-path-tester.ts` owns the path tester section.
- `src/settings-welcome.ts` owns the versioned onboarding modal shown for undismissed onboarding versions.
- `src/rule-diagnostics.ts` provides pure helpers used by settings UI (rule diagnostics + path tester computations).

- Welcome modal:
  - shown only when `dismissedWelcomeVersion < WELCOME_VERSION`
  - dismissing or using `Open settings` saves the current onboarding version
- Settings layout uses one always-visible plugin block plus plugin-owned collapsible sections with ephemeral open state
- Plugin block:
  - short behavior summary
  - `Enabled`
  - `All Markdown files read-only`
- Matching section:
  - `Use glob patterns`
  - `Case sensitive`
- Path rules section:
  - include/exclude editors
  - preset override note while the all-Markdown preset is enabled
  - rule usage summary
  - warning banners and diagnostics
- Path tester section:
  - include matches
  - exclude matches
  - preset override note when the all-Markdown preset is driving the final result
  - final `READ-ONLY ON/OFF`
- Debug flags section:
  - `Debug logging`
  - `Debug: verbose paths`
  - warning text about full path exposure in console logs
- Settings toggles are rendered with plugin-owned layout rows backed by `ToggleComponent`.
- `Debug: verbose paths` toggle allows full file paths in debug logs; default keeps paths redacted
- Rule textareas: include/exclude (one rule per line)
- Rule usage summary:
  - `Include: X rules · Exclude: Y rules · Total: Z` (`+N ignored` when capped)
- Rule volume warnings (inline banner, no toast):
  - soft warning when include or exclude has more than `50` effective rules
  - strong warning when include or exclude has more than `150` effective rules
  - hard-cap warning `Too many rules. Extra lines are ignored.` when caps are exceeded
- Rules-save behavior:
  - save on `input` with 400 ms debounce
  - flush on `blur` and `change`
  - status text: `Saving...`, `Saved.`, `Save failed.`
  - any successfully saved include/exclude rules change disables `All Markdown files read-only`
- Diagnostics list per line:
  - `✅` healthy, marked `aria-hidden` with adjacent text status for screen readers
  - `⚠️` suspicious (empty lines, wildcard in prefix mode, normalization/folder-hint changes), marked `aria-hidden` with adjacent text status for screen readers
  - ignored line marker (`Ignored`) and inline warning (`Ignored due to rule limit.`) for rules truncated by caps
  - empty lines render as `(empty line)` and do not receive synthetic `/` normalization
  - warning details are rendered inline in nested semantic lists (`ul/li`) and announced via `aria-live`
  - diagnostics panel is capped with local scroll for mobile/tablet readability
- Path tester long strings wrap to avoid horizontal overflow on narrow screens
- Keyboard QA note:
  - if pressing `Space` scrolls the settings pane during toggle testing, inspect `document.activeElement` before treating it as a toggle bug
  - only classify it as a plugin defect when the focused element is the toggle control and keyboard activation still fails

## 3) Important Files and Config

Build/test/lint commands are sourced from:

- `Justfile`
  - `install`, `dev`, `build`, `test`, `lint`, `check`, `clean`
- `package.json`
  - `npm run dev|build|test|lint`
  - `npm test` flow: compile tests -> prepare test runtime (`tests/helpers/prepare-obsidian-runtime.mjs`) -> run `node --test build-tests/**/*.test.js`

Core config:

- `manifest.json`
  - `id: read-only-view`
  - `isDesktopOnly: false`
  - `minAppVersion: 1.10.3`
- `esbuild.config.mjs`
  - entry: `src/main.ts`
  - output: `main.js`
  - bundle format: `cjs`
- `tsconfig.json`
  - strict-ish TS options for `src/**/*.ts`
- `tsconfig.test.json`
  - test compile output to `build-tests/`
  - includes all `src/**/*.ts` plus `tests/**/*.ts` so extracted helper modules stay covered by the test build
- `eslint.config.mts`
  - Obsidian lint preset + repo ignores + test-file overrides
  - default-project allowance sized for the current typed test suite
- Dependency strategy:
  - `obsidian` is pinned to an exact version (`1.10.3`) in `package.json`
  - `minAppVersion` is aligned to the only explicitly pinned and manually tracked compatibility baseline (`1.10.3`)
  - version updates are explicit and validated with full lint/test/build and runtime smoke checks

Generated artifacts (not source of truth):

- `main.js`
- `build-tests/`

## 4) Known Gotchas

- `build-tests/` is generated by tests and can pollute lint if ignored patterns/config are changed.
- `tests/helpers/prepare-obsidian-runtime.mjs` rewrites extensionless local imports in `build-tests/src/*.js`; update it if the test runtime layout changes.
- `ensurePreview` uses `setViewState` with `{ replace: true }` and fallback call style; API behavior can differ across Obsidian versions.
- Editor-level protection assumes the target markdown context is CodeMirror-backed and exposes `editorInfoField`.
- Matching is intentionally limited to `.md`; attachments and other extensions are untouched.
- Prefix mode treats `*` and `?` as literal characters, which can surprise users.
- Rule diagnostics are advisory; they do not block saving rules.
- Debug logs use path redaction by default; full path output is opt-in via `Debug: verbose paths`.
- Fallback from `setViewState(..., { replace: true })` logs error type/message in debug mode.

## 5) Not Sure / Verify Here

Items where behavior depends on Obsidian internals and is best-effort:

- Manual compatibility tracking matrix:
  - See `docs/compatibility-matrix.md` for platform/version/scenario results and pending checks.
- Release QA checklist:
  - See `docs/RELEASE_QA.md` for the concise pre-release desktop/mobile/accessibility pass.

- Hover/popover edit prevention coverage is stronger for CodeMirror-backed contexts, but not guaranteed for every internal non-CM/internal view implementation.
  - Verify in: `src/editor-readonly.ts` and `src/popover-observer.ts`.
- Whether every embedded note context maps to a real markdown leaf in all app versions.
  - Verify in: runtime behavior + `src/main.ts` enforcement path.

## 6) Maintenance Rule

When plugin behavior changes (matching logic, enforcement behavior, commands, settings UX):

1. Update this file (`docs/PROJECT_STATE.md`).
2. Update user-facing docs (`README.md`).
3. Re-run validation: `just lint && just test && just build`.
