#!/usr/bin/env python3
"""Create a synthetic Obsidian demo vault for safe plugin QA."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_VAULT_DIR = REPO_ROOT / "demo-vault"
PLUGIN_SETTINGS = {
    "enabled": True,
    "useGlobPatterns": False,
    "caseSensitive": True,
    "debug": False,
    "debugVerbosePaths": False,
    "includeRules": ["Read Only/", "Archive/"],
    "excludeRules": ["Read Only/Drafts/"],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a synthetic Obsidian demo vault for read-only-view QA.",
    )
    parser.add_argument(
        "--vault-dir",
        default=str(DEFAULT_VAULT_DIR),
        help="Directory where the demo vault will be created.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete and recreate an existing demo vault.",
    )
    parser.add_argument(
        "--no-plugin-link",
        action="store_true",
        help="Create notes only without linking the local plugin build.",
    )
    return parser.parse_args()


def build_notes() -> dict[str, str]:
    return {
        "Inbox/Quick capture.md": """# Quick capture

Tags: #demo #inbox

## Today

- Capture short ideas before they turn into tasks.
- Keep this note editable to confirm normal vault behavior.
- Link follow-up work into [[Sprint planning]] or [[Weekly review]].

## Mini checklist

- [ ] Turn one idea into a task
- [ ] Add one item to the project board
- [ ] Refile leftover notes at the end of the demo
""",
        "Inbox/Meeting recap.md": """---
tags:
  - demo
  - inbox
status: triage
---

# Meeting recap

## Highlights

1. Confirm the plugin protects reference material.
2. Keep working notes editable.
3. Record screenshot candidates after settings are applied.

> [!info]
> This vault contains only synthetic content for testing.

Next note to open: [[Inbox/Quick capture]].
""",
        "Inbox/Idea parking lot.md": """# Idea parking lot

Short note for a fast edit test. #demo

- Modular onboarding checklist
- Glossary page for common plugin terms
- Comparison table for include and exclude examples
""",
        "Knowledge Base/Programming/Python/Async IO notes.md": """---
tags:
  - demo
  - programming
  - python
---

# Async IO notes

## Event loop reminders

Python async code works best when blocking operations are isolated behind explicit boundaries.

### Practical rules

- Use `await` for network-like tasks.
- Prefer small coroutines with clear names.
- Keep retry logic close to the I/O edge.

```python
async def fetch_page(client, path):
    response = await client.get(path)
    return response.text
```

| Topic | Why it matters |
| --- | --- |
| Timeouts | Prevent hangs during demos |
| Retries | Make flaky behavior visible |
| Logging | Helps explain unexpected states |

Related: [[Testing checklist]], [[Reference/Markdown/Markdown examples]].
""",
        "Knowledge Base/Programming/Python/Testing checklist.md": """# Testing checklist

Tags: #demo #python #checklist

## Before release

- [ ] Run unit tests
- [ ] Run lint
- [ ] Build the plugin bundle
- [ ] Validate include and exclude examples in Path tester

## Manual QA

1. Open a protected note.
2. Try clicking into the editor area.
3. Confirm the note remains in Reading view.

> [!tip]
> Use this editable note to verify that normal working notes still allow typing.
""",
        "Knowledge Base/Programming/Python/Packaging notes.md": """# Packaging notes

This page tracks a fictional release process for a public plugin demo.

## Constraints

- Do not package private vault content.
- Keep generated files reproducible.
- Prefer standard tooling over custom runtime hooks.

Inline reminder: use `just build` before local plugin installation.
""",
        "Knowledge Base/Programming/Python/CLI patterns.md": """# CLI patterns

## Notes

- Small scripts should print actionable errors.
- `--force` should be explicit about destructive behavior.
- Idempotent defaults make automation safer.

```bash
python3 scripts/create_demo_vault.py --force
```
""",
        "Knowledge Base/Programming/Python/Patterns/Coroutine pitfalls.md": """# Coroutine pitfalls

## Common issues

- Forgetting `await` in a demo snippet
- Mixing blocking file access with async flows
- Hiding exceptions inside broad retry wrappers

This deeper note exists to verify nested folders and file explorer behavior.
""",
        "Knowledge Base/Programming/Architecture/Event driven systems.md": """# Event driven systems

## Core idea

Separate event capture from event handling so UI changes can be coalesced when necessary.

### Demo talking points

- Batching reduces redundant work.
- Observers need careful cleanup.
- Small services are easier to test.

> [!warning]
> Event storms can hide timing bugs if logs are too noisy.

Cross-reference: [[Clean architecture]].
""",
        "Knowledge Base/Programming/Architecture/Clean architecture.md": """# Clean architecture

## Layers

1. Pure matching logic
2. UI orchestration
3. Platform integration

Use this note to show a normal editable knowledge page with several headings.

### Tradeoffs

- More modules can improve testability.
- Too many abstractions can slow down maintenance.
""",
        "Knowledge Base/Programming/Architecture/Observer notes.md": """# Observer notes

Callout-heavy pages are useful when testing long Reading view layouts.

> [!info]
> Mutation observers should ignore unrelated DOM activity when possible.

> [!tip]
> Cache lookup results when the surrounding layout is stable.
""",
        "Knowledge Base/Productivity/Weekly review.md": """# Weekly review

## Review prompts

- What became easier to test this week?
- Which note paths were confusing?
- Which screenshots explain the feature fastest?

### Small table

| Prompt | Outcome |
| --- | --- |
| Stable demo vault | Less privacy risk |
| Reusable notes | Faster QA |
| Settings presets | Less setup time |
""",
        "Knowledge Base/Productivity/Sprint planning.md": """# Sprint planning

This note stays editable and works as a quick text-entry target.

- Define one release goal
- Pick one documentation task
- Leave room for bug follow-up
""",
        "Knowledge Base/Productivity/Reading workflow.md": """# Reading workflow

## When to use Reading view

- Reviewing summaries
- Sharing screenshots
- Checking final formatting

## When to edit

- Drafting new notes
- Capturing short tasks
- Adjusting rule examples
""",
        "Knowledge Base/Travel/Trip checklist.md": """# Trip checklist

Synthetic travel note for a realistic folder mix. #demo #travel

- [ ] Download offline maps
- [ ] Pack charger
- [ ] Save itinerary summary

This page is deliberately generic and contains no private itinerary data.
""",
        "Knowledge Base/Travel/Packing list.md": """# Packing list

1. Notebook
2. Water bottle
3. Cable pouch
4. Lightweight jacket

Use this note to verify that unrelated folders remain editable.
""",
        "Knowledge Base/Travel/Conference prep.md": """# Conference prep

## Goals

- Practice the plugin demo
- Capture one short mobile video
- Verify the archive notes remain protected
""",
        "Reference/Markdown/Markdown examples.md": """# Markdown examples

Tags: #demo #reference #markdown

## Formatting

Use `inline code`, **bold text**, and *italics* in the same note.

### Bullet list

- Item one
- Item two
- Item three

### Numbered list

1. Start in Reading view
2. Open the settings tab
3. Compare the tester output

### Checkbox list

- [x] Headings
- [x] Lists
- [x] Links
- [ ] Embedded images

See also [[Tables and callouts]] and [[Reference/Snippets/Useful snippets]].
""",
        "Reference/Markdown/Tables and callouts.md": """# Tables and callouts

## Table sample

| View | Expected behavior | Notes |
| --- | --- | --- |
| Reading | Protected note stays readable | Good for screenshots |
| Source | Editable note accepts typing | Good for exclude tests |

> [!info]
> Tables wrap differently on narrow screens, so this note is useful for mobile checks.

> [!warning]
> Long rule lists can be harder to read on phones.

> [!tip]
> Record a short clip while switching between a protected note and an editable draft.
""",
        "Reference/Markdown/Frontmatter sample.md": """---
title: Frontmatter sample
tags:
  - demo
  - reference
owner: docs-team
---

# Frontmatter sample

This note exists to check that metadata-heavy notes still render cleanly in Reading view.
""",
        "Reference/Markdown/Linking patterns.md": """# Linking patterns

## Link ideas

- [[Markdown examples]]
- [[Frontmatter sample]]
- [[Read Only/Docs/API overview]]

Internal links in this vault only point to synthetic notes.
""",
        "Reference/Snippets/Useful snippets.md": """# Useful snippets

```ts
type RulePreset = {
  include: string[];
  exclude: string[];
};
```

## Notes

- Keep snippets short enough to scan.
- Use fenced blocks for screenshot variety.
""",
        "Reference/Snippets/Regex cheatsheet.md": """# Regex cheatsheet

Short reference note.

- `^` anchors the start
- `$` anchors the end
- `.*` matches many characters
""",
        "Reference/Snippets/Shell helpers.md": """# Shell helpers

```bash
just demo-vault
just demo-vault-reset
just demo-vault-no-plugin
```

Use these commands when preparing a clean recording vault.
""",
        "Archive/2024/Quarterly notes.md": """# Quarterly notes

Archive material should be protected by default in the demo vault.

## Summary

- The archive folder is read-only.
- Notes here are intended for review, not editing.
""",
        "Archive/2024/Release notes snapshot.md": """# Release notes snapshot

## Snapshot

1. Added safer demo flows
2. Improved docs coverage
3. Reduced manual setup steps
""",
        "Archive/2025/Retrospective.md": """# Retrospective

Tags: #demo #readonly #archive

## What worked

- Synthetic notes removed privacy concerns.
- One-click setup made testing faster.
- Protected archive notes were easy to explain in video.

## What to verify

- Open this note from file explorer.
- Confirm it stays in Reading view.
- Use it as the archive screenshot candidate.

> [!info]
> This is a protected archive note and should stay read-only.
""",
        "Archive/2025/Project summary.md": """# Project summary

## Outcome

The fictional project improved onboarding by documenting the expected include and exclude paths.

## Key links

- [[Archive/2025/Retrospective]]
- [[Read Only/Summaries/Course summary]]
""",
        "Archive/2025/Postmortem template.md": """# Postmortem template

## Sections

1. Incident summary
2. User impact
3. Follow-up actions

Keep archived templates protected to avoid accidental edits during presentations.
""",
        "Read Only/Docs/API overview.md": """---
tags:
  - demo
  - readonly
  - docs
summary: Long protected note for screenshots and recording
---

# API overview

This long note is the main Reading view showcase for the demo vault. It should remain protected by the default include and exclude rules.

## Why this note exists

The note combines several Markdown patterns in one place so it looks convincing in screenshots and helps verify scrolling behavior.

### Feature map

- Read-only notes stay in Reading view
- Diagnostics explain which rules match
- Exclude rules keep drafts editable
- Synthetic content avoids privacy risk

## Read-only checklist

- [x] Include rule covers `Read Only/`
- [x] Exclude rule spares `Read Only/Drafts/`
- [x] Archive folder is also protected
- [ ] Record a short mobile video

## Comparison table

| Path | Expected result | Why |
| --- | --- | --- |
| `Read Only/Docs/API overview.md` | Protected | Included by folder rule |
| `Read Only/Drafts/Editable draft.md` | Editable | Excluded by subfolder rule |
| `Archive/2025/Retrospective.md` | Protected | Included by archive rule |
| `Inbox/Quick capture.md` | Editable | No include rule matches |

## Example code

```ts
const rules = {
  includeRules: ["Read Only/", "Archive/"],
  excludeRules: ["Read Only/Drafts/"],
};
```

## Callouts

> [!info]
> Open this note first for the basic protected-note smoke test.

> [!tip]
> Scroll through the whole page while recording to show stable Reading view formatting.

> [!warning]
> Switching this note into edit mode would indicate a regression in enforcement.

## Linked notes

- [[Read Only/Docs/User guide]]
- [[Read Only/Summaries/Book summary]]
- [[Reference/Markdown/Markdown examples]]
- [[Archive/2025/Retrospective]]

## Extended narrative

The demo vault mirrors a realistic personal knowledge base without reusing any real notes. It includes reference material, editable working areas, archives, and a protected documentation section. That mix matters because path-based behavior is easier to trust when the vault structure looks like something a real user would maintain over time.

When reviewing plugin behavior, a long note like this also exposes layout concerns: heading spacing, list indentation, callout rendering, code block wrapping, table overflow, and scroll position retention. These details often show up in screenshots and short videos, so the demo content needs to be visually stable and neutral.

A good recording flow is to open this note, scroll past the table and code block, tap inside the content area, and confirm that nothing unexpectedly flips into source mode. After that, jump to [[Read Only/Drafts/Editable draft]] to show that the exclude rule still allows editing where it should.

## Final reminders

1. Keep the include rules short and literal in prefix mode.
2. Use the Path tester with exact vault-relative paths.
3. Prefer this synthetic vault over real notes for documentation media.
""",
        "Read Only/Docs/User guide.md": """# User guide

Tags: #demo #readonly #docs

## Setup

1. Create the demo vault.
2. Open it in Obsidian.
3. Enable the community plugin if needed.
4. Test a protected note and an excluded draft.

## Suggested flow

- Start on [[Read Only/Docs/API overview]]
- Jump to [[Read Only/Drafts/Editable draft]]
- Open [[Archive/2025/Retrospective]]
- Finish with [[Inbox/Quick capture]]
""",
        "Read Only/Docs/FAQ.md": """# FAQ

## Why keep these docs protected?

They simulate polished reference material that should not be edited accidentally during a demo.

## Can drafts stay editable?

Yes. The demo rules exclude `Read Only/Drafts/`.
""",
        "Read Only/Docs/Release checklist.md": """# Release checklist

- [ ] Build plugin bundle
- [ ] Regenerate demo vault if content changed
- [ ] Capture updated settings screenshot
- [ ] Verify protected note behavior
""",
        "Read Only/Docs/Mobile/Tablet/Recording checklist.md": """# Recording checklist

## Tablet demo flow

1. Open [[Read Only/Docs/API overview]].
2. Scroll through the long note.
3. Jump to [[Read Only/Drafts/Editable draft]].
4. Show that the excluded draft still accepts edits.
""",
        "Read Only/Summaries/Book summary.md": """# Book summary

## Key ideas

- Clear rules reduce confusion.
- Safe demos require synthetic content.
- Reusable screenshots save time.

This summary should be protected by default.
""",
        "Read Only/Summaries/Course summary.md": """# Course summary

## Modules

1. Matching rules
2. Diagnostics workflow
3. Vault setup for recordings

Link back to [[Read Only/Docs/User guide]].
""",
        "Read Only/Summaries/Incident summary.md": """# Incident summary

> [!info]
> Fictional incident note for protected summary testing.

## Summary

An accidental edit was prevented because the note reopened in Reading view.
""",
        "Read Only/Drafts/Editable draft.md": """# Editable draft

Tags: #demo #draft #excluded

This note is the excluded draft example. It lives under `Read Only/Drafts/` but should remain editable because the exclude rule wins.

## Draft tasks

- [ ] Reword the first paragraph
- [ ] Add one screenshot caption
- [ ] Delete a line while recording the exclude scenario

> [!tip]
> Use this note as the editable contrast case right after opening a protected note.
""",
        "Read Only/Drafts/Review notes.md": """# Review notes

Short draft note for additional exclude coverage.

- Keep editable
- Use for quick typing tests
""",
        "Read Only/Drafts/Outline.md": """# Outline

1. Demo intro
2. Settings review
3. Protected note example
4. Editable draft example
""",
    }


def remove_existing_vault(vault_dir: Path) -> None:
    if not vault_dir.exists():
        return
    if vault_dir.is_symlink() or vault_dir.is_file():
        raise SystemExit(f"Refusing to replace non-directory path: {vault_dir}")
    for child in sorted(vault_dir.rglob("*"), reverse=True):
        if child.is_symlink() or child.is_file():
            child.unlink()
        elif child.is_dir():
            child.rmdir()
    vault_dir.rmdir()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_text(path: Path, content: str) -> None:
    ensure_parent(path)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def write_json(path: Path, payload: object) -> None:
    ensure_parent(path)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def load_manifest() -> dict[str, object]:
    manifest_path = REPO_ROOT / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"Missing required manifest.json at {manifest_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {manifest_path}: {exc}") from exc
    if not isinstance(manifest, dict):
        raise SystemExit(f"Unexpected manifest format in {manifest_path}")
    plugin_id = manifest.get("id")
    if not isinstance(plugin_id, str) or not plugin_id:
        raise SystemExit(f"manifest.json is missing a string plugin id: {manifest_path}")
    return manifest


def link_or_copy(source: Path, target: Path) -> str:
    ensure_parent(target)
    if target.exists() or target.is_symlink():
        if target.is_dir() and not target.is_symlink():
            shutil.rmtree(target)
        else:
            target.unlink()
    try:
        os.symlink(source.resolve(), target)
        return "symlink"
    except OSError:
        shutil.copy2(source, target)
        return "copy"


def install_plugin(vault_dir: Path, manifest: dict[str, object]) -> list[str]:
    plugin_id = str(manifest["id"])
    plugin_dir = vault_dir / ".obsidian" / "plugins" / plugin_id
    plugin_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = REPO_ROOT / "manifest.json"
    main_js_path = REPO_ROOT / "main.js"
    styles_path = REPO_ROOT / "styles.css"

    if not main_js_path.is_file():
        raise SystemExit(
            "Cannot install plugin into the demo vault because main.js is missing. "
            "Build the plugin first with `just build` or `npm run build`.",
        )

    shutil.copy2(manifest_path, plugin_dir / "manifest.json")
    messages = [f"manifest.json: copied from {manifest_path.name}"]
    messages.append(f"main.js: {link_or_copy(main_js_path, plugin_dir / 'main.js')}")
    if styles_path.is_file():
        messages.append(f"styles.css: {link_or_copy(styles_path, plugin_dir / 'styles.css')}")

    write_json(plugin_dir / "data.json", PLUGIN_SETTINGS)
    write_json(vault_dir / ".obsidian" / "community-plugins.json", [plugin_id])
    return messages


def remove_plugin_install(vault_dir: Path, manifest: dict[str, object]) -> None:
    plugin_id = str(manifest["id"])
    plugin_dir = vault_dir / ".obsidian" / "plugins" / plugin_id
    if plugin_dir.exists():
        shutil.rmtree(plugin_dir)

    community_plugins_path = vault_dir / ".obsidian" / "community-plugins.json"
    if community_plugins_path.is_file():
        try:
            community_plugins = json.loads(community_plugins_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            community_plugins = []
        if isinstance(community_plugins, list):
            filtered = [item for item in community_plugins if item != plugin_id]
            if filtered:
                write_json(community_plugins_path, filtered)
            else:
                community_plugins_path.unlink()


def create_structure(vault_dir: Path, notes: dict[str, str]) -> None:
    for relative_path, content in notes.items():
        write_text(vault_dir / relative_path, content)


def compute_stats(vault_dir: Path) -> tuple[int, int]:
    note_paths = list(vault_dir.rglob("*.md"))
    max_depth = 0
    for note_path in note_paths:
        relative = note_path.relative_to(vault_dir)
        depth = len(relative.parts) - 1
        max_depth = max(max_depth, depth)
    return len(note_paths), max_depth


def main() -> int:
    args = parse_args()
    vault_dir = Path(args.vault_dir).expanduser().resolve()
    notes = build_notes()

    if args.force:
        remove_existing_vault(vault_dir)

    vault_dir.mkdir(parents=True, exist_ok=True)
    create_structure(vault_dir, notes)

    manifest = load_manifest()
    plugin_messages: list[str] = []
    if args.no_plugin_link:
        (vault_dir / ".obsidian").mkdir(parents=True, exist_ok=True)
        remove_plugin_install(vault_dir, manifest)
    else:
        plugin_messages = install_plugin(vault_dir, manifest)

    note_count, max_depth = compute_stats(vault_dir)
    print(f"Demo vault ready: {vault_dir}")
    print(f"Markdown notes: {note_count}")
    print(f"Maximum note depth: {max_depth}")
    print("Configured protected folders: Read Only/, Archive/")
    print("Configured excluded folder: Read Only/Drafts/")
    if plugin_messages:
        print("Plugin install:")
        for message in plugin_messages:
            print(f"  - {message}")
    else:
        print("Plugin install: skipped (--no-plugin-link)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
