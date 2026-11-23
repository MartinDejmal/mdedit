# Repository instructions for agents

Read `CONTRIBUTING.md` and `README.md` before making changes. Use the existing checkout; this cloud task is already isolated. Do not create a Git worktree unless the user requests one. Preserve unrelated edits.

## Required documentation in every commit

Every commit must contain a relevant documentation update. For user-facing changes update both `docs/user-documentation.html` and `docs/user-documentation.en.html` in the same commit; these are bundled offline Help. Update README, website translations and release notes when their respective facts change.

If a change has no effect on documented behavior or workflows, add an entry to `docs/documentation-log.md` stating the date, change subject, reviewed documents and the concrete reason no content update is needed. Do not satisfy this rule with meaningless whitespace changes or describe unreleased behavior as already shipped. Documentation-only commits update their relevant document directly.

Before each commit inspect the staged diff and verify this requirement. The current user's explicit instructions take precedence; this policy is not a reason to request routine approval or leave authorized work unfinished.

## Verification and source of truth

Use existing npm scripts and relevant tests. Help/menu/documentation changes require `npm run test:help`; see README for browser and native prerequisites. `npm ci` preserves the lockfile. Build wrappers synchronize version metadata, so use the underlying TypeScript/Vite commands when the version must stay unchanged.

The application version is `VERSION` and is injected into About by the build. The actual application license is the root `LICENSE` (GNU GPL v3); dependency licenses are separate. Native toolchain and release platforms are defined in `rust-toolchain.toml` and `.github/workflows`.

Keep Help offline, available in Czech and English, and independent of active-document state. No scripts or external resources belong in the standalone HTML manuals. Do not expose Tauri filesystem privileges to documentation content. Do not claim native behavior is validated by browser IPC mocks.
