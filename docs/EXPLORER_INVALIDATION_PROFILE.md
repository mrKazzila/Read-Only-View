# Explorer invalidation operation profile

Measured on 2026-10-08 for backlog ticket 006. Baseline: `0c774b4`, with only
optional counters added to the existing invalidation, pruning and rendering loops.
Both runs used the same deterministic scenario in
`tests/explorer-indicators.test.ts`: start with 2,000 visible protected Markdown
rows, refresh with unchanged settings, create one note, rename it outside the
protected folder, then delete it. Vault events and DOM notifications are delivered
in the same turn, followed by a microtask drain. Counts reset before each action.

| Action | Before row visits | After row visits | Before/after matcher calls | Before/after vault lookups |
| --- | ---: | ---: | ---: | ---: |
| Unchanged refresh | 2,000 | 0 | 2,000 / 0 | 2,000 / 0 |
| Create | 2,001 | 1 | 1 / 1 | 1 / 1 |
| Rename | 4,003 | 2 | 1 / 1 | 1 / 1 |
| Delete | 4,003 | 2 | 0 / 0 | 0 / 0 |

Row visits count entries examined during path invalidation, removal cleanup and
pending-row rendering. They do not count DOM selector traversal, index maintenance,
or browser layout work. Matcher calls count actual file/folder decision calls;
lookups count `getAbstractFileByPath` calls. The delete scenario removes the DOM row
before flushing, so no lookup is needed. A separate regression verifies that a
delete event removes the indicator when the DOM row is still present.

Reproduce the final scenario:

```sh
npx tsc -p tsconfig.test.json
node tests/helpers/prepare-obsidian-runtime.mjs
node --test --test-name-pattern='profile targeted' build-tests/tests/explorer-indicators.test.js
```

The measured scans justify a path/ancestor index and local subtree cleanup. The
index costs one set membership per row per path segment. Rule changes still visit
all tracked rows. Closing a pane also checks tracked rows to release detached nodes
whose mutation records may have been discarded when disconnecting the observer.
Ordinary title-node removal does not trigger that global cleanup.

These are synthetic work counts using the existing DOM/vault harness, not measured
Obsidian UI latency. No claim of a visible speedup is made. Real desktop/mobile
Explorer rendering, popout behavior, row geometry, hover, click and drag-and-drop
were not manually verified. Multi-pane and separate-document ownership, exclusions,
folder rename ordering, rerenders and teardown are covered by automated checks.
Settings DOM and CSS are unchanged; the ticket's Settings visual comparison matrix
is not applicable to this change.
