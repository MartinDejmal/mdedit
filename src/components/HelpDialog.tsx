import { useEffect, useRef, useState } from "react";
import czechHelp from "../../docs/user-documentation.html?raw";
import englishHelp from "../../docs/user-documentation.en.html?raw";
import license from "../../LICENSE?raw";

export type HelpView = "help" | "about" | null;

export default function HelpDialog({ view, onClose }: { view: HelpView; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [language, setLanguage] = useState<"cs" | "en">(() => {
    try {
      const saved = localStorage.getItem("mdedit.help.language");
      if (saved === "cs" || saved === "en") return saved;
    } catch { /* Storage may be unavailable; fall back to browser language. */ }
    return navigator.language.toLowerCase().startsWith("cs") ? "cs" : "en";
  });
  const cs = language === "cs";
  useEffect(() => {
    if (!view || !dialog.current) return;
    const node = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    node.showModal();
    return () => { node.close(); if (previous?.isConnected) previous.focus(); };
  }, [view]);
  if (!view) return null;

  return <dialog
    ref={dialog}
    className={`help-dialog ${view === "about" ? "about-dialog" : ""}`}
    aria-labelledby="help-dialog-title"
    lang={language}
    onCancel={onClose}
    onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose();
    }}
  >
    <div className="help-dialog-header">
      <h2 id="help-dialog-title">{view === "help" ? (cs ? "Nápověda mdedit" : "mdedit Help") : (cs ? "O aplikaci mdedit" : "About mdedit")}</h2>
      <div className="help-language" role="group" aria-label={cs ? "Jazyk nápovědy" : "Help language"}>
        {(["cs", "en"] as const).map(value => <button key={value} type="button" lang={value} aria-pressed={language === value} onClick={() => {
          setLanguage(value);
          try { localStorage.setItem("mdedit.help.language", value); } catch { /* Preference remains valid for this session. */ }
        }}>{value === "cs" ? "Čeština" : "English"}</button>)}
      </div>
      <button type="button" className="help-close" autoFocus onClick={onClose}>{cs ? "Zavřít" : "Close"}</button>
    </div>
    {view === "help" ? <iframe
      key={language}
      title={cs ? "Uživatelská příručka mdedit" : "mdedit user guide"}
      srcDoc={cs ? czechHelp : englishHelp}
      sandbox="allow-same-origin"
      onLoad={event => {
        // A sandboxed iframe has its own key events. Forward dismissal without
        // enabling scripts or giving documentation access to the Tauri bridge.
        event.currentTarget.contentDocument?.addEventListener("wheel", wheel => {
          if (wheel.ctrlKey) wheel.preventDefault();
        }, { passive: false });
        event.currentTarget.contentDocument?.addEventListener("keydown", key => {
          if (key.key === "Escape") { key.preventDefault(); onClose(); }
          if (key.key === "F1") key.preventDefault();
        });
      }}
      className="help-content"
    /> : <div className="about-content">
      <p className="about-name">mdedit <span>v{__APP_VERSION__}</span></p>
      <p>{cs ? "Multiplatformní WYSIWYG Markdown editor." : "A cross-platform WYSIWYG Markdown editor."}</p>
      <dl>
        <dt>{cs ? "Autor / projekt" : "Author / project"}</dt><dd>Martin Dejmal · mdedit</dd>
        <dt>{cs ? "Licence aplikace" : "Application license"}</dt><dd>GNU GPL v3</dd>
        <dt>{cs ? "Technologie" : "Technology"}</dt><dd>Tauri 2 · React · TypeScript · Tiptap · Rust</dd>
        <dt>{cs ? "Repozitář a hlášení chyb" : "Repository and issue tracker"}</dt><dd>https://github.com/MartinDejmal/mdedit</dd>
      </dl>
      <p>{cs ? "Dokumenty zůstávají na vašem disku. Nápověda a Mermaid náhled jsou dostupné offline." : "Documents stay on your disk. Help and Mermaid previews are available offline."}</p>
      <details><summary>{cs ? "Úplný text licence" : "Full license text"}</summary><pre>{license}</pre></details>
    </div>}
  </dialog>;
}
