# mdedit

Desktopový WYSIWYG Markdown editor pro Windows, macOS a Linux: **Tauri 2 + React + TypeScript + Tiptap**. Formátování vidíte při psaní, dokumenty zůstávají na disku a aplikace nepotřebuje účet ani cloudovou službu.

Aktuální verze je **1.3.0**; [poznámky k vydání](docs/releases/1.3.0.md) popisují novou volbu fontů od externího přispěvatele a změny od 1.2.0. Tento README popisuje aktuální vývojovou větev. Verzi aplikace určuje [`VERSION`](VERSION); již publikované instalátory mohou obsahovat starší sadu funkcí. Historický přehled vydání je v [`docs/releases`](docs/releases).

## Dokumentace / Documentation

- [Česká uživatelská příručka](docs/user-documentation.html)
- [English user guide](docs/user-documentation.en.html)
- V aplikaci: **Help → Help** nebo **F1**, jazyk **Čeština / English**. Nápověda je přibalená a funguje offline. **Help → About** zobrazuje skutečnou verzi, autora, technologie a licenci.
- [Pravidla přispívání a aktualizací dokumentace](CONTRIBUTING.md), [instrukce pro agenty](AGENTS.md), [záznam kontrol dokumentace](docs/documentation-log.md)
- [Analýza možného Total Commander WLX pluginu](docs/total-commander-viewer-plugin-analysis.md) je návrh, nikoli existující funkce.
- Produktový web: [`www/index.html`](www/index.html) / [`www/en.html`](www/en.html). Jde o samostatný statický web, který není automaticky publikován buildem aplikace.

The English user guide is bundled in the application alongside Czech help. Contributors should read [CONTRIBUTING.md](CONTRIBUTING.md); agents must also follow [AGENTS.md](AGENTS.md). Every commit must include an appropriate documentation update or a meaningful documentation-review entry.

## Současné funkce

- Otevření `.md`, `.markdown`, `.txt`, drag-and-drop z OS, argument při spuštění a Recent Files s obnovou posledního dokumentu.
- New vytvoří při otevřeném filebrowseru prázdný `Untitled.md` ve vybrané složce; kolize řeší číslováním. Jinak vznikne nepojmenovaný dokument. Save a Save As jsou explicitní, nikoli průběžný autosave.
- Filebrowser zobrazuje složky (včetně názvů `notes.md` a `.md`) a `.md` soubory; při otevření se nastaví podle aktuálního souboru. Umí posun kořene výše, novou složku, přejmenování klikem na vybraný řádek/F2, přesun tažením a trvalé smazání s potvrzením. Kontextové menu nabízí stejné souborové akce. Existující cíle se nepřepisují.
- Přesun a přejmenování zachovávají neuložený text otevřeného souboru a aktualizují cestu pro Save. Operace s celými složkami nad rámec vytvoření/navigace nejsou implementované.
- Samostatný Outline za filebrowserem s navigací podle nadpisů a zapamatovanou šířkou.
- Settings sdružuje vzhled System/Light/Dark a fonty; volby se pamatují mezi spuštěními.
- Zoom editoru 50–200 % z lišty nebo Ctrl + kolečkem nad editorem. Je pouze zobrazovací, nemění dokument ani exporty; mezi soubory se zachová a po novém spuštění začne na 100 %.
- [View → Settings…](docs/user-documentation.html#fonts) nabízí vyhledávání nainstalovaných fontů a samostatnou volbu pro nadpisy/běžný text a inline/blokový kód, živý náhled, návrat k výchozím písmům a uložení obou voleb mezi spuštěními. OK použije volby pro všechny dokumenty, Cancel/Escape je zahodí. Nastavení nemění Markdown, stav uložení ani HTML/PDF exporty; při nedostupném seznamu lze zadat název rodiny ručně.
- Přepínání WYSIWYG / editovatelného Markdown zdroje přes lištu a View; Save, export, statistiky a hledání pracují s aktivním režimem. Samotné přepnutí nemění soubor; historie se při přepnutí režimu obnoví.
- Find/Replace (Ctrl/Cmd+F / Ctrl/Cmd+H), regulární výrazy, zvýraznění, náhrada všech shod jedním krokem Undo.
- Undo/Redo v liště, cyklus H1/H2/H3, převod vybrané položky seznamu na nadpis, Tab/Shift+Tab pro nejbližší položku seznamu, úkoly, odkazy, obrázky URL a kód.
- Tabulka bez výběru 3×3; s výběrem odpovídá počtu řádků, podporuje TSV a běžné Markdown tabulky a zachovává inline formátování.
- Mermaid náhled a PDF diagramy fungují offline. HTML export zůstává samostatným dokumentem se styly a CDN pro jeho Mermaid náhled; pro tento náhled potřebuje internet.
- PDF obsahuje označitelný text, lokální fonty s diakritikou, tabulky, seznamy, checkboxy, obrázky a zvýraznění kódu. Vzdálené obrázky pro PDF vyžadují dostupnost a CORS.
- Statusbar s počtem logických řádků, slov a Unicode znaků textu editoru, pozicí kurzoru (řádek/sloupec) a velikostí aktuálního Markdownu v UTF-8 bajtech včetně neuložených úprav.
- Ochrana neuložených změn, Saved/Modified podle normalizovaného obsahu, upozornění na externí změny, reload a funkční zavření okna s potvrzením.
- Lišta přesouvá nevejdoucí se nástroje do `»`. Menu: File, Edit, View a Help. Jazyky lze přepínat v nápovědě a About; celé rozhraní zatím lokalizované není.

Přepnutí ve filebrowseru otevře nový soubor od začátku a u neuložených změn nabízí Save / Discard / Cancel. Zrušení přepnutí zachová aktuální pozici v dokumentu. New, běžné Open, reload a zavření okna používají Discard / Keep Editing; chcete-li změny uchovat, nejprve uložte. Smazání souboru nepoužívá koš.

## Klávesové zkratky

| Akce | Zkratka |
|---|---|
| New / Open | Ctrl/Cmd+N / Ctrl/Cmd+O |
| Save / Save As | Ctrl/Cmd+S / Ctrl/Cmd+Shift+S |
| Reload | Ctrl/Cmd+Alt+R |
| Undo / Redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z |
| Bold / Italic | Ctrl/Cmd+B / Ctrl/Cmd+I |
| Odsazení seznamu | Tab / Shift+Tab |
| Přejmenování / smazání v Files | F2 / Delete na řádku souboru |
| Zoom editoru (také macOS: Ctrl) | Ctrl + kolečko nad editorem |
| Help | F1 |
| Zavření nabídky či dialogu | Escape |

## Vývoj a build

Předpoklady: Node.js **22** jako v release CI (ověřeno také s Node 24), npm, Rust **1.94.1** podle [`rust-toolchain.toml`](rust-toolchain.toml) a systémové závislosti Tauri. Windows potřebují MSVC Build Tools a WebView2 Runtime; macOS Xcode Command Line Tools. Na Ubuntu/Debian jsou potřeba zejména `build-essential`, `pkg-config`, `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libfontconfig1-dev`, `libfreetype-dev`, `librsvg2-dev` a podle platformy tray podpory `libayatana-appindicator3-dev`.

```bash
npm ci
npm run tauri dev
```

Samotný frontend spustíte přes `npm run dev` (port 1420). Bez Tauri nefungují nativní dialogy a souborové operace. Nápovědu lze v browseru otevřít přes F1. V prohlížeči otevřete nastavení písma tlačítkem Settings na nástrojové liště (při nedostatku místa pod »). Zadejte název rodiny nebo v podporovaném prohlížeči zvolte Load installed fonts a povolte přístup.

```bash
npm run build
npm run tauri build
```

`npm run build` a wrapper `npm run tauri` nejprve spouštějí synchronizaci verze, která může přepsat metadata. Pro kontrolu bez synchronizace lze použít `npx --no-install tsc` a `npx --no-install vite build`; nativní CLI je také v `node_modules/.bin/tauri`. Balíčky vznikají pod `src-tauri/target/release/bundle/`.

## Testy

Browserové testy používají `playwright-core` a nainstalovaný Chromium/Chrome. Nastavte `CHROMIUM_PATH`, pokud prohlížeč není v `/usr/bin/chromium` nebo `/usr/bin/chromium-browser`. PDF testy vyžadují Poppler (`pdftotext`, `pdffonts`, `pdfimages`, `pdfinfo`). Testy souborových operací v browseru mockují Tauri IPC; nenahrazují nativní Windows/macOS/Linux test.

```bash
npm run test:help
npm run test:zoom
npm run test:statistics
npm run test:search
npm run test:source
npm run test:editor
npm run test:file-browser
npm run test:new-document
npm run test:documents
npm run test:toolbar
npm run test:mermaid
npm run test:pdf
cargo test --locked --manifest-path src-tauri/Cargo.toml folder_browser::tests
```

Rust testy vyžadují toolchain i systémové závislosti nativního projektu. Release workflow v `.github/workflows` sestavuje Windows x64, macOS Intel/Apple Silicon a Linux x64/ARM64; podpisy a aktuální balíčky ověřujte u konkrétního vydání.

## Struktura repozitáře

| Cesta | Účel |
|---|---|
| `src/app`, `src/components` | Aplikační kompozice, lišta, filebrowser a Help/About |
| `src/features/editor` | Schéma Tiptap, příkazy, controller, Outline, Mermaid node views |
| `src/features/documents`, `src/stores` | Životní cyklus dokumentů, operace se soubory, export, stav |
| `src/services` | Tauri bridge, Markdown převod, PDF, preference, Mermaid loader |
| `src-tauri` | Rust příkazy, oprávnění, konfigurace a nativní filebrowser operace |
| `docs/user-documentation*.html` | Samostatné příručky i zdroj offline nápovědy importovaný do aplikace |
| `scripts`, `tests/fixtures` | Verze, release a regresní testy |
| `www` | Český/anglický produktový web |

## Verze a release

Centrální verze je v `VERSION`. `npm run sync:version` ji promítne do `package.json`, `package-lock.json`, Tauri konfigurace a Rust manifestu/lockfilu. `npm run release -- patch`, `minor`, `major` nebo `set x.y.z` mění verzi a metadata. Samotný commit automaticky nevydává nový instalátor; release workflow reaguje na tag přesně odpovídající VERSION, bez prefixu `v` (např. `1.3.0`), nebo ruční spuštění. Po commitu změn verze a dokumentace vytvořte `git tag 1.3.0` a odešlete `git push origin main 1.3.0`. Workflow spustí browserové regrese, sestaví všechny cílové platformy a zveřejní draft teprve po úspěšné kontrole požadovaných binárních balíčků. Poznámky k vydání patří do `docs/releases/<verze>.md` a popisují skutečně vydávaný snapshot.

## Omezení a licence

Markdown ↔ HTML převod není zcela bezztrátový, není zavedena kompletní správa příloh, plná lokalizace editoru ani automatické zálohování. Před úpravami nestandardních či důležitých dokumentů si ponechte kopii.

Aplikace je distribuována podle **GNU GPL v3**, viz [`LICENSE`](LICENSE). Dřívější texty o MIT neodpovídaly kořenovému licenčnímu souboru a byly opraveny; tato dokumentační oprava licenci samotnou nemění. Závislosti a přibalené fonty mají vlastní licenční podmínky.
