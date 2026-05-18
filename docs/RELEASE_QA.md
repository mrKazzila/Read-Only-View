# Release QA

Manual QA checklist for the next plugin release.

## Desktop settings tab

- Open **Settings -> Read Only View** on Obsidian desktop `1.10.3`.
- Verify all toggles render and persist without layout overlap.
- Edit include/exclude rules and confirm debounce status changes: `Saving...` -> `Saved.`.
- Confirm diagnostics panel scrolls locally and long warning text wraps.
- Confirm path tester wraps long paths/results without horizontal overflow.

## Mobile settings tab

- Open the settings tab on Obsidian mobile `1.10.3`.
- Verify textarea/input controls remain readable and usable on a narrow screen.
- Confirm diagnostics and path tester remain scrollable/readable without clipping.
- Confirm touch targets for plugin-owned inputs remain comfortable in the native mobile layout.

## Keyboard and focus

- Tab through all interactive controls in the settings tab on desktop.
- Confirm the focused control is always visible and uses Obsidian focus styling.
- Confirm textarea and path tester input remain operable without a mouse.

## Popout and hover behavior

- Open matching notes in normal workspace leaves and confirm they return to Reading mode.
- Trigger popout/hover/popover note contexts and confirm matched notes are still forced back to preview.
- Repeat rapid leaf/layout changes and watch for delayed enforcement or visible jank.
