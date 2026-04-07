/**
 * Toolbar component.
 */
import type { Editor } from "@tiptap/react";

interface ToolbarProps {
  editor: Editor | null;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

export default function Toolbar({ editor, onOpen, onSave, onSaveAs }: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Editor toolbar">
      <div className="toolbar-group">
        <button onClick={onOpen} title="Open Markdown file">
          Open
        </button>
        <button onClick={onSave} title="Save file (Ctrl+S)">
          Save
        </button>
        <button onClick={onSaveAs} title="Save as...">
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
      </div>
    </div>
  );
}
