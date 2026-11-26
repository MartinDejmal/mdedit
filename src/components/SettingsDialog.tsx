import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { editorFontStyle } from "../lib/editorFontStyle";
import type { AppearanceSettings } from "../services/appStateService";
import { listFontFamilies } from "../services/tauriBridge";

interface FontAccessWindow extends Window {
  queryLocalFonts?: () => Promise<{ family: string }[]>;
}

interface Props {
  settings: AppearanceSettings;
  onApply: (settings: AppearanceSettings) => boolean;
  onClose: () => void;
}

export default function SettingsDialog({ settings, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const [field, setField] = useState<"editorFontFamily" | "codeFontFamily">("editorFontFamily");
  const [search, setSearch] = useState("");
  const [families, setFamilies] = useState<string[]>([]);
  const desktop = isTauri();
  const fontWindow = window as FontAccessWindow;
  const [status, setStatus] = useState<"loading" | "ready" | "manual">(desktop ? "loading" : "manual");
  const [message, setMessage] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);

  function setFamily(value: string) {
    setDraft(previous => ({ ...previous, [field]: value || null }));
  }

  function selectField(next: "editorFontFamily" | "codeFontFamily") {
    setField(next);
    setSearch("");
  }

  function findInstalledFamily(family: string | null) {
    const key = family?.trim().toLowerCase();
    if (!key) return undefined;
    return families.find(name => name.toLowerCase() === key);
  }

  function applySettings() {
    const saved = onApply({
      theme: draft.theme,
      editorFontFamily: findInstalledFamily(draft.editorFontFamily) ?? (draft.editorFontFamily?.trim() || null),
      codeFontFamily: findInstalledFamily(draft.codeFontFamily) ?? (draft.codeFontFamily?.trim() || null),
    });
    if (!saved) setSaveFailed(true);
  }

  function showFamilies(names: string[]) {
    const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));
    setFamilies(sorted);
    setStatus(sorted.length ? "ready" : "manual");
    setMessage(sorted.length ? "" : "No installed fonts were reported.");
  }

  async function loadBrowserFonts() {
    if (!fontWindow.queryLocalFonts) return;
    setStatus("loading");
    setMessage("");
    try {
      const faces = await fontWindow.queryLocalFonts();
      showFamilies(faces.map(face => face.family));
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Local font access was denied. You can allow it in your browser’s site settings."
        : "The browser could not list installed fonts.");
      setStatus("manual");
    }
  }

  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    let active = true;
    if (desktop) {
      listFontFamilies().then(names => {
        if (active) showFamilies(names);
      }).catch(error => {
        if (!active) return;
        setMessage(`Could not read the desktop font list: ${String(error)}`);
        setStatus("manual");
      });
    }
    return () => { active = false; node.close(); };
  }, [desktop]);

  const query = search.trim().toLowerCase();
  const matches = families.filter(name => name.toLowerCase().includes(query));
  const family = draft[field];
  const listedFamily = findInstalledFamily(family);
  const selectedFamily = listedFamily ?? family;
  const editingCode = field === "codeFontFamily";
  const defaultLabel = editingCode ? "Monospace default" : "Editor default";

  return <dialog ref={dialog} className="help-dialog font-dialog" aria-labelledby="font-title" onCancel={onClose}
    onKeyDownCapture={event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }}>
    <div className="help-dialog-header"><h2 id="font-title">Settings</h2></div>
    <div className="settings-appearance">
      <label htmlFor="appearance-theme">Appearance</label>
      <select id="appearance-theme" value={draft.theme} onChange={event => setDraft(previous => ({ ...previous, theme: event.target.value as AppearanceSettings["theme"] }))}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>
      <h3>Fonts</h3>
    </div>
    <div className="font-switch" role="group" aria-label="Font settings category">
      <button type="button" aria-pressed={!editingCode} aria-describedby="font-text-description"
        onClick={() => selectField("editorFontFamily")}>Text</button>
      <span id="font-text-description">Headings and body text</span>
      <button type="button" aria-pressed={editingCode} aria-describedby="font-code-description"
        onClick={() => selectField("codeFontFamily")}>Code</button>
      <span id="font-code-description">Inline code and code blocks</span>
    </div>
    <div className="font-dialog-body">
      {status === "manual" ? <>
        <label htmlFor="font-name">Installed font family name</label>
        <input id="font-name" value={family ?? ""} autoFocus placeholder={defaultLabel}
          onChange={event => setFamily(event.target.value)} />
        <p>Enter a font name to preview it. Clear the field to restore the default.</p>
        {!desktop && fontWindow.queryLocalFonts &&
          <button type="button" onClick={loadBrowserFonts}>Load installed fonts</button>}
      </> : <>
        <label htmlFor="font-search">Search fonts</label>
        <input id="font-search" type="search" autoFocus value={search} onChange={e => setSearch(e.target.value)} />
        <label htmlFor="font-family">{editingCode ? "Code font" : "Editor font"}</label>
        <select id="font-family" size={6} value={selectedFamily ?? ""} onChange={event => setFamily(event.target.value)}>
          <option value="">{defaultLabel}</option>
          {selectedFamily && !matches.includes(selectedFamily) && (
            <option value={selectedFamily}>{selectedFamily}{status === "ready" && !listedFamily ? " (unavailable)" : ""}</option>
          )}
          {matches.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </>}
      <div role="status">
        {status === "loading" && "Loading installed fonts…"}
        {message}
        {status === "ready" && !matches.length && (query ? "No matching fonts." : "No installed fonts found.")}
      </div>
      <section aria-label="Font preview" className="font-preview" style={editorFontStyle(draft)}>
        {editingCode ? <>
          <p>Use <code>greet("world")</code> to print a greeting.</p>
          <pre><code>{'function greet(name) {\n  console.log("Hello, " + name);\n}'}</code></pre>
        </> : <>
          <h1>This is the main heading</h1>
          <p lang="en">
            This is the first paragraph. <strong>This is how bold text looks</strong>, and{" "}
            <em>this is how italic text looks</em>.
          </p>
        </>}
      </section>
    </div>
    {saveFailed && <p className="font-save-error" role="alert">Could not save settings. Select OK to try again.</p>}
    <div className="font-actions">
      <button type="button" onClick={onClose}>Cancel</button>
      <button type="button" onClick={applySettings}>OK</button>
    </div>
  </dialog>;
}
