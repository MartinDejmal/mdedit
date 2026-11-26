import { useEffect, useRef } from "react";

export default function SourceEditor({ text, onChange, documentRevision, onCursor }: {
  text: string; onChange: (text: string) => void; documentRevision: number; onCursor: (offset: number) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const report = () => {
    const node = ref.current;
    if (node) onCursor(node.selectionDirection === "backward" ? node.selectionStart : node.selectionEnd);
  };
  useEffect(() => {
    const node = ref.current!;
    node.setSelectionRange(0, 0); node.scrollTop = 0; node.scrollLeft = 0;
    if (!document.querySelector("dialog[open]")) node.focus({ preventScroll: true });
    onCursor(0);
  }, [documentRevision]);
  useEffect(() => { report(); }, [text]);
  return <textarea ref={ref} className="source-editor" aria-label="Markdown source" spellCheck={false} wrap="off"
    value={text} onChange={event => onChange(event.target.value)} onSelect={report} onKeyUp={report} onClick={report} />;
}
