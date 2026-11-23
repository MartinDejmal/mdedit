# mdedit jako viewer plugin pro Total Commander

Analýza a návrh, 23. listopadu 2026. Vychází z mdedit 1.1.0, stavu repozitáře v commitu `6d01bbb`. Dokument neobsahuje implementaci ani tvrzení o ověřené kompatibilitě s běžícím Total Commanderem. Při následné aktualizaci uživatelské dokumentace byly popisy licence v README a webu sjednoceny s GPLv3 v LICENSE; původní rozpor níže je historické zjištění, nikoli současný stav těchto textů. Distribuční kompatibilitu případného pluginu je stále nutné posoudit.

## 1. Závěr a doporučení

**Ano, mdedit lze využít jako základ pro prohlížeč Markdownu v Total Commanderu.** Skutečný integrovaný prohlížeč by měl mít podobu **Lister pluginu WLX**, který vytvoří vlastní podřízené okno uvnitř Listeru nebo panelu rychlého náhledu.

Doporučuji malý Windows host pro WLX a WebView2, který znovu použije vykreslování mdedit v režimu pouze pro čtení. Desktopový Tauri runtime, správu souborů a editační workflow bych do tohoto pluginu nepřenášel. Nejde o přejmenování existující DLL ani o pouhé přidání přepínače při sestavení aplikace.

Jako rychlou, samostatně použitelnou alternativu lze nejprve nakonfigurovat mdedit jako **externí prohlížeč**. Aplikace již umí otevřít cestu předanou argumentem. Tato varianta však zobrazí samostatné okno, nikoli vložený panel.

Před rozhodnutím o implementaci jsou dvě podmínky:

1. Ověřit malým Windows prototypem životní cyklus WLX + WebView2, zejména rychlé přepínání a zavření během inicializace.
2. Vyjasnit licenci projektu a distribuční kompatibilitu pluginu s hostitelem a závislostmi. Při analýze byl zjištěn rozpor GPLv3/MIT v popisech; ty byly následně sjednoceny s LICENSE.

## 2. Co už mdedit poskytuje

| Oblast | Zjištěný stav | Dopad na návrh |
|---|---|---|
| Desktop | Tauri 2, React, TypeScript; Cargo.lock připíná Tauri 2.10.3 a Wry 0.54.4 | Lze sdílet webové vykreslování, ale desktopový host není WLX host. |
| Otevření cesty | `get_launch_args` a startup v `useEditorController.ts` otevřou první neparametrový argument | Externí prohlížeč je použitelný bez vývoje pluginu; je nutné otestovat správné předání cesty s mezerami a Unicode. |
| Markdown | `markdownService.ts`, unified/remark/rehype a normalizace přes schéma editoru | Základ převodu je znovu použitelný; dnešní modul už ale závisí i na schématu Tiptap. |
| Vizuální obsah | Tiptap, vlastní tabulky a úkoly, zvýraznění kódu a lokálně balený Mermaid | Viewer může zachovat vzhled a podporované konstrukce bez CDN. |
| UI a stav | Controller instaluje menu, obnovuje poslední dokument, mění titulek a registruje zavírání i drag-and-drop | Viewer potřebuje vlastní vstupní bod; nelze pouze skrýt lištu plné aplikace. |
| Nativní bridge | Čtení, zápis, přesun a mazání souborů, dialogy a export | Viewer má dostat pouze omezený komunikační kanál, nikoli celý bridge editoru. |
| Windows parent | Tauri 2.10.3 má `parent_raw`; běžné `parent` na Windows nastavuje vlastníka | Externí HWND není samo o sobě vyloučeno, ale owner není totéž co vložené child okno. |
| Bezpečnost | Tauri konfigurace má nyní `csp: null` | Pro viewer vytvořit vlastní politiku zdrojů a navigace. |
| Licence | Kořenový `LICENSE` obsahuje GNU GPL verze 3, README v době analýzy uvádělo MIT (nyní opraveno) | Nelze plánovat distribuci s předpokladem licence MIT. |

Samotné nastavení Tiptap na read-only nedokazuje, že původní aplikace přestala zapisovat. Viewer nesmí spouštět obnovu posledního dokumentu, perzistenci seznamu souborů, souborové operace ani editační klávesové příkazy.

## 3. Jaký typ integrace potřebujeme

**WLX / Lister plugin** odpovídá prohlížení souboru přes F3 a integraci do rychlého náhledu Ctrl+Q. WFX řeší souborové systémy, WCX archivy a WDX obsahové sloupce; pro tento účel nejsou správným rozhraním. Windows Explorer Preview Handler je další samostatné rozhraní, nikoli náhrada WLX.

Plugin je nativní DLL načtená do procesu hostitele. Obvykle se distribuuje jako `.wlx` pro 32bit a `.wlx64` pro 64bit Total Commander. Rozhoduje architektura **procesu Total Commanderu**, nikoli jen Windows. Pro první vydání dává smysl x64; x86 má být samostatný ověřený artefakt, pokud je požadováno i 32bit TC.

Referenční SDK hlavička obsahuje následující vstupní body [1]:

| Rozhraní | Navržené použití |
|---|---|
| `ListLoadW`, případně kompatibilní `ListLoad` | Přijmout cestu a parent HWND, vytvořit a vrátit child HWND vieweru. Unicode varianta má být hlavní cestou. |
| `ListCloseWindow` | Uvolnit konkrétní instanci, handlery a její prostředky. |
| `ListGetDetectString` | Omezit automatickou detekci na `.md` a `.markdown`; přesnou syntaxi a délková omezení převzít z originálního SDK. |
| `ListSetDefaultParams` | Zjistit podporovanou verzi rozhraní a umístění konfigurace. |
| `ListLoadNextW` / `ListLoadNext` | Později efektivně přepínat dokument bez vytváření nového WebView; vyplatí se už při ověřování Ctrl+Q. |
| `ListSearchTextW` a `ListSendCommand` | Postupně podpořit hledání, kopírování a výběr všeho podle očekávání Listeru. |
| `ListPrintW`, `ListNotificationReceived`, další volitelné exporty | Až podle konkrétních požadavků a ověřené sémantiky SDK. |

Není nutné implementovat všechny volitelné exporty, ale nesmí se hlásit úspěch u neprovedené operace. Přesné minimum, návratové hodnoty, rozložení struktur a pravidla pro ANSI fallback je nutné před implementací potvrdit v originálním SDK. Windows ABI musí odpovídat SDK, včetně volací konvence a názvů exportů na x86. Pointery a HWND nesmějí být zkráceny na 32 bitů v x64 buildu.

Neimplementovaná přípona má v automatickém režimu přenechat soubor dalšímu vieweru. Vynucené zobrazení má mít jasnou chybovou obrazovku, pokud obsah nelze vykreslit. Automatický náhled `.txt` bych v MVP nezapínal, aby plugin nepřebíral standardní textový Lister.

## 4. Varianty řešení

| Varianta | Výhody | Nevýhody | Hodnocení |
|---|---|---|---|
| A. mdedit jako externí viewer | Téměř bez vývoje, plný editor, již podporované CLI otevření | Samostatné okno; není vložený Ctrl+Q náhled; dnešní startup není explicitní read-only režim | Praktické okamžité řešení, ale ne WLX. |
| B. WLX spouští běžné EXE a připojí jeho okno | Zdánlivě maximální reuse aplikace | Křehké cross-process připojení oken, DPI, fokus, životní cyklus, procesy a IPC; editorové dialogy mohou blokovat náhled | Nedoporučuji jako produkční základ. |
| C. Celý Tauri runtime uvnitř WLX DLL | Vysoký reuse UI; Tauri nabízí raw parent HWND [2] | Událostní smyčka, globální runtime a menu, vlákna, více instancí a unload DLL; současný `run()` provozuje desktopovou aplikaci | Technicky otevřená možnost, nikoli ověřené hotové řešení. Vyšší integrační riziko. |
| D. Tenký WLX host + WebView2 + sdílený renderer | Přirozené child HWND, kontrola oprávnění a životního cyklu, nezávislost na desktopovém shellu | Nový Windows host a viewer build, nutnost vyčlenit sdílené vykreslování | **Doporučená cesta ke skutečnému pluginu.** |

U varianty D lze host napsat v Rustu s Win32/WebView2 vazbami, nebo v C++ podle zkušeností týmu. Rust odpovídá dnešnímu backendu, C++ má přímo dostupné příklady Microsoftu. Samotná volba jazyka ale neřeší COM a životní cyklus. Wry poskytuje `build_as_child` [3] a může část hostování usnadnit; jeho vhodnost pro DLL uvnitř cizí aplikace je stále nutné ověřit prototypem.

## 5. Doporučená architektura

Navržený tok: **Total Commander → WLX adaptér → child HWND / WebView2 → read-only renderer mdedit**.

### Sdílená a oddělená část

Sdílet podporované Markdown konstrukce, normalizaci obsahu, schéma Tiptap, styly, zvýraznění kódu a Mermaid. Zachování read-only Tiptap view se stejnými rozšířeními je vhodnější výchozí bod než další nezávislý HTML renderer, který by se vizuálně rozcházel s editorem.

Desktopová aplikace a viewer však potřebují oddělené vstupní body a host adaptéry. Sdílená vrstva nesmí při importu vyžadovat Tauri IPC, instalovat menu nebo manipulovat se soubory a uživatelským stavem. Aktuální závislosti mezi `markdownService.ts`, schématem editoru a node views je nutné při tomto oddělení explicitně zkontrolovat.

Host načte pouze požadovaný soubor. Renderer dostane obsah, identifikátor požadavku, omezené nastavení a povolený kontext pro obrázky. Zpět může odeslat stav načtení, chybu, požadavek na hledání nebo otevření odkazu. Nedostane obecné příkazy pro zápis, mazání, spouštění procesů nebo libovolné čtení disku.

### Vlastnosti MVP

- Samostatný Windows x64 WLX pro F3 i Ctrl+Q, podporující Unicode cesty.
- Read-only vykreslení nadpisů, seznamů, úkolů, tabulek, odkazů, kódu a Mermaid.
- Výběr a kopírování textu, zoom a korektní přizpůsobení velikosti panelu.
- Žádná nástrojová lišta editoru, filebrowser, Save dialog, obnova posledního souboru ani zápis do prohlížených souborů.
- Jasný loading/error stav, možnost přejít na běžné prohlížení v TC a případně explicitně otevřít dokument v desktopovém mdedit.
- Omezená velikost souboru a složitost náhledu; například 10 MiB jako počáteční měřitelná hypotéza, ne jako údaj o již ověřené kapacitě.

Hledání podle Lister rozhraní, x86 balíček, tisk a konfigurace tématu jsou další kroky. Zda je hledání podmínkou první veřejné verze, má rozhodnout ověření skutečného použití F3/Ctrl+Q, nikoli pouze existence webového Ctrl+F.

## 6. Životní cyklus, vlákna a asynchronní načítání

Toto je největší technické riziko. WebView2 vyžaduje STA UI vlákno s běžící message pumpou; jeho objekty a callbacky jsou navázané na toto vlákno. Blokující čekání na asynchronní inicializaci může způsobit deadlock [4].

Doporučený průběh:

1. WLX export převezme argumenty a zkopíruje potřebná data. Plugin nevlastní životnost vstupních pointerů TC.
2. Vytvoří vlastní child HWND s loading stavem a rychle jej vrátí hostiteli. Vytváření WebView2 pokračuje asynchronně; na UI vlákně se nečeká na dokončení blokující synchronizací.
3. Každá instance dostane vlastní stav, identifikátor dokumentu a generaci požadavku. Pozdní výsledek A nesmí překreslit již zvolený dokument B.
4. Při změně velikosti se aktualizují bounds WebView2; otestuje se DPI i přesun mezi monitory.
5. Při zavření se instance označí jako zrušená, odpojí se události, uzavře controller a uvolní zdroje. Callback po zavření nesmí přistoupit k již zničenému HWND nebo stavu.
6. DLL musí zůstat platná po dobu callbacků, které mohou zavolat její kód. Zrušení instance pouhým číslem generace neřeší unload samotného modulu. Držení a uvolňování referencí modulu je nutné navrhnout a otestovat samostatně.

Před vytvořením WebView ověřit skutečný COM apartment a vlákno, na kterém Total Commander volá plugin. Nelze předpokládat, že toto chování již bylo ověřeno. První prototyp má preferovat kompatibilní hostitelské UI vlákno a jeho existující message pumpu. Vyhrazené STA vlákno je alternativa, pokud se ukáže nutné, ale přidává cross-thread vlastnictví oken, fokus a koordinaci zavírání.

Do `DllMain` nepatří inicializace Tauri/WebView2, spouštění renderování, čekání na jiné vlákno ani složitý úklid. Výjimka ani Rust panic nesmějí opustit exportované ABI. Stav jednotlivých Lister oken se nesmí zaměnit v globálním „aktuálním souboru“.

Tauri metoda `parent_raw` ani Wry `build_as_child` tyto povinnosti samy neodstraňují. Běžný Tauri `parent` je navíc na Windows owner vztah, nikoli požadované vložení do client oblasti [2].

## 7. Obsah souborů, bezpečnost a soukromí

Plugin zobrazuje nedůvěryhodné dokumenty uvnitř procesu správce souborů. Read-only znamená zákaz editačních a souborových operací, nikoli automatickou bezpečnost vykresleného obsahu.

- Běhový kód a frontend assety balit lokálně. Nezavádět lokální HTTP server s otevřeným portem ani CDN jako nutnou součást náhledu.
- Assety aplikace obsloužit z jednoho kontrolovaného originu; přístup k adresáři dokumentu nesmí znamenat zpřístupnění celého disku webu.
- Cesty k obrázkům vyhodnocovat v hostiteli vzhledem k dokumentu, včetně kanonikalizace, symlinků a hranic povolené oblasti. Pro MVP povolit pouze bezpečné lokální prostředky v určené oblasti a podporované data URL; zamítnout traversal mimo ni. Chybějící obrázek nemá zablokovat textový náhled.
- U souborů dočasně vybalených z archivu může chybět původní adresář obrázků. Po zavření nesmí zůstat souborový handle, který zabrání TC odstranit dočasný soubor.
- Vzdálené obrázky a jiné dokumentem vyvolané síťové požadavky ve výchozím stavu nepovolovat. Chrání to offline použití i před odesláním informací o otevření dokumentu na cizí server.
- Sanitizovat výsledné HTML a filtrovat URL schémata. Neimportovat automaticky důvěru ani `csp: null` z desktopové konfigurace. Mermaid `strict` je užitečný, ale nenahrazuje celou politiku vieweru.
- Odkazy na web otevírat pouze explicitní akcí uživatele, kontrolovaným způsobem mimo plugin. Navigaci a nové webové okno blokovat nebo řídit podle allowlistu [5].
- Zprávy JS ↔ host omezit na pevné schéma a kontrolovaný origin. Markdown ani cesta k souboru se nesmějí skládat do spustitelného JavaScriptu.
- Síťový/UNC soubor číst mimo blokující UI cestu s chybovým a časovým limitem. Soubor během prohlížení může zmizet nebo se změnit; chyba má zůstat lokální instanci.
- Velký nebo patologický Mermaid diagram potřebuje limity vstupu a zotavení rendereru. Samotný Promise timeout nezastaví synchronně vytížený JavaScript.
- Profil WebView2 ukládat do uživatelské zapisovatelné oblasti oddělené od desktopového mdedit, ne vedle DLL v Program Files. Neuchovávat obsah dokumentů v logu; vyřešit retenci cache/profilu a podporu přenosné instalace.

WebView2 používá další procesy pro webový obsah, ale DLL host stále běží uvnitř Total Commanderu. Chyba v nativním pluginu může shodit celý správce souborů. Spuštění hostitele se zvýšenými oprávněními je zvláštní scénář k ověření, ne doporučený výchozí režim [5].

## 8. Distribuce a licence

Balíček pluginu má obsahovat WLX/WLX64 artefakt odpovídající architektuře, lokální viewer assety, instalační metadata podle originálního TC SDK, příslušné licence a dokumentaci WebView2 runtime. Přesný formát instalačního ZIP a detekce verzí TC se musí ověřit proti oficiální distribuci SDK.

WebView2 Evergreen Runtime je externí předpoklad, není totožný s nainstalovaným prohlížečem Edge. Jeho nepřítomnost musí vést ke srozumitelnému výsledku, nikoli pádu TC nebo nekonečnému čekání. Ověřit strategii loaderu, jeho bitness a distribuční podmínky; alternativní Fixed Version distribuce znamená větší balíček a vlastní odpovědnost za aktualizace.

**Licenční stav je nutné vyřešit před zveřejněním.** `LICENSE` uvádí GPLv3; tehdejší nesprávné popisy MIT v README a webu byly následně opraveny. Na základě této analýzy nelze automaticky vyvodit, že spojení GPL komponenty s proprietárním hostitelem nebo WebView2 je distribuovatelná kombinace. Je nutné posoudit charakter propojení, příslušné výjimky a podmínky všech použitých částí. Pokud by byla potřebná výjimka či dual licensing, musí ji umožnit skutečná autorská práva ke všem dotčeným příspěvkům. Oddělený proces sám o sobě není univerzální licenční řešení.

Projekt sám licenci tímto dokumentem nemění. Při distribuci dále zahrnout licenční informace sdílených JS závislostí, Mermaid a případně přibalených fontů. Referenční SDK z Double Commanderu slouží k pochopení rozhraní, nikoli jako automaticky schválený zdroj ke kopírování implementace či hlaviček bez kontroly jejich podmínek.

## 9. Postup realizace a rozhodovací brány

| Etapa | Výstup | Podmínka pokračování |
|---|---|---|
| 0. Zpřesnění | Rozhodnout read-only rozsah, x64/x86, podporované TC/Windows verze a licenci; získat originální SDK | Vyřešené distribuční předpoklady a potvrzené ABI. |
| 1. Externí viewer | Ověřená konfigurace mdedit jako externího vieweru a způsob předání cesty | Praktická alternativa pro uživatele; stále nejde o vložený plugin. |
| 2. Integrační spike | Minimalistický WLX s child HWND, statickým WebView obsahem, korektním resize a close | F3 i Ctrl+Q, opakované otevření/zavření, ověřené STA a žádný zamrzlý hostitel. |
| 3. Shared viewer | Oddělený read-only vstupní bod se stejným Markdown/Tiptap/Mermaid vykreslováním | Bez závislosti na desktopovém Tauri bridge a bez dokumentem vyvolané sítě. |
| 4. MVP plugin | Unicode, přepínání dokumentů, lokální obrázky, limity, chybové stavy, kopírování a balíček x64 | Akceptační matice níže splněná na Windows. |
| 5. Dopracování | Hledání Listeru, konfigurace, případně x86, tisk a volba „Open in mdedit“ | Další ověřené potřeby uživatelů, ne podmínka prvního prototypu. |

Orientačně: konfigurace externího vieweru je práce v řádu hodin; integrační spike přibližně 2–5 pracovních dnů pro člověka se zkušeností s Win32/COM; po úspěšném spike robustní MVP přibližně 2–4 týdny. Jsou to plánovací odhady, nikoli závazný termín. Vyřešení licencí, x86 kompatibilita a případná potřeba jiného vláknového modelu mohou rozsah podstatně změnit.

Pokud spike neprokáže bezpečný životní cyklus a nezablokované UI, neinvestovat do přenášení celého editoru do DLL. Zachovat externí viewer jako funkční alternativu a přehodnotit hostovací vrstvu.

## 10. Akceptační a regresní matice

- F3 Lister, Ctrl+Q náhled a více současně otevřených oken mají nezávislý stav.
- Rychlé střídání alespoň stovek dokumentů nezobrazuje pozdní náhled starého souboru a nevede k soustavnému růstu handle/GDI/COM prostředků nebo počtu procesů.
- Zavření ihned po otevření, během čtení souboru, inicializace WebView2 i renderování Mermaid nevyvolá pád, deadlock ani callback do uvolněné DLL.
- Unicode, mezery, UNC a dlouhé cesty, soubory z archivu a soubor odstraněný během náhledu mají definovaný výsledek. Podporu dlouhých cest nelze prohlásit pouze podle Unicode exportu.
- Resize na velmi úzký panel, maximalizace, změna monitoru/DPI, fokus a klávesy navigace TC fungují bez samostatného nechtěného okna.
- Text lze vybrat a kopírovat; klávesy určené hostiteli nejsou bezdůvodně pohlceny webview. Implementované Lister příkazy se ověří zvlášť od zkratek v DOM.
- Náhled stejných souborů se porovná s mdedit: nadpisy, seznamy, úkoly, tabulky, kód, diakritika, obrázky, Mermaid a chybné diagramy.
- Náhled nezmění obsah ani metadata zápisu prohlíženého souboru a nedrží jej po zavření otevřený. Neobnovuje jiný „poslední soubor“.
- Chybějící runtime, odmítnutý přístup, nepodporované kódování a překročené limity nezablokují Total Commander.
- Offline režim funguje bez síťových požadavků z dokumentu; nebezpečné odkazy, skripty a únik přes relativní obrázky jsou odmítnuty.
- Finální balíčky se ověří v čistých Windows prostředích s odpovídajícím TC x64/x86 a s runtime i bez něj. Samotný JS/browser test nebo úspěšný build DLL kompatibilitu s TC neprokazuje.

## 11. Otevřené otázky před implementací

1. Je hlavním cílem rychlý Ctrl+Q náhled, samostatný F3 Lister, nebo spíše externí editor? Návrh doporučuje pro skutečný plugin podporovat první dvě možnosti.
2. Stačí x64, nebo je x86 podmínkou prvního vydání? Jaké nejstarší verze Windows/TC skutečně podporovat?
3. Má být obsah vždy pouze pro čtení? Pro MVP ano; editace a ukládání by znamenaly nový kontrakt i riziko konfliktů s operacemi TC.
4. Má veřejné MVP vyžadovat integraci hledání do Listeru a tisk? Návrh odděluje jejich návratové hodnoty a dostupnost od základního zobrazení.
5. Jaké lokální obrázky mají být povolené mimo složku dokumentu, zvláště u archivů a UNC? Síťový obsah doporučuji zakázat jako výchozí stav.
6. Popisy licence již byly sjednoceny podle GPLv3 v `LICENSE`. Jaké podmínky dovolí distribuci výsledné kombinace pluginu a hostitele?

Tyto otázky nebrání závěru o technické proveditelnosti. Brání však označení návrhu za připravený k veřejnému vydání bez dalšího ověření.

## 12. Zdroje a meze ověření

Ověřeno bylo čtením aktuálního repozitáře mdedit, lokálně dostupných zdrojů připnutého Tauri a veřejných zdrojů SDK/WebView2. Nebyl vytvořen ani spuštěn plugin, testován Total Commander, upravena licence nebo napsán implementační kód.

1. **WLX rozhraní:** [hlavička `wlxplugin.h` v SDK Double Commanderu](https://github.com/doublecmd/doublecmd/blob/ff468878cd1b6c6bea3a98bbb25dc9852f818fce/sdk/wlxplugin.h), [volací konvence v `common.h`](https://github.com/doublecmd/doublecmd/blob/ff468878cd1b6c6bea3a98bbb25dc9852f818fce/sdk/common.h). Ověřené deklarace kompatibilního rozhraní; nejde o náhradu originálního TC SDK a jeho dokumentace.
2. **Tauri 2.10.3:** [zdroj WebviewWindow](https://github.com/tauri-apps/tauri/blob/tauri-v2.10.3/crates/tauri/src/webview/webview_window.rs). Metody `parent`, `owner_raw` a `parent_raw` byly navíc ověřeny přímo v lokálně staženém crate Tauri 2.10.3 používaném tímto projektem.
3. **Wry:** [podřízené webview a `build_as_child`](https://github.com/tauri-apps/wry/blob/d07ff5a4c0b9555dfaaf970f5eefab17ead08f6e/src/lib.rs). Prostudovaná upstream větev; není to důkaz, že každá popsaná vlastnost je beze změny dostupná v projektové verzi Wry 0.54.4.
4. **Microsoft WebView2, vlákna:** [threading model](https://github.com/MicrosoftDocs/edge-developer/blob/f8757d5112c86c2e45a42b2180f2617f27963294/microsoft-edge/webview2/concepts/threading-model.md). STA, message pump, nepodporovaná reentrance a riziko blokujících čekání.
5. **Microsoft WebView2, bezpečnost:** [security guidance](https://github.com/MicrosoftDocs/edge-developer/blob/f8757d5112c86c2e45a42b2180f2617f27963294/microsoft-edge/webview2/concepts/security.md). Origin, validace komunikace, omezení host objektů a navigace.
6. **Microsoft WebView2, controller:** [referenční dokumentace prostředí](https://github.com/MicrosoftDocs/webview2-win32-reference/blob/main/1-0-3537-50/icorewebview2environment.md). Parent HWND, asynchronní vytvoření controlleru, zavření parent okna během vytváření a konflikty uživatelského profilu.
7. **Oficiální Total Commander:** [pluginy](https://www.ghisler.com/plugins.htm), [Lister pluginy](https://www.ghisler.com/lsplugins.htm). Přímé načtení těchto stránek v tomto prostředí vracelo HTTP 403. Jejich aktuální obsah ani balík originálního SDK proto nebyly ověřeny; před implementací je nutné je získat a potvrdit kontrakt i distribuční pravidla.
8. **mdedit:** [repozitář](https://github.com/MartinDejmal/mdedit/tree/6d01bbb39a98255c1fa532dfb33dc33315bf0fd0), zejména `src-tauri/Cargo.toml`, `Cargo.lock`, `tauri.conf.json`, nativní `run()`/`get_launch_args`, editor controller, Markdown pipeline a kořenový `LICENSE`.
