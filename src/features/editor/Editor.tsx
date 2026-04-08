/**
 * Editor component.
 *
 * Renders the Tiptap `EditorContent` area.  The `editor` instance itself is
 * created in App so it can be shared with the Toolbar without prop-drilling
 * through extra wrapper components.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FilePlus, FolderOpen, Sparkles } from "lucide-react";
import { EditorContent, type Editor } from "@tiptap/react";
import { basename } from "../../lib/utils";
import OutlineSidebar from "../../components/OutlineSidebar";
import {
  areOutlineHeadingsEqual,
  extractOutlineFromDoc,
  getActiveHeadingId,
  navigateToHeading,
  type OutlineHeading,
} from "./outline";

interface EditorProps {
  editor: Editor | null;
  showEmptyState: boolean;
  recentFiles: string[];
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  isOutlineVisible: boolean;
}

export default function EditorArea({
  editor,
  showEmptyState,
  recentFiles,
  onNew,
  onOpen,
  onOpenRecent,
  isOutlineVisible,
}: EditorProps) {
  const [outlineHeadings, setOutlineHeadings] = useState<OutlineHeading[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const outlineRef = useRef<OutlineHeading[]>([]);

  const updateOutline = useCallback(() => {
    if (!editor) {
      outlineRef.current = [];
      setOutlineHeadings([]);
      setActiveHeadingId(null);
      return;
    }

    const nextOutline = extractOutlineFromDoc(editor.state.doc);
    outlineRef.current = nextOutline;

    setOutlineHeadings((previous) =>
      areOutlineHeadingsEqual(previous, nextOutline) ? previous : nextOutline
    );
    setActiveHeadingId(getActiveHeadingId(nextOutline, editor.state.selection.from));
  }, [editor]);

  const updateActiveHeading = useCallback(() => {
    if (!editor) {
      setActiveHeadingId(null);
      return;
    }

    setActiveHeadingId(
      getActiveHeadingId(outlineRef.current, editor.state.selection.from)
    );
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      updateOutline();
      return;
    }

    updateOutline();

    editor.on("update", updateOutline);
    editor.on("selectionUpdate", updateActiveHeading);

    return () => {
      editor.off("update", updateOutline);
      editor.off("selectionUpdate", updateActiveHeading);
    };
  }, [editor, updateActiveHeading, updateOutline]);

  const handleSelectHeading = useCallback(
    (heading: OutlineHeading) => {
      if (!editor) return;
      navigateToHeading(editor, heading.pos);
      setActiveHeadingId(heading.id);
    },
    [editor]
  );

  if (showEmptyState) {
    return (
      <div className="editor-wrapper empty-state-shell">
        <div className="empty-state-panel">
          <div className="empty-state-title-row">
            <Sparkles size={16} strokeWidth={1.8} aria-hidden />
            <h1>mdedit</h1>
          </div>
          <p>Start a new document or open an existing Markdown file.</p>
          <div className="empty-state-actions">
            <button className="empty-state-primary" onClick={onNew}>
              <FilePlus size={16} strokeWidth={1.9} aria-hidden />
              New
            </button>
            <button className="empty-state-primary" onClick={onOpen}>
              <FolderOpen size={16} strokeWidth={1.9} aria-hidden />
              Open
            </button>
          </div>
          {recentFiles.length > 0 ? (
            <ul className="empty-state-recent-list" aria-label="Recent files">
              {recentFiles.slice(0, 5).map((path) => (
                <li key={path}>
                  <button
                    className="empty-state-recent-item"
                    onClick={() => onOpenRecent(path)}
                    title={path}
                  >
                    {basename(path)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="editor-main">
      {isOutlineVisible ? (
        <OutlineSidebar
          headings={outlineHeadings}
          activeHeadingId={activeHeadingId}
          onSelectHeading={handleSelectHeading}
        />
      ) : null}
      <div className="editor-wrapper">
        <EditorContent editor={editor} className="editor-content" />
      </div>
    </div>
  );
}
