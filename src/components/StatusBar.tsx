/**
 * StatusBar component.
 */
import { useMemo } from "react";
import type { Editor } from "@tiptap/react";
import { useDocumentStatistics } from "../features/editor/useDocumentStatistics";
import { basename } from "../lib/utils";

interface StatusBarProps {
  editor: Editor | null;
  markdown: string;
  isDirty: boolean;
  filePath: string | null;
  hasActiveDocument: boolean;
  hasExternalChangeWarning: boolean;
}

export default function StatusBar({
  editor,
  markdown,
  isDirty,
  filePath,
  hasActiveDocument,
  hasExternalChangeWarning,
}: StatusBarProps) {
  const statistics = useDocumentStatistics(editor);
  const byteSize = useMemo(() => new TextEncoder().encode(markdown).byteLength, [markdown]);
  const filename = filePath
    ? basename(filePath)
    : hasActiveDocument
      ? "Untitled"
      : "No document";
  const dirtyLabel = isDirty ? "Modified" : "Saved";

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <span className="status-path" title={filePath ?? undefined}>
        {filename}
      </span>
      {hasActiveDocument ? (
        <div className="status-statistics" aria-label="Document statistics" aria-live="off">
          <span className="status-lines" title="Logical text lines; wrapping does not add lines">Lines: {statistics.lines}</span>
          <span className="status-words">Words: {statistics.words}</span>
          <span className="status-characters" title="Unicode characters including spaces and line breaks">Chars: {statistics.characters}</span>
          <span className="status-cursor" title="Cursor in editor text (active end of selection), starting at 1">Ln {statistics.line}, Col {statistics.column}</span>
        </div>
      ) : null}
      <div className="status-right">
        {hasExternalChangeWarning ? (
          <span className="status-external-warning">External change detected</span>
        ) : null}
        {hasActiveDocument ? <span className="status-size" title="Current Markdown size in UTF-8 bytes (content to save)">{byteSize} B</span> : null}
        <span className={`status-dirty ${isDirty ? "is-modified" : "is-saved"}`}>
          {dirtyLabel}
        </span>
      </div>
    </div>
  );
}
