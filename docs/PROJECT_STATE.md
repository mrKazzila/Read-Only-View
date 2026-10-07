# PROJECT_STATE

Last updated: 2026-10-08

This document is a living system map for the `read-only-view` Obsidian plugin.

## 0) Development workflow

- Local vault installation uses `just link-plugin`.
- The default local QA target is the repo-local `./demo-vault`; `VAULT=...` can override it for a different vault.
- The workflow symlinks `main.js` and optional `styles.css` into the target vault plugin directory.
- `manifest.json` is generated as a vault-local DEV copy so the installed test build is visibly marked without mutating the repo release manifest.
- `just unlink-plugin` removes only that local dev install from the vault and also removes the plugin id from `.obsidian/community-plugins.json`; vault notes remain intact.
- Synthetic QA vault generation uses `python3 scripts/create_demo_vault.py` or the wrapper recipes `just demo 1.1.3.2`, `just demo-reset 1.1.3.2`, and `just demo-no-plugin`.
- Plugin-installing demo recipes require a version argument and write a vault-local DEV manifest; the machine-local `demo-mobile` recipe also requires a version. Direct script calls without `--plugin-version` retain release metadata for E2E compatibility.
- Shared desktop recipes (`demo`, `demo-reset`, `demo-no-plugin`, `link-plugin`, `unlink-plugin`) live in `just/development.just` under Development and contain no personal paths. `demo` and `demo-reset` build before installation.
- Optional `demo-mobile` and `demo-all` recipes live only in ignored `just/local.just` under Local; `just/local.example.just` provides an environment-based template using `MOBILE_VAULT`. Group labels do not provide privacy.
- `demo-mobile` builds and copies regular files into the existing mobile vault. `demo-all` runs `demo` followed by the private mobile copy recipe, building once and installing the same version in both destinations. A mobile failure leaves the completed desktop installation in place; neither recipe waits for cloud delivery.
- The demo vault lives at `./demo-vault`, is ignored by git, and contains only synthetic Markdown notes plus optional linked plugin files for safe screenshots and recordings.
- When plugin linking is enabled, the generator copies `manifest.json`, links `main.js`, links optional `styles.css`, writes plugin `data.json`, and enables the plugin in `.obsidian/community-plugins.json`.
- Demo vault default rules use prefix mode and configure:
  - vault-path include: `Read Only/`, `Archive/`
  - exact advanced include: `Inbox/Quick capture.md` (Obsidian URL), `Inbox/Meeting recap.md` (privacy-safe system-path import)
  - exclude: `Read Only/Drafts/`
- Desktop E2E smoke tests also reuse that same repo-local `./demo-vault` fixture instead of creating a second vault generator.
- The opt-in E2E entrypoint is `npm run test:e2e` (or `npm run test:e2e:debug`), which builds the plugin, recreates `./demo-vault`, and launches Obsidian against that synthetic vault through WebdriverIO.
- The E2E workflow defaults to macOS binary path `/Applications/Obsidian.app/Contents/MacOS/Obsidian` and accepts `OBSIDIAN_PATH` for override.
- E2E Chromedriver selection defaults to the Obsidian Electron baseline `32.2.5`; `OBSIDIAN_ELECTRON_VERSION` overrides it when testing a different Obsidian runtime.

## Host integration verification (ticket 007)

- Explorer save/enable/disable and save-failure rollback tests construct the plugin,
  load persisted fixtures through `onload()`, and use production `changeSettings` /
  canonical rule entries. They no longer inject the private Explorer controller.
  The deterministic adapter supports multiple listeners and filters leaves by type.
- Existing matcher, targeted invalidation, operation-count and multi-document unit
  tests remain. Mock DOM scenarios establish algorithmic behavior, not host markup
  compatibility.
- Desktop smoke now observes native Explorer rows for included/excluded paths,
  rename across an exclusion, host pane recreation, feature disable and plugin
  unload cleanup. The dedicated E2E profile and exact vault-path guard limit fixture
  operations to the generated repo-local demo vault.
- Optional Settings screenshot matrix and baseline/current instructions are in
  [E2E testing](E2E_TESTING.md#reproducible-settings-comparison). It records the
  native Settings branch, viewport and scale; narrow desktop is not mobile.
- Validation (2026-10-08): `just lint`, `just test` (346 tests), and `just build`
  passed. Desktop smoke passed all 11 checks on macOS, Obsidian 1.14.4 / Electron
  32.2.5 under Node 22. The optional visual capture passed separately for baseline
  `734f3b8` and current builds: 42 PNG pairs across eight declarative Settings
  states (1400/600 requested width, light/dark, collapsed/expanded). All eight JSON
  metadata records match; 40 PNGs are byte-identical and the other two differ only
  in the native search caret's 2×30 pixel region. Plugin content/layout is unchanged.
  Actual captured viewport was 1400×796 or 600×796 at scale 2 (screen-constrained
  height). Artifacts: `.tmp/wdio-artifacts/{before,after}/`.
- The Node 26 runner failed before session creation (`UND_ERR_INVALID_ARG`);
  use Node 22. Helpers select the native separate Settings window on newer hosts
  and return to the synthetic vault for file operations. Rename coverage uses
  `Vault.rename`; automatic link rewriting is outside this smoke's scope.
- Real Explorer popouts, mobile, legacy Settings, and manual keyboard/focus
  traversal were not tested. Narrow desktop captures do not establish mobile
  compatibility. Baseline/current bundle, styles and manifest are byte-identical;
  production source, command IDs and Include/Exclude behavior are unchanged.

## 1) Architecture

- `src/explorer-indicators.ts`
  - Optional, visual-only File Explorer locks for Markdown files and folders; `showExplorerProtectionIndicators` defaults to false, including upgrades.
  - Reuses the compiled matcher: `isPathProtected(path, kind)` shares the runtime decision; folders use a trailing slash, while `shouldForceReadOnly` retains the Markdown-only guard. Folder icons describe matching scope, not a claim that every descendant is protected. Glob rules are evaluated as written; a note-only glob does not imply a protected folder.
  - Starts on load/enable, reconciles Explorer containers on layout readiness and layout changes, and refreshes tracked rows only when the revision-backed compiled matcher changes. Unrelated debug saves do no row work; global disable stops it.
  - Vault create/delete/rename (including moves and folder descendants) invalidate affected tracked rows. A path/ancestor→rows index reaches exact paths and folder descendants across panes without scanning unrelated rows. Index storage is proportional to tracked rows times path depth. Container-scoped observers batch added subtrees and `data-path` changes in microtasks; unchanged rows reuse cached decisions. Removed DOM subtrees supply local cleanup candidates; pane closure checks all tracked rows because disconnecting its observer can discard pending removal records. No full-vault traversal.
  - Stop/unload disconnects observers, removes event refs/icons and cancels queued work. Selectors `.nav-file-title`, `.nav-folder-title`, and `data-path` are undocumented Explorer DOM conventions isolated in this controller; unsupported markup is skipped. Native icons and theme variables are used.
  - `tests/explorer-indicators.test.ts` covers shared decisions, defaults, lifecycle cleanup, idempotence, targeted updates, rerenders, multi-document panes, delayed folder renames and removal cleanup. Optional `ExplorerWorkCounts` counters measure candidate/render row visits, matcher calls and vault lookups; see [the operation profile](EXPLORER_INVALIDATION_PROFILE.md).

High-level modules:

- `src/read-only-explanation.ts` / `src/read-only-status-modal.ts` (1.1.3)
  - Native **Explain read-only status** modal uses `buildPathTesterResult` with one cached matcher per context-menu operation; no settings saves or enforcement calls
  - Compact note and folder modals group static monospace Include/Exclude values under Matched rules, use small section labels, and focus Close without focusable values or redundant tooltips. Folder summaries retain aggregate status, counts, empty-folder messaging, and editable examples in the same presentation. Native Close and Escape behavior are preserved. Closing leaves DOM teardown to Obsidian; opening clears previous content. Phone dialogs use native width/safe-area padding and bottom alignment so the native height-based dismissal translation moves them offscreen; compact outer geometry applies only outside phone mode.
  - Note reason precedence: disabled → Exclude → All Markdown files → Include → no match; matched rule representations stay identical to Path tester
  - Folder diagnostics iteratively traverse loaded `TFolder.children`, include nested Markdown `TFile` paths only, and aggregate all/mixed/none/empty status, counts, effective-order deduplicated rule unions, and at most five editable examples
  - Shared existing `file-menu` handler serves diagnostics for Markdown notes and folders (including root); Lock/Unlock semantics and root restriction remain unchanged
- `src/path-context-menu.ts` (1.1.3)
  - Public `file-menu` integration, registered through the plugin lifecycle; native flat `Lock → Reading` / `Unlock` items for non-root `TFolder` and Markdown `TFile`
  - When Settings is closed, submits through `changeSettings`, refreshes editor options, and immediately reapplies enforcement; failed saves restore the previous Include state
  - When Settings is open (legacy or declarative), applies the change to the active rule editor draft, refreshes only the rows while preserving row identities/focus, and uses its serialized save/reapply flow
  - Pending edits and external changes share one save queue; failures remain visible for retry and hidden/disposed editors are not updated
  - Notices explain disabled/global mode, rule caps, Exclude matches, and remaining protection for existing Markdown descendants
- `src/note-rules.ts` (1.1.3)
  - Creates exact Obsidian URL Include entries through the existing resolver, independent of prefix/glob mode
  - Reuses manual note paths and advanced exact entries; Unlock disables all equivalents, preserving parent and Exclude rules
  - Rejects unrepresentable exact paths without changing rules; persistence and enforcement are shared with folder actions
- `src/folder-rules.ts` (1.1.3)
  - Pure folder identity and Include transformations using normalized resolved paths and existing source resolution
  - Creates/enables `Folder/` in prefix mode or `Folder/**` in glob mode; reuses equivalent entries and adapts them on explicit Lock after mode changes
  - Unlock disables all exact equivalents without deleting rows; ancestors, Exclude rules, global/enabled switches, Settings UI, and matcher semantics remain unchanged
  - No ownership metadata or parallel storage; updates Include entries and their runtime arrays through the shared settings converter
  - No rename/delete migration; root and unrepresentable glob folder names are excluded, existing length/count limits remain in force

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
  - Immediately before the frame-deferred write and any fallback, revalidates the original view/path, current enabled/rule decision, Markdown state, and workspace membership; stale work is discarded
  - Builds each transition from current view state to preserve current note metadata; attachment validation adds one Markdown-leaf lookup per write attempt
  - Explicit `stop()` cleanup for deferred layout-change retry timers and pending animation frames
- `src/editor-readonly.ts`
  - CodeMirror 6 read-only extension for markdown editors
  - Path-aware `EditorState.readOnly` and `EditorView.editable` gating via `editorInfoField`
- `src/settings-tab.ts`
  - `ForceReadModeSettingTab` composition entrypoint for sectioned settings UI
  - Declarative, searchable setting definitions on Obsidian 1.13+ with the legacy `display()` renderer retained for Obsidian 1.10.3-1.12.x
- `src/settings-general.ts`
  - Enabled control, mutually exclusive mode buttons, and shared save/re-apply side-effect helper
- `src/settings-rule-editor.ts`
  - Unified Path rules table rendering, row diagnostics, and `DebouncedRuleChangeSaver`
  - One cached snapshot per editor revision holds row resolutions, active per-type indexes, save payload, limit summary, and diagnostics. Input/type/enabled/add/delete edits and changed external updates invalidate it; rendering and saving reuse it. Each rebuild resolves each loaded row once, including rows beyond matcher caps. DOM, CSS, focus handling, and debounce timing are unchanged.
  - Regression coverage counts resolver-context lookups at 10/20/450 rows and checks cap/error alignment after type, enabled, deletion, and external ordering changes. This establishes linear resolution work, not measured Obsidian latency.
  - Validation (2026-10-08): `just lint`, `just test` (340 tests), and `just build` passed. Before/after inspection in the demo vault on Obsidian 1.14.4 confirmed the same desktop dark-theme rule table, messages, and summary with Matching/Debug sections collapsed. Visual validation remains partial: legacy Settings (no legacy app session), light theme, expanded sections, and narrow/mobile layouts were not compared; no mobile session was available.
- `src/settings-focus.ts`
  - Stable focus keys plus capture/restore helpers for settings and rule-row rerenders
  - First-control focus helper used when opening the settings page
- `src/settings-ui-state.ts`
  - Pure settings summary/warning state computation for rule-limit banners
- `src/settings-path-tester.ts`
  - Path tester section rendering
- `src/settings-welcome.ts`
  - First-install welcome modal and best-effort settings opening helper
- `src/source-input-limits.ts`
  - Source-input length policy, overflow handling, and display-safe truncation helpers
- `src/constants.ts`
  - Rule volume thresholds and hard limits (`50/150`, `200/300/400`)
- `src/rule-state.ts`
  - Owns canonical RuleEntry loading, legacy migration at original enabled-flag indexes, source/path validation, compatibility projections, and effective entry selection
  - Matcher and context-menu limit checks select from the same validated entries; editor payloads and diagnostics use the shared runtime projection
  - Legacy string/enabled arrays remain serialized for compatibility; nonempty RuleEntry lists are authoritative, with legacy fallback for empty or absent lists
- `src/rule-limits.ts`
  - Shared include/exclude hard-cap policy applied by canonical rule state and settings diagnostics
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
- `src/rule-source.ts`
  - Auto-detection and resolution for vault paths, `obsidian://open` URLs, and absolute system paths
  - Exact-file/folder validation, current-vault containment, and privacy-safe absolute-path persistence
- `src/workspace-events.ts`
  - Workspace-event coalescing controller for targeted-vs-full reapply strategy
  - Timed burst scheduling and cleanup for `file-open`, `active-leaf-change`, and `layout-change`
- `src/matcher.ts`
  - `normalizeVaultPath(path)`
  - `compileGlobToRegex(pattern, caseSensitive)` retains its legacy name and cached `.test(path)` interface; it now returns a compiled glob object, not a `RegExp` (FIFO cache cap `512`)
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
  - Enabled/mode side effects plus `aria-pressed` and keyboard behavior
- `tests/rule-source.test.ts`
  - Source detection/resolution coverage for vault paths, Obsidian URLs, and desktop system paths
- `tests/source-input-limits.test.ts`
  - Path/URL input caps, overflow state, and display-truncation coverage
- `tests/settings-rule-editor.test.ts`
  - Unified rule-row rendering, source resolution, enabled states, diagnostics, and focus restoration
- `tests/settings-path-tester.test.ts`
  - Path tester source details, matched rules, final status, and accessible input errors
- `tests/settings-tab-lifecycle.test.ts`
  - Settings render lifecycle, cleanup, and first-control focus behavior
- `tests/settings-tab-ui-state.test.ts`
  - Static/collapsible section state and settings-level focus preservation
- `tests/rule-diagnostics.test.ts`
  - Diagnostics and path tester helper coverage for inline warnings and include/exclude/result computation
- `tests/rule-limits.test.ts`
  - Rule cap/warning coverage and matching behavior with ignored tail rules
- `tests/debug-logging.test.ts`
  - Debug logging privacy coverage for path redaction/verbose mode and fallback error diagnostics
- `tests/workspace-events.test.ts`
  - Workspace-event controller coverage for targeted bursts, full-scan fallback, and timer cleanup
- `tests/e2e/specs/read-only-smoke.e2e.mjs`
  - Desktop smoke coverage for startup, protected/excluded/editable notes, imported exact rules, advanced source resolution in Path tester, and accessible over-limit errors

Design intent:

- Read-only policy is enforced by editor-level input blocking first, with view mode (`preview`) as a fallback/UX layer.
- Optional global preset can force all Markdown notes into read-only after exclude rules are considered.
- Exclude rules always override both the global preset and include rules.
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
- A CM6 `changeFilter` rejects document changes for protected paths, including unannotated context-menu insertions, replacements, deletions, and undo/redo. It reads current matching rules from the transaction's starting editor context rather than relying on cached facets. Selection/effect-only transactions and changes explicitly marked `Transaction.remote=true` pass through. The filter has no view-changing callbacks during transaction construction.
- A highest-precedence `keydown` handler consumes Enter (including modifier combinations) before Markdown keymaps can mutate lists, tables, or code blocks. It checks current rules against the editor's own `editorInfoField`, including hover editors without a workspace leaf; other keys and unprotected editors pass through.
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
2. If `useGlobPatterns=true`: anchored dynamic-programming glob matching, without backtracking regexes.
   - For pattern length P and normalized path length N, matching takes O(P × N) worst-case time and O(N) scratch space; compiled tokens take O(P) space. Each token advances a row of reachable path offsets, so even short repeated-wildcard patterns cannot cause exponential exploration.
   - Fixed literal ends are checked directly; literal runs scan candidate positions and rows skip unreachable leading offsets to keep common long-path matches cheap.
   - Preserves `*`/`?` within segments, `**` across segments, optional directories in `/**/`, UTF-16 code-unit matching, and the old regex dot's exclusion of line terminators for `**`. Normalization, case handling, prefix mode, and Exclude precedence are unchanged.
   - Compiled glob entries are cached with fixed FIFO cap (`512`). Existing source-input length and rule-count caps are unchanged; the polynomial bound is not a fixed wall-clock guarantee for arbitrarily large inputs.
   - Adversarial tests exercise `matchPath` and compiled Include/Exclude rules in a child process with a parent-enforced 5-second timeout and SIGKILL. Node APIs are confined to tests.
3. If `useGlobPatterns=false`: literal prefix mode with optional folder slash hint.
4. Advanced sources are resolved before matching:
   - Obsidian URL entries target one exact existing Markdown file
   - absolute file entries target one exact existing Markdown file; absolute folder entries retain ordinary vault-path matching semantics
   - an ordinary vault path without a trailing slash, wildcard, or extension resolves to an existing `<path>.md` note when present
   - an ordinary vault path matching an existing folder is normalized with a trailing slash; explicit folder paths and glob-bearing vault paths retain their normal prefix/glob semantics
   - unresolved entries are retained for correction but omitted from runtime matching and rule limits
5. `buildRuleState` filters unresolved, overlength, and disabled entries before applying the hard-cap policy. Matcher specs retain the selected entry identity/source kind; published effective paths and Explorer/Path tester results use that same selection. Matcher cache keys include entry validity. Hard-cap policy:
   - include is capped first (`200`)
   - exclude is capped second (`300`)
   - if total still exceeds `400`, exclude tail is trimmed first (include priority)
6. If an exclude rule matches, the `.md` path remains editable.
7. Otherwise, if `forceAllMarkdownReadOnly=true`, the `.md` path is treated as read-only.
8. Otherwise, an include rule must match.

### D. Settings UX flow

UI module split:

- `src/settings-tab.ts` owns only top-level composition of settings UI sections.
- `src/settings-general.ts` owns the Enabled control, `aria-pressed` mode buttons, and persistence side effects.
- `src/settings-rule-editor.ts` owns the unified Path rules table and debounced save helper.
- `src/settings-focus.ts` owns stable focus capture, restoration, and first-control focus.
- `src/settings-ui-state.ts` owns the pure summary/warning calculation used by the rules section.
- `src/settings-path-tester.ts` owns the path tester section.
- `src/settings-welcome.ts` owns the first-install welcome modal.
- `src/source-input-limits.ts` owns accepted source lengths, overflow state, and display truncation.
- `src/rule-diagnostics.ts` provides pure helpers used by settings UI (rule diagnostics + path tester computations).

- Welcome modal:
  - shown only when plugin data is absent on load; existing data marks an update or restart
  - updates, re-enabling, and Obsidian restarts do not trigger it
  - buttons, Escape, and the close control save the current dismissal version through one idempotent path
  - action buttons use separated 44 px targets and inset focus indicators to avoid visual overlap
- Settings layout keeps the header, combined Enabled/mode card, Path rules, and Path tester workflow permanently visible. `Matching` and `Debug flags` remain inline collapsible sections with ephemeral open state in both renderers.
- On Obsidian 1.13+, `Read-only behavior` is one custom declarative item with `Enabled` and `Mode` search aliases, preserving the legacy two-card composition instead of allowing the host to split those controls into separate blocks.
- Obsidian 1.13+ renders the complete settings stack through one custom item inside one heading-free group. The plugin therefore owns every inter-card gap directly; Obsidian cannot insert declarative section spacing between Mode, Path rules, Path tester, and Advanced. The scoped wrapper reset removes host borders/backgrounds, all cards remain full-width, and the stack uses the compact `--size-4-2` gap on desktop and narrow layouts. Path rules adds one extra `--size-4-2` top margin, making only the Mode-to-Path-rules separation twice the base gap.
- The Advanced declarative item exposes both section names and all five control names as search aliases; its custom `render` callback preserves the plugin-owned accordion controls and their persistence side effects.
- Obsidian versions before 1.13 use the legacy `display()` path, so the supported runtime baseline remains 1.10.3.
- Header card:
  - title `Read Only View`
  - subtitle `Read-only behavior`
  - support copy for the primary workflow
  - `Active rules: N` badge
  - global warning pill when all-Markdown mode is enabled
- Mode card:
  - `Enabled`
  - two mutually exclusive button choices backed by persisted `forceAllMarkdownReadOnly`; the selected button exposes `aria-pressed=true`
  - visible priority copy:
    - exclude rules always win
    - priority order is exclude -> all-Markdown mode -> include
- Path rules section:
  - permanent workflow card rather than a disclosure
  - unified include/exclude table with a compact rule summary
  - table-style rule rows with columns:
    - enabled (persisted per-rule state; disabled rules are retained but not matched)
    - type
    - value
    - delete
  - one value field auto-detects vault paths, Obsidian URLs, and system paths
  - input guards allow up to 40,000 characters for paths and 120,000 for percent-encoded Obsidian URLs; overflow is blocked before resolution/persistence and exposed with an accessible invalid state
  - imported sources and normalized vault note/folder paths show their resolved vault path or a specific inline error without rewriting the active input
  - all-Markdown mode visually marks every include row as inactive, excludes includes from active counts and diagnostics, and preserves each include rule's persisted enabled state
  - exclude rows remain active in all-Markdown mode unless individually disabled
  - changing a row between include and exclude updates it in place; the type selector is not recreated or programmatically refocused, preventing the native mobile picker from reopening
  - add-rule button
  - zero rules is a valid editor state; deleting the final row does not create a placeholder or empty-line diagnostic
  - inline syntax help and README link
  - rule usage summary
  - warning banners and diagnostics
- Path tester section:
  - permanent workflow card rather than a disclosure
  - include matches
  - exclude matches
  - preset override note when the all-Markdown preset is driving the final result
  - final `READ-ONLY ON/OFF`
  - visible `Read-only` / `Editable` status pill
  - accepts all three source formats and displays detected source plus resolved vault path
  - system-folder inputs show their resolved vault folder and prompt for a concrete note when match diagnostics are needed
  - long resolved values and matched-rule labels are display-truncated to keep settings usable without changing accepted input
- Advanced section:
  - `Show protection indicators` (first control; off by default)
  - `Matching`
    - `Use glob patterns`
    - `Case sensitive`
  - `Debug flags`
    - `Debug logging`
    - `Debug: verbose paths`
    - warning text about full path exposure in console logs
- At viewport widths up to `800px`, settings use the stacked narrow-screen layout. This covers portrait tablet settings panes as well as phones, preventing card headers and rule-table columns from squeezing neighboring content.
- The `Matching` and `Debug flags` disclosure buttons override mobile host button geometry: they use content-driven height, wrapped text, and the parent card outline instead of a nested pill shape. Open sections add a divider below the disclosure header.
- Settings toggles are rendered with plugin-owned layout rows backed by `ToggleComponent`.
- Settings controls expose explicit keyboard/ARIA semantics. Opening the plugin settings page focuses its first control, while stable focus keys preserve the active control across full-page and rule-row rerenders.
- Mode choices use mutually exclusive `aria-pressed` buttons so both choices participate in sequential Tab navigation and support native Enter/Space activation.
- Path-rule help is a single external-link focus target (icon plus label), with visible focus and Enter/Space activation.
- Advanced disclosure headers use a full-width inset focus indicator that remains visible inside the clipped card, plus `aria-expanded`/`aria-controls`; arrow glyphs are decorative.
- `Debug: verbose paths` toggle allows full file paths in debug logs; default keeps paths redacted
- Advanced defaults enable only `Case sensitive`; Explorer indicators, glob matching and both debug flags are disabled.
- Persisted settings schema:
  - `showExplorerProtectionIndicators: boolean` (default `false`)
  - `forceAllMarkdownReadOnly: boolean`
  - `includeRules: string[]`
  - `excludeRules: string[]`
  - `includeRuleEnabled: boolean[]` (index-aligned; missing entries migrate to `true`)
  - `excludeRuleEnabled: boolean[]` (index-aligned; missing entries migrate to `true`)
  - `includeRuleEntries?: RuleEntry[]` and `excludeRuleEntries?: RuleEntry[]` are the source-aware schema
  - legacy string/enabled arrays remain canonical runtime mirrors and migration/rollback compatibility data
  - `RuleEntry` contains `sourceKind`, `sourceValue`, `resolvedPath`, and `enabled`
  - successful absolute file/folder imports store only the resolved vault path in `sourceValue`; full local paths are not persisted
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
  - saving include/exclude rule changes preserves the explicitly selected mode
- Diagnostics rendering:
  - warnings are attached inline to each rule row where practical
  - aggregate diagnostics still render in a local scrolling panel
  - ignored line marker (`Ignored due to rule limit.`) still comes from the same cap logic
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
  - `obsidian` compile-time API types are pinned to `1.13.1` so the settings tab can expose declarative definitions
  - `minAppVersion` remains `1.10.3`; APIs introduced after that baseline must have an explicit legacy path or runtime guard
  - version updates are explicit and validated with full lint/test/build and runtime smoke checks

Generated artifacts (not source of truth):

- `main.js`
- `build-tests/`

## 4) Known Gotchas

- `build-tests/` is generated by tests and can pollute lint if ignored patterns/config are changed.
- `tests/helpers/prepare-obsidian-runtime.mjs` rewrites extensionless local imports in `build-tests/src/*.js`; update it if the test runtime layout changes.
- `ensurePreview` uses `setViewState` with `{ replace: true }` and fallback call style; API behavior can differ across Obsidian versions.
- Editor-level protection assumes the target markdown context is CodeMirror-backed and exposes `editorInfoField`.
- CM6 transactions with `filter: false` bypass the change guard by API design, as do state replacements; this is not a security boundary. External refreshes that use ordinary unannotated transactions are blocked, so compatibility with Obsidian's file-refresh behavior requires manual verification.
- Matching is intentionally limited to `.md`; attachments and other extensions are untouched.
- New absolute paths can be resolved only with desktop `FileSystemAdapter`; already resolved entries remain portable on mobile.
- Advanced imports require the target note or folder to exist when first imported and do not track later renames.
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

## Documentation responsibilities

- `README.md` is the user landing page: installation, first rules, common examples, Path tester, commands, limitations, and links to full guides. Its `rule-examples` HTML anchor preserves the existing settings help link.
- `docs-site/docs/` and `docs-site/guides/` contain advanced user behavior, including matching, source resolution, Lock/Unlock, and context-menu diagnostics.
- `CONTRIBUTING.md` owns development workflows and Star History maintenance; demo setup details remain in `docs/DEMO_VAULT.md`.
- This system map retains editor enforcement, remote transaction handling, settings layout, and focus-management details rather than repeating them in the README.

## Public documentation website

- `docs-site/` contains the VitePress homepage, five workflow guides, Path rules, Path tester, and FAQ. It documents the checked-in behavior rather than claiming a latest release version.
- `docs-site/.vitepress/config.ts` owns navigation, the `/Read-Only-View/` base, sitemap, canonical URLs, Open Graph metadata, and homepage SoftwareApplication JSON-LD.
- Screenshots are imported from `docs/images/community-images/`; there are no duplicated source assets.
- Root npm scripts: `docs:dev`, `docs:build`, `docs:preview`. Website dependencies are development-only and locked in `package-lock.json`.
- `.github/workflows/pages.yml` builds PRs against `master` and deploys `master` to GitHub Pages. Plugin CI, releases, and runtime behavior are unchanged.
- Setup, validation, and the project-site robots.txt limitation are documented in `CONTRIBUTING.md`.

The public guides explicitly cover all-Markdown mode versus Include `**`, a single editable note inside a protected folder, retained disabled rules, supported path sources, Path tester, wildcards, and case sensitivity. Question-based headings and FAQ answers link to concrete setup examples.

Additional public examples cover an all-Markdown vault with editable Daily Notes and Inbox folders, and direct-child folder matching with `Reference/*.md`. `docs-site/docs/troubleshooting.md` diagnoses unexpected read-only/editable results and links to Path tester; navigation, homepage, and FAQ expose these workflows.

Website dependency security: `package.json` scopes a Vite `^6.4.3` override to VitePress. VitePress 1.6.4 otherwise restricts Vite to 5.x, blocking Dependabot security updates and retaining vulnerable esbuild 0.21.x. The nested Vite esbuild override references `$esbuild`, reusing the root 0.28.1 pin to meet Dependabot's reported minimum fixed version; Vite 6 alone would retain esbuild 0.25.x. The overrides leave the plugin build dependency unchanged; recheck dev/production website behavior on upgrades and remove it once a stable VitePress release provides patched dependencies natively.

The website build explicitly targets Safari 14.1 rather than Vite 6's default Safari 14, avoiding esbuild 0.28's unsupported destructuring lowering for older Safari. Chrome 87, Edge 88, Firefox 78, and ES2020 targets are retained; plugin runtime compatibility is unchanged.

## Star History analytics (2026-10-01)

This is repository/site tooling, separate from the Obsidian runtime. Python 3.11+ standard-library scripts fetch only GitHub aggregate `/stargazers/history` and `/stargazers/count` endpoints (API version `2026-03-10`). No stargazer listing or identity data is requested.

Pipeline: GitHub aggregate API → `scripts/update_star_history.py` → `docs-site/public/data/star-history.json` → offline `scripts/build_star_analytics.py` → ignored VitePress generated JSON → SVG dashboard at `/star-history`.

`scripts/star_history/` separates API transport, validated normalization/atomic storage, and pure analytics. The JSON schema version is 1, with repository/updated_at metadata and separate `reconstructed` and `snapshots` series. Each point has date/stars/delta; the first delta is null. Reconstruction is cumulative API daily counts, not historical measured totals. Snapshots are collected in UTC, replace only the same date, and allow negative net changes. Missing dates are preserved as gaps. Repeated identical responses do not change the file or timestamp.

`events.json` is manually maintained and starts empty; `events.schema.json` documents date/type/title and the five supported types. Analytics use only snapshots: exact 7/30-day boundary differences, elapsed-day average, best adjacent-calendar-day change, and event-date −2 to +1 difference. Insufficient data yields null. Star growth around an event is an observational metric and does not establish that the event caused the change.

The updater runs at 03:17 UTC daily or manually on master, scoped to the upstream repository, with contents:write only for its update job. It commits only changed history with the existing conventional-commit style. A successful updater triggers Pages through workflow_run; Pages checks upstream repository, branch and successful completion and checks out current master. Builds remain offline, including PRs. Website builds/dev now require Python; no runtime matching or plugin dependencies changed.

Validation: pytest mock tests in `tests/star_history/`, Ruff with scoped configuration in `pyproject.toml`, locked development tools in `uv.lock`, an independent CI job, and existing plugin/site checks. API failures never overwrite the saved history. Weekly pagination must finish within 100 pages; missing/overlapping weeks, conflicting duplicate counts, malformed documents and invalid values are rejected. Boundaries from GitHub may differ from UTC and reconstructed history may be revised; the dashboard explains both limitations.

## Settings change lifecycle (ticket 004)

- `src/settings-lifecycle.ts` owns optimistic publication, isolated persistence snapshots, serialization, and rollback for Settings, context-menu actions, enable/disable commands, and welcome dismissal. Callers submit replayable draft mutations through `changeSettings`; `saveSettings(snapshot)` is the storage boundary only.
- Each host retains its last committed snapshot and ordered pending mutations. On a failed write, the failed mutation is removed and later mutations are replayed against committed state. Settings keep their object identity, and matcher/Explorer/editor consumers receive the restored state before the failed request settles. An already-open Reading view is not switched back to editing automatically.
- `settingsChanged` advances an explicit rules revision only when matching inputs change. Matcher reads compare numeric revisions without traversing or serializing rules. Debug and Explorer-visibility changes do not rebuild the matcher.
- Submitted rule-editor drafts and save status survive UI refreshes during the same Settings session, including completion of older writes after a replacement editor mounts. Closing Settings ends that draft session. Retrying the same context-menu action flushes the existing draft. Debounce remains unchanged: closing/rerendering Settings cancels unsent debounce work, while in-flight saves and requested menu flushes finish after closure.
- Regression coverage uses real plugin lifecycle, matcher, enforcement, and Explorer code with controlled storage and host boundaries. It covers overlapping Settings/menu edits in both orders, rollback, retries, and closing both supported Settings branches during saves.
- No CSS, DOM layout, ordering, or disclosure defaults changed. Mock-host Settings tests cover both branches, focus, and disclosure state. Live visual comparison in light/dark themes at desktop/mobile widths was not performed; native Obsidian keyboard/accessibility behavior remains manual QA.
