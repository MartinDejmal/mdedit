import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { searchDocument, searchKey, replacementText } from "../features/editor/search";

export function openFind(replace = false) { window.dispatchEvent(new CustomEvent("mdedit:find", { detail: replace })); }

export default function FindBar({ editor, enabled, filePath }: { editor: Editor | null; enabled: boolean; filePath: string | null }) {
  const [open, setOpen] = useState(false);
  const [replace, setReplace] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [regex, setRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const result = editor && open && enabled ? searchDocument(editor.state.doc, query, regex, matchCase) : { matches: [], error: "" };
  const index = result.matches.length ? Math.min(active, result.matches.length - 1) : 0;
  const close = () => { setOpen(false); editor?.commands.focus(); };

  useEffect(() => { setOpen(false); }, [filePath]);
  useEffect(() => {
    const show = (event: Event) => {
      if (!enabled || document.querySelector("dialog[open]")) return;
      setReplace(Boolean((event as CustomEvent).detail)); setOpen(true);
      requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
    };
    const keys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || document.querySelector("dialog[open]")) return;
      if (event.key.toLowerCase() === "f" || event.key.toLowerCase() === "h") {
        event.preventDefault(); openFind(event.key.toLowerCase() === "h");
      }
    };
    window.addEventListener("mdedit:find", show); window.addEventListener("keydown", keys);
    return () => { window.removeEventListener("mdedit:find", show); window.removeEventListener("keydown", keys); };
  }, [enabled]);
  useEffect(() => {
    if (!editor) return;
    const update = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) setRevision(value => value + 1);
    };
    editor.on("transaction", update);
    return () => { editor.off("transaction", update); };
  }, [editor]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(searchKey, { matches: result.matches, active: index }));
    if (open && result.matches[index]) {
      editor.chain().setTextSelection({ from: result.matches[index].from, to: result.matches[index].to }).scrollIntoView().run();
    }
    // Recompute decorations on content/search changes, not on selection-only transactions.
  }, [editor, open, enabled, query, regex, matchCase, active, revision]);

  function replaceMatches(all: boolean) {
    if (!editor || !result.matches.length) return;
    let tr = closeHistory(editor.state.tr);
    const matches = all ? result.matches : [result.matches[index]];
    for (const match of [...matches].reverse()) tr = tr.insertText(replacementText(match, replacement, regex), match.from, match.to);
    editor.view.dispatch(tr);
  }
  if (!open || !enabled) return null;
  return <div className="find-bar" role="search" aria-label="Find and replace" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === "Enter") { event.preventDefault(); setActive((index + (event.shiftKey ? -1 : 1) + result.matches.length) % (result.matches.length || 1)); }
  }}>
    <input ref={input} aria-label="Find" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} />
    <label><input type="checkbox" checked={matchCase} onChange={event => { setMatchCase(event.target.checked); setActive(0); }} />Match case</label>
    <label><input type="checkbox" checked={regex} onChange={event => { setRegex(event.target.checked); setActive(0); }} />Regex</label>
    <span role="status">{result.error || `${result.matches.length ? index + 1 : 0} / ${result.matches.length}`}</span>
    <button disabled={!result.matches.length} onClick={() => setActive((index - 1 + result.matches.length) % result.matches.length)}>Previous</button>
    <button disabled={!result.matches.length} onClick={() => setActive((index + 1) % result.matches.length)}>Next</button>
    <button aria-pressed={replace} onClick={() => setReplace(value => !value)}>Replace…</button>
    {replace && <><input aria-label="Replace with" value={replacement} onChange={event => setReplacement(event.target.value)} />
      <button disabled={!result.matches.length} onClick={() => replaceMatches(false)}>Replace</button>
      <button disabled={!result.matches.length} onClick={() => replaceMatches(true)}>Replace all</button></>}
    <button onClick={close} aria-label="Close find">×</button>
  </div>;
}
