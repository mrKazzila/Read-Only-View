# PROJECT_STATE

Last updated: 2026-10-27

Current system map for the `read-only-view` Obsidian plugin.
This document describes implementation and constraints; development procedures
live in [CONTRIBUTING](../CONTRIBUTING.md).

## Product and compatibility

- Keeps Markdown notes in Reading view and blocks accidental editor changes.
- Supports desktop and mobile; `manifest.json` declares Obsidian 1.10.3+.
- Repository package and manifest versions are 1.1.3. These describe the checkout,
  not an independently verified latest published release.
- Obsidian API types are pinned to 1.13.1. Settings use declarative definitions
  on 1.13+ and retain the legacy renderer for 1.10.3–1.12.x.
- Plugin matching and enforcement run locally without network requests.
  Website builds and GitHub analytics are separate repository tooling.
- Protection is an editor safeguard, not filesystem permissions or a security boundary.

## Behavior and defaults

Fresh installations enable protection in **All Markdown files** mode.
Matching is case-sensitive and uses literal prefixes by default.
Include and Exclude lists start empty; Explorer indicators, glob matching,
and debug flags are off.

Protection decisions follow this order:

1. Disabled plugin or non-Markdown file: editable.
2. Matching enabled Exclude: editable.
3. All Markdown files mode: protected.
4. Matching enabled Include: protected.
5. Otherwise: editable.

Disabled rules remain stored. All-Markdown mode preserves Include rules and their
enabled states while presenting them as inactive in Settings.

Commands retain these IDs:

| ID | Purpose |
| --- | --- |
| `toggle-plugin-enabled` | Toggle protection |
| `enable-plugin` | Enable when disabled |
| `disable-plugin` | Disable when enabled |
| `re-apply-rules-now` | Immediately reapply rules to open Markdown leaves |

## Module map

All paths below are relative to `src/`.

| Area | Modules and responsibilities |
| --- | --- |
| Composition | `main.ts`: plugin lifecycle, host event wiring, service composition, matcher revision/cache |
| Commands | `plugin-commands.ts`, `command-controls.ts`: registration, availability, enabled-state transitions |
| Editor protection | `editor-readonly.ts`: CodeMirror facets, transaction filtering, keyboard and interaction guards |
| Reading view | `enforcement.ts`: preview transitions, throttling, stale-work checks, cleanup |
| Workspace observation | `workspace-events.ts`, `popover-observer.ts`: event coalescing, multi-document observers, leaf lookup cache |
| Window ownership | `window-ownership.ts`: scheduling and cancellation through the originating window |
| Rule model | `plugin-types.ts`, `plugin-settings.ts`, `rule-state.ts`: types, defaults, migration, canonical entries and projections |
| Matching | `matcher.ts`, `path-utils.ts`, `rule-limits.ts`, `constants.ts`: normalization, compiled decisions and effective-rule caps |
| Source resolution | `rule-source.ts`, `source-input-limits.ts`: vault paths, Obsidian URLs, system imports and input limits |
| Settings persistence | `settings-lifecycle.ts`: optimistic state, serialized saves, rollback and replay |
| Settings UI | `settings-tab.ts`, `settings-general.ts`, `settings-rule-editor.ts`: composition, controls, rule drafts and saves |
| UI support | `settings-focus.ts`, `settings-ui-state.ts`, `debounced-render.ts`: focus, summaries and deferred rendering |
| Diagnostics | `rule-diagnostics.ts`, `settings-path-tester.ts`: shared rule diagnostics and Path tester |
| Context menu | `path-context-menu.ts`, `note-rules.ts`, `folder-rules.ts`: Lock/Unlock and rule transformations |
| Explanation | `read-only-explanation.ts`, `read-only-status-modal.ts`: note/folder status and native modal |
| Explorer | `explorer-indicators.ts`: optional visual protection indicators |
| Onboarding/debug | `settings-welcome.ts`, `debug-log.ts`: first-install welcome and path redaction |

`styles.css` owns plugin styling. `main.js` is generated from `src/main.ts`.

## Rules and matching

### Canonical state

`RuleEntry` stores `sourceKind`, `sourceValue`, `resolvedPath`, and `enabled`.
Nonempty source-aware entry lists are authoritative; empty or absent lists fall
back to legacy string/enabled arrays.

`rule-state.ts` owns loading, migration, validation, compatibility projections,
and effective selection. Legacy enabled flags are read at their original indexes
before malformed entries are filtered. Compatibility arrays remain serialized,
but are not a second independent source of truth.

Unresolved, overlength, and disabled entries do not consume effective-rule limits.
Include is capped at 200, Exclude at 300, and the combined total at 400.
If the combined cap is exceeded, the Exclude tail is trimmed first.
Warnings start above 50 and 150 effective rules per list.

### Source formats

- Vault-relative paths use prefix or glob semantics. Existing extensionless note
  paths can resolve to `<path>.md`; existing folders gain a trailing slash.
- `obsidian://open` imports identify one exact existing Markdown note.
- Absolute file imports identify one exact existing Markdown note; absolute
  folder imports retain ordinary folder matching semantics.
- New absolute imports require desktop filesystem access and current-vault
  containment. Successful imports persist only portable vault-relative paths.
- Imported targets must exist when resolved. Rules do not automatically follow
  later renames or deletions.
- Path input is limited to 40,000 characters and Obsidian URL input to 120,000.
  Display truncation does not change accepted values.

### Matcher

Prefix mode treats `*` and `?` literally. Glob mode supports `*` and `?` within
segments, `**` across segments, and optional directories in `/**/`.

Glob matching uses dynamic programming with O(pattern length × path length)
worst-case time and O(path length) scratch space. Compiled glob objects have a
512-entry FIFO cache. `compileGlobToRegex` retains its legacy name and `.test`
interface but does not return a `RegExp`.

The plugin caches a compiled rule matcher behind a revision counter.
`settingsChanged` advances the revision only when matching inputs change;
ordinary matcher reads do not serialize or traverse the rule configuration.
Debug and Explorer-visibility changes do not rebuild matching rules.

Enforcement, Explorer indicators, Path tester, and explanations use the same
effective rule selection and matching semantics.

## Enforcement and lifecycle

On load, the plugin loads settings, initializes optional Explorer indicators,
registers the editor extension, commands and host events, starts popover
observation, adds Settings, and applies rules to open Markdown leaves.
The welcome modal is offered only when persisted plugin data was absent.

### Editor guard

The CodeMirror extension resolves the editor's own file through `editorInfoField`.
Protected paths receive `EditorState.readOnly=true` and `EditorView.editable=false`.

A change filter rejects document edits, including unannotated insertions,
replacements, deletions, and undo/redo. Selection/effect-only transactions and
explicit `Transaction.remote=true` updates pass through.

A highest-precedence Enter handler prevents Markdown keymaps from editing
protected content. Paste/drop host events are also guarded. Pointer/focus
interaction requests a return to Reading view. Settings changes reconfigure
existing editors through `workspace.updateOptions()`.

### Preview transitions

Workspace file-open, active-leaf and layout events are coalesced over 150 ms.
File-open/active-leaf batches target the affected leaf; layout changes trigger a
full pass. Manual reapply bypasses this scheduler.

`EnforcementService` serializes passes and throttles preview writes per leaf:
120 ms normally and 700 ms for layout changes, with trailing layout retries.

Before each frame-deferred write and fallback, it rechecks the original view/path,
current protection decision, Markdown state, and workspace membership.
Navigation, disable, exclusion, leaf closure, or unload invalidates stale work.
Transitions preserve current view metadata; `setViewState` has a fallback
from `{ replace: true }` to the boolean call form.

Popover observation tracks relevant documents, filters `.hover-popover` and
`.popover` candidates, batches mutations, and caches container-to-leaf lookup.
Layout changes and unload invalidate that cache.

Unload stops controllers, observers, pending retries and animation frames.
Window-owned scheduling helpers cancel work through its originating window.

## Settings lifecycle and UI

All settings mutations enter `changeSettings`; `saveSettings(snapshot)` is the
storage boundary. Mutations must be replayable and affect only their draft.

Changes publish optimistically while persistence runs in order with isolated
snapshots. On a failed write, the failed mutation is removed and later mutations
are replayed over the last committed state. Settings retain object identity;
matcher, Explorer and editor consumers receive the restored state.
Removing protection does not automatically switch an existing Reading view
back to editing.

Both Settings renderers share the same section implementations. The declarative
renderer uses one custom item in a heading-free group, with search aliases,
so the plugin controls its card layout. The legacy renderer remains supported.

- Header, Enabled/mode, Path rules, and Path tester remain visible.
- Advanced contains Explorer indicators and collapsible Matching/Debug sections.
- Narrow layouts stack controls at widths up to 800 px.
- Stable focus keys preserve focus across rerenders; mode buttons and disclosures
  expose keyboard/ARIA state.
- The rule editor caches one resolution/diagnostics/save snapshot per revision.
  Rendering and saving reuse it.
- Rule edits save after 400 ms; blur/change flush immediately.
- Submitted drafts and save status survive rerenders within the Settings session.
  Closing ends that session and cancels unsent debounce work; in-flight saves
  and requested context-menu flushes can finish after closure.
- A zero-row rule list is valid. Diagnostics advise rather than block ordinary saves.
- Welcome dismissal uses the shared persistence lifecycle and an idempotent path.

## Context menu and Explorer

The public `file-menu` hook provides **Lock → Reading**, **Unlock**, and
**Explain read-only status** for supported targets.

Note locking creates or reuses an exact Include through the existing source
resolver. Folder locking uses `Folder/` in prefix mode or `Folder/**` in glob
mode. Unlock disables equivalent Include entries without deleting them;
ancestor rules, Excludes and global mode still determine final protection.
Root folders cannot be locked/unlocked.

When Settings is open, menu edits join the active rule-editor draft and save
flow. Otherwise they submit through `changeSettings`. Failed saves restore the
previous committed rule state.

Explain is read-only: it neither saves settings nor reapplies enforcement.
Folder diagnostics traverse loaded `TFolder.children`, count nested Markdown
notes, aggregate matched rules, and show at most five editable examples.
Post-save notices reuse that traversal lazily and stop once their answer is known.
The status dialog uses native modal closing behavior, including mobile dismissal.

Explorer indicators are optional and visual only. Folder locks describe matching
scope; they do not guarantee that every descendant is protected.

The controller observes Explorer containers and indexes rows by path/ancestors.
Create/delete/rename, DOM changes and matcher revisions update affected rows
without a full-vault traversal. Disable/unload removes icons and listeners.
Undocumented Explorer selectors are isolated here; unsupported markup is skipped.

## Build and validation

`Justfile` imports shared recipes from `just/`; ignored `just/local.just` is
optional machine-specific configuration.

- `just check`: production build, Node tests, lint, Obsidian Community preflight.
- `just lint-obsidian`: runtime typecheck plus dedicated scanner-oriented ESLint.
- `tsconfig.runtime.json` uses `types: []` to prevent automatic development types
  from masking unsupported runtime APIs.
- Preflight rejects inline ESLint configuration, unsafe type operations, and
  warnings. It runs separately in plugin CI and release workflows.
- `npm test` compiles into `build-tests/`, prepares the Obsidian stub/imports,
  then runs Node's test runner.
- esbuild produces a CommonJS ES2018 bundle; Obsidian and CodeMirror host modules
  remain external.

Integration tests use plugin construction, persisted fixtures, `onload`,
host events/commands, `changeSettings`, and unload. Algorithms are tested through
service interfaces rather than private plugin fields or methods.
`withPluginHost` in `tests/helpers/test-setup.ts` restores mocks after unloading,
including assertion failures.

Desktop E2E is opt-in through `npm run test:e2e`.
It rebuilds the plugin, recreates synthetic `demo-vault`, and launches Obsidian
with a dedicated profile under `.tmp/obsidian-e2e-profile`.
Exact vault-path guards protect fixture operations.
Use Node 22 and the instructions in [E2E testing](E2E_TESTING.md).

Previously recorded verification on 2026-10-08 included lint/test/build and
11 desktop smoke checks on Obsidian 1.14.4 / Electron 32.2.5. A separate Settings
comparison covered declarative desktop/narrow layouts in light/dark themes.
These are historical results, not validation of every later change.

Mocks and narrow desktop captures do not establish real mobile/popout behavior.
Legacy Settings, keyboard/focus, welcome flows, and broader editor interactions
still need applicable host checks. See [Release QA](RELEASE_QA.md) and
[compatibility matrix](compatibility-matrix.md); check their dates when using them.

## Local development

- `just demo <version>` builds and refreshes synthetic `demo-vault`.
- `just demo-reset <version>` rebuilds and recreates that fixture.
- `just demo-no-plugin` creates the fixture without installing the plugin.
- `just link-plugin` attaches an existing build, linking `main.js` and optional
  `styles.css` while writing a vault-local DEV manifest.
- `just unlink-plugin` removes the local plugin installation and enablement entry,
  preserving vault notes.
- DEV and release installs share the same plugin ID and cannot coexist in one vault.
- Optional mobile copy recipes belong in ignored `just/local.just`.
  Their template is `just/local.example.just`; personal paths stay out of shared files.

See [demo vault setup](DEMO_VAULT.md) for installation details.
Generated bundles, test output, demo vault, temporary QA artifacts, and VitePress
output are not source files.

## Public documentation website

`docs-site/` is the VitePress site; `docs/` holds internal project documentation.
The site includes workflow guides, rule documentation, Path tester,
troubleshooting, FAQ, Star History, and Download History.

`docs-site/.vitepress/config.ts` owns navigation, `/Read-Only-View/` base,
sitemap, canonical/social metadata and homepage structured data.
Preserve existing routes and explicit anchors, including README's `rule-examples`
anchor used by Settings help.

- `just docs-dev` / `npm run docs:dev`: generate offline analytics and start VitePress.
- `npm run docs:build`: generate analytics, build the site and validate HTML.
- `npm run docs:preview`: preview the production build.
- Website development/build requires Node 22.18+ and Python 3.11+.

The validator checks sitemap coverage, metadata, H1 counts, indexing restrictions,
local links/fragments, image assets/alt text and homepage reachability.
The project-level robots file cannot replace origin-root crawler policy.

Screenshots shared by README and the site live in `docs/images/documentation/`.
Community listing assets live separately in `docs/images/community-images/`;
originals live in `docs/images/sources/`. Follow [image rules](images/README.md).

VitePress currently has scoped Vite `^6.4.5` and esbuild overrides in `package.json`.
Their rationale and upgrade checks live in CONTRIBUTING.
The site's Safari 14.1 target is separate from plugin runtime compatibility.

Pages builds pull requests and deploys `master`; it also rebuilds after successful
upstream project history updates. Plugin releases use a separate workflow with
lint/preflight/tests/build, tag/manifest/version-entry checks, artifact attestations,
and publication of `main.js`, `manifest.json`, and optional `styles.css`.

## Star History tooling

The pipeline is:

GitHub aggregate API → `scripts/update_star_history.py` →
committed `docs-site/public/data/star-history.json` →
offline `scripts/build_star_analytics.py` →
ignored `.vitepress/generated/star-analytics.json` → site dashboard.

`scripts/star_history/` separates transport, validation/storage, and analytics.
The collector requests aggregate history/count data, not stargazer identities.
Failed collection or validation preserves the previous data; unchanged responses
preserve the file and timestamp.

Two series remain distinct:

- `reconstructed`: cumulative API daily counts, which GitHub may revise;
  these are not measured historical total snapshots.
- `snapshots`: observed totals by UTC collection date, with gaps preserved
  and decreases allowed.

Growth analytics use snapshots. Exact window endpoints are required for 7/30-day
net changes; insufficient data remains null. Manually entered project events
come from `events.json`. Event-associated growth does not establish causation.

The updater runs daily at 03:17 UTC or manually on upstream `master`.
Only its update job has repository write permission. Successful updates trigger
Pages through `workflow_run`; site builds and browser rendering remain offline.

Local checks use `uv sync --locked --group dev`, `uv run pytest`,
`uv run ruff check .`, and `uv run ruff format --check .`.
CI has a separate analytics job. Maintenance details live in CONTRIBUTING.

## Limitations and maintenance

- CodeMirror transactions with `filter: false` and state replacements bypass the
  change filter. Unannotated external refresh transactions can be blocked;
  file-refresh compatibility needs real-host verification.
- Non-CodeMirror hover/embed contexts may not expose a usable editor or leaf.
- Popover and Explorer integration depends partly on undocumented host DOM.
- Absolute-path import is desktop-only; already resolved rules remain portable.
- Debug paths are redacted by default; verbose paths require explicit opt-in.
- Performance counters establish operation counts, not measured host latency.

When behavior changes, update this map, README, and affected public guides.
Keep workflow instructions in CONTRIBUTING and scenario results in the relevant
QA documents. Record the actual app/platform and checks performed; do not treat
mock coverage or historical runs as current host verification.

## Download History tooling

Official Obsidian plugin stats commit history → `scripts/update_download_history.py` →
committed `docs-site/public/data/download-history.json` → offline
`scripts/build_download_analytics.py` → ignored generated analytics → `/download-history`.

`scripts/download_history/` contains collection, provenance validation and calculations.
The first import starts at release 1.0.1; subsequent runs resume from the saved source SHA.
Each UTC date uses its last published file snapshot. Missing entries are omitted, missing
dates remain gaps, and source corrections can produce negative changes. Totals describe
downloads, not people. Exact boundary observations are required for 7/30-day cards.
The shared **Update project history** workflow updates both datasets before Pages deploys.
This tooling is separate from plugin runtime and uses only Python's standard library.
