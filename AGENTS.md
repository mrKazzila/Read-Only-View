# AGENTS

Working rules for the `read-only-view` Obsidian plugin.

## Read when relevant

- Before changing runtime behavior or module boundaries, read [PROJECT_STATE](docs/PROJECT_STATE.md).
- For setup, documentation-site work, or Star History tooling, read [CONTRIBUTING](CONTRIBUTING.md).
- Before live Obsidian testing, read [E2E testing](docs/E2E_TESTING.md) and [demo vault setup](docs/DEMO_VAULT.md).
- Before changing screenshots, read [image rules](docs/images/README.md).

## Runtime rules

- Support desktop and mobile on Obsidian 1.10.3+. Newer APIs need runtime guards or a legacy path; newer installed API types do not raise the runtime baseline.
- Keep dependencies minimal and Node/Electron-only APIs outside plugin runtime code.
- Preserve Markdown-only protection and Exclude precedence over global mode and Include rules.
- Use `changeSettings` for settings mutations and `rule-state.ts` for canonical rule entries and compatibility projections. Mutations must be replayable and modify only the supplied draft.
- Reuse the compiled matcher for enforcement, diagnostics, and Explorer decisions.
- Keep command IDs stable unless an explicit migration plan is agreed.
- Clean up events, observers, timers, and animation frames on disposal; preserve ownership by the originating document/window.

## Changes and validation

- Prefer recipes in `Justfile` / `just/`; npm equivalents are in `package.json`.
- Before finishing changes, run `just check`: build, tests, lint, and Obsidian Community preflight. Report anything not run and why.
- Fix preflight findings in source; inline ESLint suppression is rejected.
- Test plugin integration through lifecycle, persisted settings, host events/commands, and `changeSettings`; test algorithms through service interfaces.
- For site changes, also run `npm run docs:build`. For Python analytics changes, use the checks in CONTRIBUTING.
- For behavior changes, update README, PROJECT_STATE, and affected public guides in `docs-site/`.
- Edit source files; regenerate `main.js`, `build-tests/`, and VitePress output.
- Use synthetic `demo-vault` for automated host testing. Keep personal paths in ignored `just/local.just`.
- Commit or push only when explicitly requested.
