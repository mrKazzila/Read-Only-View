# Test coverage audit

Last updated: 2026-09-16

## Current automated coverage

### Strong unit and integration coverage

- Matcher and rule behavior
  - prefix and glob semantics, normalization, case sensitivity, and exclude precedence
  - compiled matcher cache behavior and long-path/wildcard stress cases
- Persisted settings
  - safe merge and fallback behavior for malformed values
  - source-aware rule migration, enabled state, onboarding version, and all-Markdown mode
- Rule-source resolution
  - vault-relative paths, `obsidian://open` URLs, and absolute system file/folder paths
  - vault containment, exact-note validation, unresolved sources, and privacy-safe portable persistence
- Input limits
  - path and encoded-URL limits, blocked overflow, display truncation, and accessible invalid state
- Rule diagnostics and limits
  - suspicious input, effective-rule caps, ignored rows, and Path tester result computation
- Unified rule editor
  - include/exclude row rendering, enabled/type/value/delete controls, save lifecycle, and zero-row state
  - inactive include presentation in all-Markdown mode and rule diagnostics
- Settings accessibility and focus
  - `aria-pressed` mode choices, disclosure ARIA contracts, keyboard activation, and stable focus restoration after rerenders
  - Path tester rendering and welcome/settings-opening logic
- Editor, enforcement, and orchestration
  - read-only editor extensions, interaction callbacks, queues, throttling, fallback paths, cleanup, and workspace-event coalescing
  - plugin lifecycle, matcher rebuilds, observer wiring, paste/drop blocking, and popover candidate handling

### Desktop E2E smoke coverage

- Obsidian startup with the generated `demo-vault` and plugin activation
- Reading-view enforcement for an ordinary protected note
- Editable behavior for an excluded note and `Inbox/Idea parking lot.md`
- Protection for exact notes imported from an Obsidian URL and a desktop system path
- Path tester resolution for an Obsidian URL and a copied system-folder path
- Accessible handling of an over-limit Path tester input, including capped value, error text, and `aria-invalid`

## Important gaps

- Complete real-app traversal of the **Mode**, **Path rules**, and **Advanced** settings workflow
- Welcome modal rendering and interaction in a real desktop session
- Mobile and tablet runtime behavior, including responsive layout and portable imported rules
- Hover preview, popover, cross-window, and pop-out behavior in a live renderer
- File-explorer-driven navigation paths
- Regressions caused by future Obsidian UI or internal API changes

## What should stay as unit tests

- Matcher semantics, normalization, and rule precedence
- Rule-source resolution, privacy-safe persistence, and input limits
- Rule-limit calculations and persisted-settings migration
- Debounce, focus restoration, cleanup, and lifecycle logic
- Pure settings state, diagnostics, and accessibility contracts
- Popover filtering and enforcement decision helpers

These behaviors are deterministic, fast to exercise, and easier to maintain in isolation than through UI automation.

## What should remain E2E-focused

- Launching desktop Obsidian with the repo-generated synthetic vault
- Verifying the plugin is enabled and real notes settle in the expected mode
- Exercising source resolution through the actual settings DOM
- Checking packaged-app integration across real workspace timing and leaf behavior

## Recommended next tests

- Add one stable end-to-end settings workflow spanning mode selection, rule-row changes, Path tester, and Advanced settings.
- Add welcome-modal coverage when its one-time state can be reset reliably.
- Add one hover or popover smoke check only if selectors and timing can remain stable.
- Keep mobile and tablet behavior in manual QA until a reliable Obsidian mobile automation path exists.

The WebdriverIO suite should stay smoke-oriented: expand it where a real Obsidian session proves behavior that mocks cannot, not for every deterministic UI helper.
