# mdedit

Lehký multiplatformní WYSIWYG Markdown editor inspirovaný Typorou. Projekt běží jako desktop aplikace nad **Tauri 2 + React 18 + TypeScript + Tiptap**.

## Aktuální stav projektu (k 9. 4. 2026)

mdedit je funkční desktopový editor zaměřený na rychlé psaní Markdownu bez přepínání mezi „edit/preview“ režimem. Aktuální větev obsahuje produkčně použitelný základ s otevřením, editací, uložením, exportem a správou stavu dokumentu.

### Co je hotové

- Otevření souborů `.md`, `.markdown`, `.txt` přes nativní dialog.
- Vytvoření **nového nepojmenovaného dokumentu** (`Untitled`).
- Otevření souboru i přes **CLI argument** (např. „Open With“ z OS).
- Drag-and-drop otevření podporovaných textových/markdown souborů.
- Uložení (`Save`) i `Save As`.
- Sledování `dirty` stavu a ochrana proti zahození neuložených změn.
- Potvrzení při zavírání okna, pokud jsou neuložené změny.
- Detekce externí změny souboru na disku (focus/visibility check + zvýrazněný reload).
- Nativní title okna s indikací změn (`*` prefix při neuloženém stavu).
- Persistovaný seznam „Recent Files“ + obnovení posledního souboru po startu.
- Panel osnovy (outline sidebar) s navigací podle nadpisů.
- Export do **HTML** a **PDF**.
- Toolbar akce pro běžné formátování (bold/italic, nadpisy, seznamy, task list, tabulka, odkazy, obrázky URL, code block).
- Výběr jazyka aktivního code blocku.
- Aplikační menu (File/Edit/View) s klávesovými zkratkami.
- Toast notifikace a potvrzovací dialogy pro hlavní workflow.

### Známá omezení / další směr

- Markdown ↔ HTML převod je praktický (MVP), ne plně bezztrátový pro všechny edge casy.
- Obrázky jsou aktuálně vkládány primárně přes URL (bez kompletního asset pipeline).
- Chybí robustnější sada automatických testů (unit/integration/e2e).
- Témování (light/dark) a další UX polish je stále otevřené téma.

## Přehled repozitáře

### Struktura

```text
src/
├── app/                    # Root kompozice aplikace
├── components/             # Layout, toolbar, status bar, outline UI
├── features/
│   ├── documents/          # Open/save/reload/export orchestrace
│   ├── editor/             # Tiptap editor + extensions + controller
│   └── ux/                 # Toast + confirm dialog systém
├── services/               # Tauri bridge, markdown pipeline, persisted app state
├── stores/                 # Zustand dokumentový store
├── types/                  # Sdílené typy
└── lib/                    # Utility

src-tauri/
├── src/
│   ├── main.rs             # Binární vstup
│   └── lib.rs              # Tauri commandy (file ops, metadata, export PDF...)
├── capabilities/           # Tauri v2 capability granty
├── permissions/            # Vlastní command permissions
└── tauri.conf.json         # Konfigurace aplikace
```

### Technologie

| Vrstva | Technologie |
|---|---|
| Desktop shell | Tauri 2 |
| UI | React 18 + TypeScript |
| Build | Vite 5 |
| Editor | Tiptap + StarterKit + vlastní extension vrstva |
| Stav | Zustand |
| Markdown pipeline | unified / remark / rehype |
| Nativní bridge | Tauri commandy v Rustu + rfd |

## Klávesové zkratky

- `Ctrl/Cmd + N` → New
- `Ctrl/Cmd + O` → Open
- `Ctrl/Cmd + S` → Save
- `Ctrl/Cmd + Shift + S` → Save As
- `Ctrl/Cmd + Alt + R` → Reload from disk

## Build a spuštění

### Předpoklady

- Node.js >= 18
- Rust (stable toolchain)
- Linux: `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libssl-dev`

```bash
# Ubuntu / Debian
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev libssl-dev
```

### Vývoj

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run build
npm run tauri build
```

## Verze a release

Projekt používá centrální číslo verze v souboru `VERSION` (v rootu repozitáře).

- Skript `npm run sync:version` synchronizuje tuto verzi do:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock`
- Skript `npm run release -- <mode>` umí verzi zvýšit automaticky (`patch|minor|major`) nebo explicitně nastavit (`set x.y.z`).
- Při `npm run build` a `npm run tauri ...` se synchronizace spouští automaticky.
- Verze je zobrazena i v title baru aplikace (`mdedit vX.Y.Z`).

### Release skript

```bash
# bump patch verze (např. 1.0.0 -> 1.0.1)
npm run release:patch

# bump minor/major
npm run release:minor
npm run release:major

# explicitní nastavení verze
npm run release:set -- 1.2.3
```

### Postup release (příklad 1.0.0)

```bash
# 1) změň verzi
echo "1.0.0" > VERSION

# 2) synchronizuj metadata verzí
npm run sync:version

# 3) build + balíčky
npm run tauri build

# 4) commit + tag
git add VERSION package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "release: v1.0.0"
git tag v1.0.0
```

## Stav commitů a pull requestů

### Souhrn historie

- Celkem commitů: **67**
- Merge commitů (včetně PR merge): **26**
- Nemerge commitů: **41**
- Hlavní autoři dle `git shortlog`: 
  - Martin Dejmal (44)
  - copilot-swe-agent[bot] (23)

### Mergované Pull Requesty (chronologicky)

| Datum | PR | Název |
|---|---:|---|
| 2026-04-07 | #1 | create-initial-project-structure |
| 2026-04-07 | #2 | refactor-document-lifecycle-and-save-flow |
| 2026-04-07 | #3 | implement-canonical-markdown-lifecycle |
| 2026-04-07 | #4 | enhance-markdown-editor-with-new-features |
| 2026-04-07 | #6 | fix-open-file-functionality |
| 2026-04-07 | #7 | implement-external-change-handling-workflow |
| 2026-04-07 | #8 | add-desktop-ergonomics-features |
| 2026-04-07 | #10 | fix-save-command-issue |
| 2026-04-07 | #11 | implement-notification-and-confirm-dialog-system |
| 2026-04-08 | #12 | update-readme.md-next-steps-section |
| 2026-04-08 | #13 | implement-reusable-input-dialog-for-links-and-images |
| 2026-04-08 | #14 | implement-untitled-document-workflow |
| 2026-04-08 | #15 | add-syntax-highlighting-for-code-blocks |
| 2026-04-08 | #17 | fix-cannot-enter-text-in-document |
| 2026-04-08 | #18 | add-export-workflows-for-html-and-pdf |
| 2026-04-08 | #19 | polish-toolbar-ux-and-icons |
| 2026-04-08 | #20 | add-navigation-sidebar-for-document-outline |
| 2026-04-08 | #22 | handle-argument-driven-file-opening |
| 2026-04-08 | #27 | fix-task-list-tool-issues |
| 2026-04-08 | #28 | update-toolbar-heading-levels |
| 2026-04-08 | #29 | add-drag-and-drop-document-opening |
| 2026-04-09 | #31 | fix-close-window-issue |
| 2026-04-09 | #33 | fix-outline-pane-generation |
| 2026-04-09 | #34 | upgrade-pdf-export-to-match-html-layout |

> Pozn.: V historii jsou i 2 technické merge commity z `main` bez PR čísla (`17425b3`, `fe0a4e0`).

### Poslední změny (nejnovější PR)

- **#34 (2026-04-09):** vylepšení PDF exportu na HTML-based multipage pipeline.
- **#33 (2026-04-09):** oprava negenerování outline panelu při otevření dokumentu.
- **#31 (2026-04-09):** oprava zavírání okna přes systémové close tlačítko.

## Licence

MIT (viz `LICENSE`).
