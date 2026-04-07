/**
 * App – root component.
 *
 * Creates the Tiptap editor instance and owns the open / save handlers.
 * Passes the editor down to Toolbar (for formatting commands) and
 * EditorArea (for rendering), keeping both components thin.
 */
import { useCallback, useEffect } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import Layout from "../components/Layout";
import Toolbar from "../components/Toolbar";
import EditorArea from "../features/editor/Editor";
import StatusBar from "../components/StatusBar";

import { openDocument, saveDocument } from "../features/documents/documentService";
import { useDocumentStore } from "../stores/documentStore";

/** Sample content shown when no file is open. */
const WELCOME_HTML = `
<h1>Welcome to mdedit</h1>
<p>A lightweight WYSIWYG Markdown editor. Click <strong>Open</strong> in the toolbar to load a <code>.md</code> file, or start typing here.</p>
<h2>Supported formatting</h2>
<ul>
  <li><strong>Bold</strong> and <em>italic</em> text</li>
  <li>Headings, bullet &amp; ordered lists</li>
  <li>Blockquotes and code blocks</li>
  <li>Inline <code>code</code> and horizontal rules</li>
</ul>
<blockquote><p>Edit in rich text — save as Markdown.</p></blockquote>
<pre><code>const hello = "world";</code></pre>
<hr>
<p>Use the toolbar above or standard keyboard shortcuts (Ctrl+B, Ctrl+I, …) to format text.</p>
`;

export default function App() {
  const { isDirty, currentFilePath, markDirty } = useDocumentStore();

  const editor = useEditor({
    extensions: [StarterKit],
    content: WELCOME_HTML,
    onUpdate: () => {
      markDirty();
    },
  });

  const handleOpen = useCallback(async () => {
    const html = await openDocument();
    if (html !== null && editor) {
      // Replace editor content without triggering the onUpdate dirty flag
      editor.commands.setContent(html, false);
    }
  }, [editor]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    await saveDocument(editor.getHTML());
  }, [editor]);

  // Ctrl+S / Cmd+S keyboard shortcut for save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  return (
    <Layout>
      <Toolbar editor={editor} onOpen={handleOpen} onSave={handleSave} />
      <EditorArea editor={editor} />
      <StatusBar isDirty={isDirty} filePath={currentFilePath} />
    </Layout>
  );
}
