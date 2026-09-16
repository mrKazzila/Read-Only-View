# Release QA

Concise manual QA checklist for the next plugin release. Use the detailed release notes only when investigating a failure.

## Desktop settings and rules

- Open **Settings -> Read Only View** on Obsidian desktop `1.10.3` and verify the header, `Enabled` control, active-rule count, and mode buttons render correctly.
- Switch between **All Markdown files** and **Only matched paths**. Confirm the selected mode persists and the buttons expose the correct `aria-pressed` state.
- In **Only matched paths**, confirm enabled include rules protect matching notes and non-matching notes remain editable.
- In **All Markdown files**, confirm every Markdown note is protected unless an enabled exclude rule matches it.
- Confirm exclude rules take priority over both the global mode and include rules.
- In the unified **Path rules** table, verify every row exposes **Enabled**, **Type**, **Value**, and **Delete** controls.
- Disable an include and an exclude row without deleting them; confirm each disabled rule is retained but no longer participates in matching.
- Add, edit, and delete rule rows. Confirm save status changes from `Saving...` to `Saved.` and diagnostics remain readable.

## Advanced sources and Path tester

- Add an existing note through an `obsidian://open` URL and confirm the row resolves to the expected exact vault-relative path.
- On desktop, import an existing file and folder through absolute system paths. Confirm files become exact rules and folders keep normal vault-path matching semantics.
- Reload the plugin and inspect `data.json`; confirm successful system-path imports persist only portable vault-relative paths, never the full local path.
- Exercise **Path tester** with a vault-relative path, Obsidian URL, and desktop system path.
- For each source, verify the detected type, resolved path, include/exclude matches, and final `Read-only` or `Editable` status.

## Welcome, keyboard, and focus

- With an undismissed onboarding version, confirm the welcome modal appears once and **Open settings** opens this plugin's settings page.
- Tab through both mode buttons, rule-row controls, Path tester, and the **Matching** and **Debug flags** disclosure buttons.
- Confirm native `Enter`/`Space` activation works, focus indicators stay visible, and disclosure controls expose correct `aria-expanded` state.
- Add, delete, enable, disable, or edit a rule and confirm focus returns to the corresponding stable control after the UI rerenders.
- Open the settings page through the welcome action and confirm focus moves to its first control.

## Mobile and tablet

- Open the settings tab on Obsidian mobile `1.10.3`; confirm cards, rule rows, diagnostics, and Path tester use the stacked layout without clipping or horizontal overlap.
- Confirm vault-relative paths and Obsidian URLs can be added on mobile.
- Confirm a new absolute system path cannot be imported on mobile because no desktop filesystem adapter is available.
- Confirm a system-path rule previously resolved and saved as a portable vault-relative path still works on mobile.
- Check touch targets and the narrow layout on a phone and on a portrait tablet.

## Runtime behavior

- Open matching notes in normal workspace leaves and confirm they return to Reading view.
- Trigger popout, hover, and popover note contexts and confirm matched notes remain protected.
- Repeat rapid leaf and layout changes and watch for delayed enforcement or visible jank.
