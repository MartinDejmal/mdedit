/**
 * Toolbar component.
 */
import type { Editor } from "@tiptap/react";

import {
  insertDefaultTable,
  insertImage,
  insertLink,
  insertTaskList,
  removeLink,
} from "../features/editor/editorCommands";
import { basename } from "../lib/utils";

interface ToolbarProps {
  editor: Editor | null;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  recentFiles: string[];
  onReload: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  canReload: boolean;
  highlightReload: boolean;
}

export default function Toolbar({
  editor,
  onOpen,
  onOpenRecent,
  recentFiles,
  onReload,
  onSave,
  onSaveAs,
  canReload,
  highlightReload,
}: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Editor toolbar">
      <div className="toolbar-group">
        <button onClick={onOpen} title="Open Markdown file (Ctrl/Cmd+O)">
          Open
        </button>
        <select
          className="toolbar-recent-select"
          value=""
          onChange={(event) => {
            const path = event.target.value;
            if (!path) return;
            onOpenRecent(path);
            event.currentTarget.value = "";
          }}
          title="Recent files"
        >
          <option value="">Recent Files…</option>
          {recentFiles.map((path) => (
            <option key={path} value={path}>
              {basename(path)}
            </option>
          ))}
        </select>
        <button
          onClick={onReload}
          disabled={!canReload}
          className={highlightReload ? "recommended" : ""}
          title={
            canReload
              ? "Reload current file from disk (Ctrl/Cmd+Alt+R)"
              : "Reload is available only for saved files"
          }
        >
          Reload
        </button>
        <button onClick={onSave} title="Save file (Ctrl/Cmd+S)">
          Save
        </button>
        <button onClick={onSaveAs} title="Save as... (Ctrl/Cmd+Shift+S)">
          Save As
        </button>
      </div>

      <div className="toolbar-divider" aria-hidden />

      <div className="toolbar-group">
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={editor?.isActive("bold") ? "active" : ""}
          disabled={!editor}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>

        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={editor?.isActive("italic") ? "active" : ""}
          disabled={!editor}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>

        <button
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run()
          }
          className={
            editor?.isActive("heading", { level: 1 }) ? "active" : ""
          }
          disabled={!editor}
          title="Heading 1"
        >
          H1
        </button>

        <button
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          className={
            editor?.isActive("heading", { level: 2 }) ? "active" : ""
          }
          disabled={!editor}
          title="Heading 2"
        >
          H2
        </button>

        <button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={editor?.isActive("bulletList") ? "active" : ""}
          disabled={!editor}
          title="Bullet list"
        >
          • List
        </button>

        <button
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className={editor?.isActive("orderedList") ? "active" : ""}
          disabled={!editor}
          title="Ordered list"
        >
          1. List
        </button>

        <button
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          className={editor?.isActive("blockquote") ? "active" : ""}
          disabled={!editor}
          title="Blockquote"
        >
          ❝
        </button>

        <button
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          className={editor?.isActive("codeBlock") ? "active" : ""}
          disabled={!editor}
          title="Code block"
        >
          {"</>"}
        </button>

        <button
          onClick={() => editor && insertLink(editor)}
          className={editor?.isActive("link") ? "active" : ""}
          disabled={!editor}
          title="Add link"
        >
          Link
        </button>

        <button
          onClick={() => editor && removeLink(editor)}
          disabled={!editor || !editor.isActive("link")}
          title="Remove link"
        >
          Unlink
        </button>

        <button
          onClick={() => editor && insertTaskList(editor)}
          className={editor?.isActive("taskList") ? "active" : ""}
          disabled={!editor}
          title="Insert task list"
        >
          Task List
        </button>

        <button
          onClick={() => editor && insertDefaultTable(editor)}
          className={editor?.isActive("table") ? "active" : ""}
          disabled={!editor}
          title="Insert default table"
        >
          Table
        </button>

        <button
          onClick={() => editor && insertImage(editor)}
          disabled={!editor}
          title="Insert image from URL"
        >
          Image
        </button>
      </div>
    </div>
  );
}
