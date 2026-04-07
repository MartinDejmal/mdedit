/**
 * Editor component.
 *
 * Renders the Tiptap `EditorContent` area.  The `editor` instance itself is
 * created in App so it can be shared with the Toolbar without prop-drilling
 * through extra wrapper components.
 */
import { EditorContent, type Editor } from "@tiptap/react";

interface EditorProps {
  editor: Editor | null;
}

export default function EditorArea({ editor }: EditorProps) {
  return (
    <div className="editor-wrapper">
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}
