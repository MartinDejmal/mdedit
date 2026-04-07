# mdedit

A lightweight cross-platform WYSIWYG Markdown editor built with Tauri 2, React, TypeScript, and Tiptap — inspired by Typora.

## Features (MVP)

- Open any `.md` file via the native file dialog
- Edit in a clean single-pane WYSIWYG editor (Typora-style)
- Toolbar for Bold, Italic, H1/H2, lists, blockquote, and code blocks
- Save changes back to the original file or choose a new path via Save dialog
- Unsaved-changes indicator in the status bar
- Ctrl+S / ⌘+S keyboard shortcut

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| UI | React 18 + TypeScript |
| Build | Vite 5 |
| Editor | Tiptap (StarterKit) |
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
# 1. Install JavaScript dependencies
npm install

# 2. Start the development build (opens the app window)
npm run tauri dev
```

The first run will also compile the Rust binary (this can take a few minutes).

## Project structure

```
src/
├── app/                    # Root App component
├── components/             # Layout, Toolbar, StatusBar
├── features/
│   ├── editor/             # Tiptap EditorArea component
│   └── documents/          # documentService (open / save orchestration)
├── services/
│   ├── tauriBridge.ts      # Typed wrappers around Tauri invoke()
│   └── markdownService.ts  # Markdown ↔ HTML via unified/remark/rehype
├── stores/
│   └── documentStore.ts    # Zustand document state
├── types/                  # Shared TypeScript types
└── lib/                    # Utility helpers

src-tauri/
├── src/
│   ├── main.rs             # Binary entry point
│   └── lib.rs              # Tauri commands + app bootstrap
├── capabilities/           # Tauri 2 window capability grants
├── permissions/            # Tauri 2 custom command permissions
└── tauri.conf.json         # Tauri configuration
```

## Architecture overview

```
┌─────────────────────────────────────┐
│  UI / Presentation                  │
│  App · Toolbar · EditorArea ·       │
│  StatusBar · Layout                 │
├─────────────────────────────────────┤
│  Application / Document Services   │
│  documentService · markdownService  │
│  documentStore (Zustand)            │
├─────────────────────────────────────┤
│  Native Desktop Bridge (Tauri)      │
│  tauriBridge.ts → Rust commands     │
│  open_file_dialog · read_text_file  │
│  save_text_file · save_file_dialog  │
└─────────────────────────────────────┘
```

## Next recommended steps

The following are **not** implemented yet and are suggested for the next iteration:

1. **Window title** – reflect open filename and dirty state in the OS title bar
2. **Close / quit confirmation** – prompt when quitting with unsaved changes
3. **Recent files** – persist a list of recently opened paths
4. **Code block syntax highlighting** – add `@tiptap/extension-code-block-lowlight` with lowlight
5. **Image support** – drag-and-drop or paste images, store as base64 or relative paths
6. **Lossless Markdown roundtrip** – investigate Tiptap's `@tiptap/extension-markdown` for better serialisation
7. **Keyboard shortcuts** – additional shortcuts (e.g. Ctrl+O for Open)
8. **Theming** – light/dark mode toggle
9. **App icons** – replace the empty icon array with proper platform icons
10. **Tests** – add Vitest for service-layer unit tests
