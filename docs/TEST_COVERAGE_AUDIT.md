# Test coverage audit

Last updated: 2026-06-05

## Current automated coverage

### Strong unit coverage already present

- Matcher and rule behavior
  - prefix mode and glob mode semantics
  - path normalization
  - case-sensitive and case-insensitive matching
  - include and exclude precedence
  - compiled matcher cache behavior
  - long-path and wildcard stress cases
- Persisted settings
  - safe merge of stored plugin settings
  - invalid booleans, invalid arrays, and malformed payload fallbacks
  - onboarding dismissal version fallback
  - all-Markdown preset fallback behavior
- Rule diagnostics and limits
  - suspicious rule warnings
  - empty-line handling
  - effective-rule caps and ignored-line reporting
  - path tester helper result computation
- Editor and enforcement behavior
  - editor read-only extension behavior for matching and non-matching files
  - interaction callback behavior for read-only editor contexts
  - enforcement service queueing, throttle logic, fallback paths, and cleanup
  - workspace-event burst coalescing and targeted-leaf behavior
- Main plugin orchestration
  - onload wiring
  - matcher rebuild behavior
  - observer wiring
  - editor paste and drop blocking
- Settings and onboarding UI logic
  - general settings side effects
  - rules editor debounce and lifecycle
  - settings-tab state preservation and cleanup
  - path tester rendering behavior
  - welcome modal and settings-opening flow
- Popover behavior
  - observer lifecycle
  - popover/editor candidate filtering
  - per-leaf deduplication
  - cache invalidation and detached-popover logging limits

## Important gaps

### Best covered by desktop E2E

- Obsidian desktop startup against a real vault
- Community plugin activation in a real desktop app session
- Real `demo-vault` fixture loading
- Real file opening and leaf activation in desktop Obsidian
- Real Reading-view enforcement after attempting to switch a protected note into source mode
- Real excluded and non-matching note behavior in the packaged app

### Still not fully covered after the initial smoke suite

- File explorer driven navigation paths
- Welcome modal rendering in a real desktop session
- Settings tab interactions in the real app DOM
- Hover preview and popover behavior in a real desktop renderer
- Cross-window or pop-out behavior in the live app
- Desktop-specific regressions caused by future Obsidian UI changes

## What should stay as unit tests

- Matcher semantics and normalization rules
- Include and exclude precedence
- Rule-limit calculations
- Persisted settings merge and fallback behavior
- Debounce, cleanup, and lifecycle logic
- Pure settings UI state helpers
- Popover filtering and enforcement decision helpers

These behaviors are deterministic, fast to exercise, and easier to maintain with isolated tests than with UI automation.

## What should be E2E only

- Launching desktop Obsidian with the repo-generated synthetic vault
- Verifying the plugin is enabled in that vault
- Verifying protected notes actually settle in Reading view in the real app
- Verifying excluded and unprotected notes can remain in source mode in the real app

These behaviors depend on the live Electron application, real workspace timing, and real Obsidian leaf/view behavior that mocks cannot prove.

## Recommended next tests

### Next highest-value E2E additions

- Open a protected archive note such as `Archive/2025/Retrospective.md` and confirm it stays in Reading view
- Exercise one file-explorer-driven open path if a stable selector strategy emerges
- Add one popover or hover-preview smoke check only if it can be made stable

### Keep as unit-first additions

- Any new matcher syntax or normalization rule
- Any settings schema or migration change
- Any new rule-limit policy
- Any new save/debounce behavior in settings editors

## Initial E2E boundary

The first WebdriverIO suite should stay small and smoke-oriented. Broad UI coverage would add more maintenance cost than value for this plugin at its current size.
