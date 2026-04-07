import { useCallback, useEffect, useMemo, useRef } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import {
  ImageNode,
  LinkMark,
  TableCellNode,
  TableHeaderNode,
  TableNode,
  TableRowNode,
  TaskItemNode,
  TaskListNode,
} from "./editorExtensions";

import { basename } from "../../lib/utils";
import {
  openDocument,
  reconcileCanonicalFromEditorHtml,
  reloadDocumentFromDisk,
  saveDocument,
  saveDocumentAs,
} from "../documents/documentService";
import * as bridge from "../../services/tauriBridge";
import { useDocumentStore } from "../../stores/documentStore";

const APP_NAME = "mdedit";

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

function buildWindowTitle(path: string | null, isDirty: boolean): string {
  if (!path) return APP_NAME;
  const prefix = isDirty ? "*" : "";
  return `${prefix}${basename(path)} - ${APP_NAME}`;
}

function confirmDiscardUnsavedChanges(): Promise<boolean> {
  return Promise.resolve(
    window.confirm("You have unsaved changes. Discard them?")
  );
}

export interface EditorController {
  editor: Editor | null;
  handleOpen: () => Promise<void>;
  handleReload: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleSaveAs: () => Promise<void>;
}

export function useEditorController(): EditorController {
  const isApplyingRemoteContent = useRef(false);
  const allowCloseRef = useRef(false);
  const reconcileRunIdRef = useRef(0);
  const { isDirty, currentFilePath } = useDocumentStore();

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkMark,
      ImageNode,
      TaskListNode,
      TaskItemNode,
      TableNode,
      TableRowNode,
      TableHeaderNode,
      TableCellNode,
    ],
    editorProps: {
      handleClick(_view, _pos, event) {
        const target = event.target as HTMLElement | null;
        const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;

        if (!anchor) return false;
        if (!(event.metaKey || event.ctrlKey)) return false;

        window.open(anchor.href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
    content: WELCOME_HTML,
    onUpdate: ({ editor: nextEditor }) => {
      if (isApplyingRemoteContent.current) return;

      const runId = ++reconcileRunIdRef.current;
      void reconcileCanonicalFromEditorHtml(nextEditor.getHTML()).then(() => {
        if (runId !== reconcileRunIdRef.current) {
          return;
        }
      });
    },
  });

  const syncCurrentEditorCanonical = useCallback(async () => {
    if (!editor) return;
    await reconcileCanonicalFromEditorHtml(editor.getHTML());
  }, [editor]);

  const handleOpen = useCallback(async () => {
    const result = await openDocument({
      confirmDiscardChanges: confirmDiscardUnsavedChanges,
    });

    if (result.kind !== "opened" || !result.html || !editor) {
      return;
    }

    isApplyingRemoteContent.current = true;
    editor.commands.setContent(result.html, false);
    isApplyingRemoteContent.current = false;
  }, [editor]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    await syncCurrentEditorCanonical();
    await saveDocument();
  }, [editor, syncCurrentEditorCanonical]);

  const handleReload = useCallback(async () => {
    const result = await reloadDocumentFromDisk({
      confirmDiscardChanges: confirmDiscardUnsavedChanges,
    });

    if (result.kind === "error") {
      window.alert(`Reload failed: ${result.message ?? "Unknown error"}`);
      return;
    }

    if (result.kind !== "reloaded" || !result.html || !editor) {
      return;
    }

    isApplyingRemoteContent.current = true;
    editor.commands.setContent(result.html, false);
    isApplyingRemoteContent.current = false;
  }, [editor]);

  const handleSaveAs = useCallback(async () => {
    if (!editor) return;
    await syncCurrentEditorCanonical();
    await saveDocumentAs();
  }, [editor, syncCurrentEditorCanonical]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  useEffect(() => {
    const title = buildWindowTitle(currentFilePath, isDirty);
    void bridge.setWindowTitle(title);
  }, [currentFilePath, isDirty]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useDocumentStore.getState().isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void bridge
      .onWindowCloseRequested(async (event) => {
        if (allowCloseRef.current) {
          return;
        }

        if (!useDocumentStore.getState().isDirty) {
          return;
        }

        event.preventDefault();
        const canDiscard = await confirmDiscardUnsavedChanges();
        if (!canDiscard) return;

        allowCloseRef.current = true;
        await bridge.closeCurrentWindow();
      })
      .then((cleanup) => {
        unlisten = cleanup;
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let isRunning = false;

    const checkExternalChange = async () => {
      if (isRunning) return;

      const {
        currentFilePath: activePath,
        activeDocument,
        markExternalChangeWarning,
      } = useDocumentStore.getState();

      if (!activePath || activeDocument.fileMtime === null) {
        return;
      }

      isRunning = true;
      try {
        const metadata = await bridge.getFileMetadata(activePath);
        if (
          metadata.modifiedMs !== null &&
          metadata.modifiedMs !== activeDocument.fileMtime
        ) {
          markExternalChangeWarning({
            detectedAt: new Date().toISOString(),
            detectedMtime: metadata.modifiedMs,
          });
        }
      } finally {
        isRunning = false;
      }
    };

    const onFocus = () => {
      void checkExternalChange();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkExternalChange();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return useMemo(
    () => ({ editor, handleOpen, handleReload, handleSave, handleSaveAs }),
    [editor, handleOpen, handleReload, handleSave, handleSaveAs]
  );
}
