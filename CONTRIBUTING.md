# Contributing to mdedit

## Documentation belongs in every commit

Every commit must update documentation alongside its change. This applies to people and automated agents, including fixes, tests, configuration and refactoring.

- For user-visible behavior, update **both** `docs/user-documentation.html` (Czech) and `docs/user-documentation.en.html` (English). These files are the application's bundled offline Help, not disposable generated output.
- Update README for changed setup commands, architecture, supported features, shortcuts, testing requirements or limitations. Update `www/index.html` and `www/en.html` when product claims change, keeping both languages aligned.
- Keep released notes historical. Add notes for a new release when appropriate; do not claim development-only features shipped in an older tag.
- If no documented behavior or workflow changes, add a meaningful entry to `docs/documentation-log.md`: date, change/commit subject, the documents reviewed, and why no content change is needed. An unrelated whitespace edit does not satisfy this requirement.
- A documentation-only commit can update the relevant document directly. Do not change VERSION solely to update a manual.

Before committing, inspect the staged diff and confirm that the relevant documentation update or review entry is included. Explain remaining limitations accurately. Do not describe a mocked browser test as native application validation or an unrun check as passing.

## Sources of truth

`VERSION` is the central version; build scripts synchronize package, Cargo and Tauri metadata. About reads the build's version. `LICENSE` contains GNU GPL v3; do not reintroduce MIT claims for the application. Dependency licenses are separate. Toolchain and release targets come from `rust-toolchain.toml` and `.github/workflows`.

Read [README](README.md) for setup and test commands. Preserve unrelated user changes. Prefer `npm ci` and existing dependency versions. Browser regression tests require Chromium; PDF tests also require Poppler. Native checks require the pinned Rust toolchain and platform dependencies.

## Help implementation

The guides are standalone UTF-8 HTML with inline CSS and no scripts or external runtime assets. Vite imports their raw contents into the application. Keep section IDs stable in both languages, validate TOC links, and keep text usable at narrow viewport widths. The modal must not replace or save the active document. Keep Help/About language separate from claims about full application localization.

For Help, menu, focus, version or documentation changes run `npm run test:help` and TypeScript/build checks. For editor and filesystem changes run the relevant existing regressions described in README. Avoid gratuitous dependency updates.

## Review checklist

1. The change and its limits are clear; user data and unrelated edits are preserved.
2. Documentation is part of the same commit; both user-guide languages match where behavior changed.
3. Relevant tests actually executed and their outcomes are recorded honestly.
4. No secret values, generated dependency trees or build output are committed.
5. The repository is committed/pushed only within the user's requested scope; do not publish releases or send external messages without authorization.
