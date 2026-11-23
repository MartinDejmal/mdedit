# Documentation review log

Every commit must update relevant documentation. When a change does not alter documented behavior or workflows, record the review here instead of making an unrelated content edit. See [CONTRIBUTING.md](../CONTRIBUTING.md).

| Date | Change subject | Documents reviewed / updated | Result |
|---|---|---|---|
| 2026-11-23 | Add bilingual offline Help and About | Czech/English user guides, README, contribution/agent instructions, product website, release snapshot notice and TC analysis | Replaced the outdated guide, documented current workflows and limitations, bundled Help, exposed version/license information and corrected stale MIT claims to match LICENSE. |

Validation for the Help/About update: 15 browser regression tests passed across Help, editor actions, file management, document switching, toolbar, PDF and Mermaid. TypeScript and the production frontend build passed; both guides and the license were verified in the generated JavaScript bundle. Native menu/window calls were exercised with mocked Tauri IPC; this is not a claim of native desktop GUI validation.
