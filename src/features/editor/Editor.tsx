/**
 * Editor component.
 *
 * Renders the Tiptap `EditorContent` area.  The `editor` instance itself is
 * created in App so it can be shared with the Toolbar without prop-drilling
 * through extra wrapper components.
 */
import { EditorContent, type Editor } from "@tiptap/react";
import { basename } from "../../lib/utils";

interface EditorProps {
  editor: Editor | null;
  showEmptyState: boolean;
  recentFiles: string[];
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
}

export default function EditorArea({
  editor,
  showEmptyState,
  recentFiles,
  onNew,
  onOpen,
  onOpenRecent,
}: EditorProps) {
  if (showEmptyState) {
    return (
      <div className="editor-wrapper empty-state-shell">
        <div className="empty-state-panel">
          <h1>mdedit</h1>
          <p>Start a new document or open an existing Markdown file.</p>
          <div className="empty-state-actions">
            <button onClick={onNew}>New</button>
            <button onClick={onOpen}>Open</button>
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
    <div className="editor-wrapper">
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}
