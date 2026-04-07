# mdedit

A lightweight cross-platform WYSIWYG Markdown editor built with **Tauri 2**, **React**, **TypeScript**, and **Tiptap** (Typora-inspired single-pane editing).

## What the app does today

- Open Markdown files (`.md`, `.markdown`, `.txt`) via native OS dialog.
- Edit in a clean, single-pane WYSIWYG editor.
- Save to the same path or via **Save As**.
- Track dirty state (Saved/Modified) and show the active filename in the status bar.
- Update the native window title (`*filename - mdedit` when modified).
- Confirm before discarding unsaved changes (open/reload/close flow).
- Detect external file changes (mtime check on app focus/visibility change) and highlight reload.
- Keep a **Recent Files** list and reopen last file on startup (persisted in `localStorage`).
- Provide toast notifications for open/save/reload flows and errors.
- Offer toolbar actions for:
  - Bold, italic, headings, ordered/bullet lists, blockquote, code block
  - Links (insert/remove)
  - Task list insertion
  - Table insertion
  - Image insertion via URL
- Provide app menu items for File/Edit actions.

## Keyboard shortcuts

- `Ctrl/Cmd + O` → Open
- `Ctrl/Cmd + S` → Save
- `Ctrl/Cmd + Shift + S` → Save As
- `Ctrl/Cmd + Alt + R` → Reload from disk

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| UI | React 18 + TypeScript |
| Build | Vite 5 |
| Editor | Tiptap + StarterKit + custom extensions |
| App state | Zustand |
| Markdown pipeline | unified / remark / rehype |
| Native bridge | Custom Tauri commands + rfd |

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) (stable toolchain)
- **Linux only:** GTK 3 and WebKitGTK 4.1 development headers

```bash
# Ubuntu / Debian
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev libssl-dev
```

## Getting started

```bash
# 1) Install JS dependencies
npm install

# 2) Run Vite + Tauri desktop app
npm run tauri dev
```

First run also compiles the Rust backend, which can take a few minutes.

## Build

```bash
# Frontend production build
npm run build

# (optional) Full desktop bundle
npm run tauri build
```

## Project structure

```text
src/
├── app/                    # Root app composition
├── components/             # Layout, Toolbar, StatusBar
├── features/
│   ├── documents/          # Open/save/reload orchestrators
│   ├── editor/             # Tiptap editor + extensions + controller
│   └── ux/                 # Toast + confirm dialog system
├── services/               # Tauri bridge, markdown transform, app state storage
├── stores/                 # Zustand document state
├── types/                  # Shared app types
└── lib/                    # Utility helpers

src-tauri/
├── src/
│   ├── main.rs             # Binary entrypoint
│   └── lib.rs              # Tauri command handlers + bootstrap
├── capabilities/           # Tauri v2 capability grants
├── permissions/            # Custom command permissions
└── tauri.conf.json         # Tauri app configuration
```

## Architecture overview

```text
┌──────────────────────────────────────────────────────┐
│ UI / Presentation                                    │
│ App · Toolbar · EditorArea · StatusBar · UX dialogs │
├──────────────────────────────────────────────────────┤
│ Application layer                                    │
│ useEditorController · fileActionService             │
│ documentService · appStateService                   │
├──────────────────────────────────────────────────────┤
│ State + conversion                                   │
│ documentStore (Zustand) · markdownService           │
├──────────────────────────────────────────────────────┤
│ Native bridge (Tauri)                                │
│ tauriBridge.ts → Rust commands (open/read/save/...) │
└──────────────────────────────────────────────────────┘
```

## Markdown processing model

The editor flow uses three representations:

1. **Raw markdown** loaded from disk.
2. **Editor HTML** rendered in Tiptap.
3. **Canonical markdown** generated from editor HTML and used for dirty checks + save.

> Note: current HTML ↔ Markdown conversion is intentionally practical for MVP, not fully lossless for every markdown edge case.

## Persistence behavior

App-level state is stored in browser storage (`localStorage`) under `mdedit.appState.v1`:

- recent files list (deduplicated, max 10)
- last opened path
- startup behavior flag (`reopenLastFileOnStartup`)

## TODO

- [x] **Window title** – reflect open filename and dirty state in the OS title bar
- [x] **Close / quit confirmation** – prompt when quitting with unsaved changes
- [x] **Recent files** – persist a list of recently opened paths
- [ ] **Code block syntax highlighting** – add `@tiptap/extension-code-block-lowlight` with lowlight
- [ ] **Image support** – improve beyond URL insertion (e.g., drag-and-drop/paste + local asset handling)
- [ ] **Lossless Markdown roundtrip** – investigate Tiptap's `@tiptap/extension-markdown` for better serialisation
- [x] **Keyboard shortcuts** – additional shortcuts (Open/Save/Save As/Reload)
- [ ] **Theming** – light/dark mode toggle
- [ ] **App icons** – replace the empty icon array with proper platform icons
- [ ] **Tests** – add Vitest for service-layer unit tests

## License

MIT (see `LICENSE`).
