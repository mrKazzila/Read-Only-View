# Compatibility Regression Matrix

Last updated: 2026-02-23

This document tracks manual compatibility checks for `read-only-view` across Obsidian versions and platforms.
It is intentionally manual-first because several behaviors depend on Obsidian internal DOM/API details.

## Scope

Scenarios covered:

- `file-open` event reapply
- `active-leaf-change` event reapply
- `layout-change` event reapply
- Popover/editor enforcement path (`MutationObserver`)
- Path tester behavior
- Settings toggles behavior
- `setViewState` fallback behavior
- Burst-event UI jank check

## Status Legend

- `PASS`: explicitly verified in real app
- `FAIL`: verified and reproducibly broken
- `REQUIRES_CHECK`: not yet verified in real app
- `N/A`: not applicable for platform/version

## Test Matrix

| Platform | Obsidian Version | Scenario | Status | Notes |
|---|---|---|---|---|
| Desktop | 1.10.3 | `file-open` reapply | REQUIRES_CHECK | Requires real-app validation outside CI sandbox. |
| Desktop | 1.10.3 | `active-leaf-change` reapply | REQUIRES_CHECK | Requires real-app validation outside CI sandbox. |
| Desktop | 1.10.3 | `layout-change` reapply | REQUIRES_CHECK | Requires real-app validation outside CI sandbox. |
| Desktop | 1.10.3 | Popover/editor enforcement | REQUIRES_CHECK | Depends on internal DOM classes in runtime. |
| Desktop | 1.10.3 | Path tester rendering/logic | REQUIRES_CHECK | Requires manual settings UI check. |
| Desktop | 1.10.3 | Toggles (`Enabled`, glob, case, debug) | REQUIRES_CHECK | Requires manual settings UI check. |
| Desktop | 1.10.3 | `setViewState` fallback path | REQUIRES_CHECK | Verify via debug logs (`ensure-preview-fallback`) in real app. |
| Desktop | 1.10.3 | Burst-event jank | REQUIRES_CHECK | Validate rapid tab/layout switching; check visible jitter. |
| Mobile | 1.10.3 | `file-open`/leaf-change behavior | REQUIRES_CHECK | Touch workflow and leaf transitions need real device. |
| Mobile | 1.10.3 | Settings diagnostics readability | REQUIRES_CHECK | Verify capped diagnostics scroll and inline warnings. |
| Mobile | 1.10.3 | Path tester wrapping | REQUIRES_CHECK | Verify long-path wrapping on narrow screens. |
| Tablet (portrait) | 1.10.3 | Settings layout overlap check | REQUIRES_CHECK | Verify textarea/diagnostics/path tester do not overlap. |
| Tablet (landscape) | 1.10.3 | Settings layout overlap check | REQUIRES_CHECK | Verify in split and full-width layouts. |
| Tablet | 1.10.3 | Burst-event jank | REQUIRES_CHECK | Verify with rapid pane switching and layout updates. |

## Manual Checklist

Use this checklist for each applicable platform/version row:

1. Enable plugin and set include rule `**/*.md`.
2. Open several markdown notes and trigger:
   - `file-open`
   - `active-leaf-change`
   - `layout-change`
3. Confirm matched files return to preview mode.
4. Trigger popover/editor contexts and verify enforcement.
5. Validate settings:
   - include/exclude editing, debounce save status
   - diagnostics inline warnings and local scroll
   - path tester long-string wrapping
6. Enable `Debug logging`:
   - verify redacted paths by default
   - enable `Debug: verbose paths` and verify full-path behavior
7. Validate fallback diagnostics:
   - identify `ensure-preview-fallback` log entries when fallback occurs
   - record `errorType`/`errorMessage`
8. Perform burst interactions:
   - rapid tab switches / active leaf changes / layout changes
   - note any visible jank or delayed enforcement

## Fallback Observation Record

Record per platform/version when fallback is observed:

| Platform | Obsidian Version | Fallback Observed | errorType | errorMessage | Notes |
|---|---|---|---|---|---|
| Desktop | 1.10.3 | REQUIRES_CHECK | - | - | Runtime-only scenario, not reproducible in CI. |
| Mobile | 1.10.3 | REQUIRES_CHECK | - | - | Runtime-only scenario, not reproducible in CI. |
| Tablet | 1.10.3 | REQUIRES_CHECK | - | - | Runtime-only scenario, not reproducible in CI. |

## Burst/Jank Observation Record

| Platform | Obsidian Version | Burst Scenario Result | Notes |
|---|---|---|---|
| Desktop | 1.10.3 | REQUIRES_CHECK | Validate event coalescing perception and no visible jitter. |
| Mobile | 1.10.3 | REQUIRES_CHECK | Validate responsiveness during rapid navigation. |
| Tablet | 1.10.3 | REQUIRES_CHECK | Validate portrait/landscape transitions and pane operations. |

## Follow-up Tasks

Create follow-up tasks only when manual checks produce concrete evidence:

1. `FOLLOWUP-COMPAT-POPOVER-<version-platform>`: popover/editor enforcement mismatch.
2. `FOLLOWUP-COMPAT-FALLBACK-<version-platform>`: fallback signature/behavior regression.
3. `FOLLOWUP-UX-JANK-<version-platform>`: confirmed burst-event jank or delayed reapply.
4. `FOLLOWUP-MOBILE-LAYOUT-<version-platform>`: settings readability/overlap regressions.

## Notes

- Current automated tests cover core logic and mock-based observer/enforcement paths, but not full runtime compatibility against real Obsidian UI internals.
- Keep this matrix versioned by date when rerunning checks after Obsidian upgrades.
