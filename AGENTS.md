# AGENTS

Repository-level working rules for contributors and coding agents.

## Scope

- Project: Obsidian community plugin `read-only-view`.
- Language/tooling: TypeScript + esbuild + npm.
- Runtime target: Obsidian desktop + mobile (`isDesktopOnly: false`).

## Source of truth commands

Prefer `just` recipes:

- `just install` — install dependencies (`npm install`)
- `just dev` — watch mode
- `just build` — production build
- `just test` — run unit tests
- `just lint` — lint
- `just check` — build + test + lint
- `just clean` — remove generated artifacts

Equivalent npm scripts exist in `package.json` (`dev`, `build`, `test`, `lint`).

## Repository structure

- `src/main.ts` — plugin lifecycle, enforcement orchestration, settings tab UI.
- `src/matcher.ts` — path normalization and matching logic.
- `tests/matcher.test.ts` — unit tests for matcher behavior.
- `manifest.json` / `versions.json` — plugin metadata and compatibility mapping.
- `esbuild.config.mjs`, `tsconfig.json`, `tsconfig.test.json`, `eslint.config.mts` — build/test/lint config.
- `main.js`, `build-tests/` — generated outputs; do not hand-edit.

## Change rules

- Keep dependencies minimal; do not add heavy/runtime matching libraries for this plugin.
- Do not change plugin behavior silently.
- When behavior changes, update both:
  - `README.md` (user-facing behavior)
  - `docs/PROJECT_STATE.md` (internal system map)
- Keep command IDs stable unless there is an explicit migration plan.
- Preserve mobile compatibility and avoid Node/Electron-only runtime APIs.

## Validation before finishing

Run (at minimum):

1. `just lint`
2. `just test`
3. `just build`

If something cannot be run, document exactly what was not executed and why.

## Related docs

- README.md — user-facing behavior
- CONTRIBUTING.md — contribution workflow and PR expectations
- docs/PROJECT_STATE.md — internal system map
