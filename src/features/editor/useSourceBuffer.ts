import { useCallback, useRef, useState } from "react";
import { reconcileSourceMarkdown } from "../documents/documentService";

export function useSourceBuffer() {
  const [mode, setModeState] = useState(false);
  const modeRef = useRef(false);
  const [text, setText] = useState("");
  const textRef = useRef("");
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [documentRevision, setDocumentRevision] = useState(0);
  const setMode = useCallback((value: boolean) => { modeRef.current = value; setModeState(value); }, []);
  const apply = useCallback((value: string) => {
    textRef.current = value; setText(value); reconcileSourceMarkdown(value); setRevision(value => value + 1);
  }, []);
  const change = useCallback((value: string) => {
    if (value === textRef.current) return;
    past.current.push(textRef.current);
    if (past.current.length > 200) past.current.shift();
    future.current = []; apply(value);
  }, [apply]);
  const reset = useCallback((value: string) => {
    past.current = []; future.current = []; apply(value.replace(/\r\n?/g, "\n")); setDocumentRevision(value => value + 1);
  }, [apply]);
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (previous !== undefined) { future.current.push(textRef.current); apply(previous); }
  }, [apply]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next !== undefined) { past.current.push(textRef.current); apply(next); }
  }, [apply]);
  return { mode, modeRef, setMode, text, textRef, change, reset, undo, redo, revision, documentRevision,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
