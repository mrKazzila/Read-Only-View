# Compatibility regression matrix

Last updated: 2026-09-16

This manual-first matrix tracks runtime compatibility for `read-only-view`. Unit and desktop smoke tests support it, but they do not replace platform checks against Obsidian's UI and internal APIs.

## Status legend

- `PASS`: explicitly verified in the listed real app
- `FAIL`: verified and reproducibly broken
- `REQUIRES_CHECK`: not yet manually verified in the listed real app
- `N/A`: not applicable to that platform/version

## Test matrix

| Platform | Obsidian version | Scenario | Status | Notes |
|---|---|---|---|---|
| Desktop | 1.10.3 | `file-open`, `active-leaf-change`, and `layout-change` reapply | REQUIRES_CHECK | Verify protected notes settle in Reading view. |
| Desktop | 1.10.3 | **Only matched paths** mode | REQUIRES_CHECK | Verify enabled include rules protect only matching Markdown notes. |
| Desktop | 1.10.3 | **All Markdown files** mode | REQUIRES_CHECK | Verify all Markdown notes are protected except enabled excludes. |
| Desktop | 1.10.3 | Exclude priority | REQUIRES_CHECK | Excludes must override the global mode and include rules. |
| Desktop | 1.10.3 | Unified rule rows | REQUIRES_CHECK | Check enabled, type, value, delete, disabled rows, save status, and diagnostics. |
| Desktop | 1.10.3 | Obsidian URL source | REQUIRES_CHECK | Import an existing note and verify exact vault-relative resolution. |
| Desktop | 1.10.3 | Absolute system file/folder sources | REQUIRES_CHECK | Verify containment, file/folder semantics, and portable persistence. |
| Desktop | 1.10.3 | Path tester source resolution and result | REQUIRES_CHECK | Check all three source types, matches, and final status. |
| Desktop | 1.10.3 | Keyboard navigation and focus restoration | REQUIRES_CHECK | Check mode buttons, rows, disclosures, rerenders, and visible focus. |
| Desktop | 1.10.3 | Popover/editor enforcement | REQUIRES_CHECK | Depends on runtime DOM classes and editor contexts. |
| Desktop | 1.10.3 | `setViewState` fallback path | REQUIRES_CHECK | Inspect `ensure-preview-fallback` debug logs if triggered. |
| Desktop | 1.10.3 | Burst-event jank | REQUIRES_CHECK | Check rapid tab and layout changes for jitter or delayed enforcement. |
| Mobile | 1.10.3 | **Only matched paths** and **All Markdown files** modes | REQUIRES_CHECK | Verify touch workflow, persistence, and exclude priority. |
| Mobile | 1.10.3 | Unified rule rows and narrow layout | REQUIRES_CHECK | Check stacked controls, diagnostics, and touch targets. |
| Mobile | 1.10.3 | Obsidian URL source | REQUIRES_CHECK | Verify existing-note resolution without desktop APIs. |
| Mobile | 1.10.3 | New absolute system-path import is unavailable | REQUIRES_CHECK | Confirm a desktop-only source produces the expected unsupported result. |
| Mobile | 1.10.3 | Previously saved portable system-path rule | REQUIRES_CHECK | Verify a resolved vault-relative rule continues to match. |
| Mobile | 1.10.3 | Path tester and keyboard/focus behavior | REQUIRES_CHECK | Check wrapping, status, external keyboard, and visible focus where applicable. |
| Tablet (portrait) | 1.10.3 | Responsive settings layout | REQUIRES_CHECK | Verify cards and rule rows stack without overlap. |
| Tablet (landscape) | 1.10.3 | Responsive settings layout | REQUIRES_CHECK | Verify split and full-width settings panes. |
| Tablet | 1.10.3 | Portable rules, Path tester, and burst-event behavior | REQUIRES_CHECK | Check matching, readability, and rapid pane changes. |

## Manual checklist

Use this checklist for each applicable platform/version:

1. Verify **Only matched paths**, then **All Markdown files**, and confirm the chosen mode persists.
2. Confirm the priority order: enabled exclude rule -> global mode -> enabled include rule.
3. Add include and exclude rows; edit **Type** and **Value**, toggle **Enabled**, delete a row, and verify save status and diagnostics.
4. Test a vault-relative source and an `obsidian://open` URL.
5. On desktop, import an absolute file and folder and confirm no full system path is persisted.
6. On mobile, confirm new absolute paths cannot be resolved while previously saved portable rules still work.
7. Use **Path tester** for each supported source and verify detected type, resolved path, matches, and final status.
8. Navigate all controls by keyboard where available; verify `aria-pressed`, disclosure state, visible focus, and focus restoration after rerenders.
9. Trigger normal, popover, and pop-out editor contexts and verify enforcement.
10. Enable debug logging, verify redaction by default, and inspect fallback diagnostics if a fallback occurs.
11. Repeat rapid tab, leaf, and layout changes and record any jank or delayed enforcement.

## Runtime observation records

| Platform | Obsidian version | Fallback observed | Burst/jank result | Notes |
|---|---|---|---|---|
| Desktop | 1.10.3 | REQUIRES_CHECK | REQUIRES_CHECK | Record fallback error type/message and interaction sequence. |
| Mobile | 1.10.3 | REQUIRES_CHECK | REQUIRES_CHECK | Record device, OS, and navigation sequence. |
| Tablet | 1.10.3 | REQUIRES_CHECK | REQUIRES_CHECK | Record orientation and pane layout. |

## Follow-up tasks

Create a follow-up only when a manual check produces concrete evidence:

1. `FOLLOWUP-COMPAT-POPOVER-<version-platform>`: popover/editor enforcement mismatch.
2. `FOLLOWUP-COMPAT-FALLBACK-<version-platform>`: fallback signature or behavior regression.
3. `FOLLOWUP-UX-JANK-<version-platform>`: confirmed burst-event jank or delayed reapply.
4. `FOLLOWUP-MOBILE-LAYOUT-<version-platform>`: settings readability or overlap regression.

Keep this matrix dated when rerunning checks after Obsidian upgrades. Do not promote a row to `PASS` without a recorded real-app check.
