import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Menu, Submenu, PredefinedMenuItem } from "@tauri-apps/api/menu";

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
import * as bridge from "../../services/tauriBridge";
import { useDocumentStore } from "../../stores/documentStore";
import {
  getInitialPersistedState,
  runOpenAction,
  runOpenRecentAction,
  runReloadAction,
  runSaveAction,
  runSaveAsAction,
  runStartupReopenAction,
} from "../documents/fileActionService";
import { reconcileCanonicalFromEditorHtml } from "../documents/documentService";

const APP_NAME = "mdedit";
const RELOAD_ACCELERATOR = "CmdOrCtrl+Alt+R";

const WELCOME_HTML = `
<h1>Welcome to mdedit</h1>
<p>A lightweight WYSIWYG Markdown editor. Click <strong>Open</strong> in the toolbar to load a <code>.md</code> file, or start typing here.</p>
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
  recentFiles: string[];
  handleOpen: () => Promise<void>;
  handleOpenRecent: (path: string) => Promise<void>;
  handleReload: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleSaveAs: () => Promise<void>;
}

export function useEditorController(): EditorController {
  const isApplyingRemoteContent = useRef(false);
  const allowCloseRef = useRef(false);
  const reconcileRunIdRef = useRef(0);
  const startupReopenDoneRef = useRef(false);
  const [persistedState, setPersistedState] = useState(getInitialPersistedState);
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

  const setEditorHtml = useCallback(
    (html: string) => {
      if (!editor) return;
      isApplyingRemoteContent.current = true;
      editor.commands.setContent(html, false);
      isApplyingRemoteContent.current = false;
    },
    [editor]
  );

  const actionContext = useMemo(
    () => ({
      getEditorHtml: () => editor?.getHTML() ?? null,
      setEditorHtml,
      reconcileCanonicalFromEditorHtml,
      confirmDiscardChanges: confirmDiscardUnsavedChanges,
      onStateChanged: setPersistedState,
    }),
    [editor, setEditorHtml]
  );

  const handleOpen = useCallback(async () => {
    await runOpenAction(actionContext);
  }, [actionContext]);

  const handleOpenRecent = useCallback(
    async (path: string) => {
      await runOpenRecentAction(path, actionContext);
    },
    [actionContext]
  );

  const handleSave = useCallback(async () => {
    await runSaveAction(actionContext);
  }, [actionContext]);

  const handleReload = useCallback(async () => {
    await runReloadAction(actionContext);
  }, [actionContext]);

  const handleSaveAs = useCallback(async () => {
    await runSaveAsAction(actionContext);
  }, [actionContext]);

  useEffect(() => {
    if (!editor || startupReopenDoneRef.current) return;
    startupReopenDoneRef.current = true;
    void runStartupReopenAction(actionContext, persistedState);
  }, [actionContext, editor, persistedState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      const key = event.key.toLowerCase();

      if (key === "o" && !event.shiftKey) {
        event.preventDefault();
        void handleOpen();
      } else if (key === "s" && event.shiftKey) {
        event.preventDefault();
        void handleSaveAs();
      } else if (key === "s") {
        event.preventDefault();
        void handleSave();
      } else if (key === "r" && event.altKey) {
        event.preventDefault();
        void handleReload();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleOpen, handleReload, handleSave, handleSaveAs]);

  useEffect(() => {
    let disposed = false;

    const installMenu = async () => {
      try {
        const recentMenu = await Submenu.new({
          text: "Recent Files",
          items:
            persistedState.recentFiles.length > 0
              ? persistedState.recentFiles.map((path, index) => ({
                  id: `recent-${index}`,
                  text: basename(path),
                  action: () => {
                    void handleOpenRecent(path);
                  },
                }))
              : [{ id: "recent-empty", text: "No recent files", enabled: false }],
        });

        const fileSubmenu = await Submenu.new({
          text: "File",
          items: [
            {
              id: "file-open",
              text: "Open…",
              accelerator: "CmdOrCtrl+O",
              action: () => void handleOpen(),
            },
            {
              id: "file-save",
              text: "Save",
              accelerator: "CmdOrCtrl+S",
              action: () => void handleSave(),
            },
            {
              id: "file-save-as",
              text: "Save As…",
              accelerator: "CmdOrCtrl+Shift+S",
              action: () => void handleSaveAs(),
            },
            {
              id: "file-reload",
              text: "Reload from disk",
              accelerator: RELOAD_ACCELERATOR,
              action: () => void handleReload(),
            },
            await PredefinedMenuItem.new({ item: "Separator" }),
            recentMenu,
            await PredefinedMenuItem.new({ item: "Separator" }),
            await PredefinedMenuItem.new({ item: "Quit" }),
          ],
        });

        const editSubmenu = await Submenu.new({
          text: "Edit",
          items: [
            await PredefinedMenuItem.new({ item: "Undo" }),
            await PredefinedMenuItem.new({ item: "Redo" }),
            await PredefinedMenuItem.new({ item: "Separator" }),
            await PredefinedMenuItem.new({ item: "Cut" }),
            await PredefinedMenuItem.new({ item: "Copy" }),
            await PredefinedMenuItem.new({ item: "Paste" }),
            await PredefinedMenuItem.new({ item: "Separator" }),
            await PredefinedMenuItem.new({ item: "SelectAll" }),
          ],
        });

        const menu = await Menu.new({
          items: [fileSubmenu, editSubmenu],
        });

        if (!disposed) {
          await menu.setAsAppMenu();
        }
      } catch {
        // Menu API is unavailable in browser preview mode.
      }
    };

    void installMenu();

    return () => {
      disposed = true;
    };
  }, [handleOpen, handleOpenRecent, handleReload, handleSave, handleSaveAs, persistedState.recentFiles]);

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
    () => ({
      editor,
      recentFiles: persistedState.recentFiles,
      handleOpen,
      handleOpenRecent,
      handleReload,
      handleSave,
      handleSaveAs,
    }),
    [
      editor,
      handleOpen,
      handleOpenRecent,
      handleReload,
      handleSave,
      handleSaveAs,
      persistedState.recentFiles,
    ]
  );
}
