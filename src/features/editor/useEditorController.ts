import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Menu, Submenu, PredefinedMenuItem } from "@tauri-apps/api/menu";

import {
  CodeBlockWithSyntax,
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
import { useAppUx } from "../ux/useAppUx";
import { useDocumentStore } from "../../stores/documentStore";
import {
  getInitialPersistedState,
  runNewAction,
  runOpenAction,
  runOpenRecentAction,
  runReloadAction,
  runSaveAction,
  runSaveAsAction,
  runExportHtmlAction,
  runExportPdfAction,
  runStartupReopenAction,
  createDiscardChangesConfirmOptions,
} from "../documents/fileActionService";
import { reconcileCanonicalFromEditorHtml } from "../documents/documentService";
import {
  getActiveCodeBlockLanguage,
  insertImage,
  insertLink,
  removeLink,
  setCodeBlockLanguage,
  toggleCodeBlock,
} from "./editorCommands";

const APP_NAME = "mdedit";
const RELOAD_ACCELERATOR = "CmdOrCtrl+Alt+R";

const UNTITLED_NAME = "Untitled";

function buildWindowTitle(params: {
  path: string | null;
  isDirty: boolean;
  isUntitled: boolean;
}): string {
  const { path, isDirty, isUntitled } = params;
  if (!path && !isUntitled) return APP_NAME;
  if (!path && isUntitled) {
    return `${isDirty ? "*" : ""}${UNTITLED_NAME} - ${APP_NAME}`;
  }
  const prefix = isDirty ? "*" : "";
  return `${prefix}${basename(path ?? "")} - ${APP_NAME}`;
}
export interface EditorController {
  editor: Editor | null;
  recentFiles: string[];
  hasActiveDocument: boolean;
  handleOpen: () => Promise<void>;
  handleNew: () => Promise<void>;
  handleOpenRecent: (path: string) => Promise<void>;
  handleReload: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleSaveAs: () => Promise<void>;
  handleExportHtml: () => Promise<void>;
  handleExportPdf: () => Promise<void>;
  handleInsertLink: () => Promise<void>;
  handleRemoveLink: () => void;
  handleInsertImage: () => Promise<void>;
  activeCodeBlockLanguage: string | null;
  handleToggleCodeBlock: () => void;
  handleSetCodeBlockLanguage: (language: string) => void;
}

export function useEditorController(): EditorController {
  const isApplyingRemoteContent = useRef(false);
  const allowCloseRef = useRef(false);
  const closeConfirmInFlightRef = useRef(false);
  const reconcileRunIdRef = useRef(0);
  const startupReopenDoneRef = useRef(false);
  const [persistedState, setPersistedState] = useState(getInitialPersistedState);
  const [activeCodeBlockLanguage, setActiveCodeBlockLanguage] = useState<string | null>(null);
  const { isDirty, currentFilePath, isUntitled, hasActiveDocument } =
    useDocumentStore();
  const { confirm, notify, requestInput } = useAppUx();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlockWithSyntax,
      LinkMark,
      ImageNode,
      TaskListNode,
      TaskItemNode,
      TableNode,
      TableRowNode,
      TableHeaderNode,
      TableCellNode,
    ],
    content: "",
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
      editor.commands.focus("start");
    },
    [editor]
  );

  const confirmDiscardUnsavedChanges = useCallback(async () => {
    return confirm(createDiscardChangesConfirmOptions());
  }, [confirm]);

  const actionContext = useMemo(
    () => ({
      getEditorHtml: () => editor?.getHTML() ?? null,
      setEditorHtml,
      reconcileCanonicalFromEditorHtml,
      confirmDiscardChanges: () => confirmDiscardUnsavedChanges(),
      notify,
      onStateChanged: setPersistedState,
    }),
    [confirmDiscardUnsavedChanges, editor, notify, setEditorHtml]
  );

  const handleOpen = useCallback(async () => {
    await runOpenAction(actionContext);
  }, [actionContext]);

  const handleNew = useCallback(async () => {
    await runNewAction(actionContext);
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

  const handleExportHtml = useCallback(async () => {
    await runExportHtmlAction(actionContext);
  }, [actionContext]);

  const handleExportPdf = useCallback(async () => {
    await runExportPdfAction(actionContext);
  }, [actionContext]);

  const handleInsertLink = useCallback(async () => {
    if (!editor) return;
    await insertLink(editor, requestInput);
  }, [editor, requestInput]);

  const handleRemoveLink = useCallback(() => {
    if (!editor) return;
    removeLink(editor);
  }, [editor]);

  const handleInsertImage = useCallback(async () => {
    if (!editor) return;
    await insertImage(editor, requestInput);
  }, [editor, requestInput]);

  const handleToggleCodeBlock = useCallback(() => {
    if (!editor) return;
    toggleCodeBlock(editor);
    setActiveCodeBlockLanguage(getActiveCodeBlockLanguage(editor));
  }, [editor]);

  const handleSetCodeBlockLanguage = useCallback(
    (language: string) => {
      if (!editor) return;
      setCodeBlockLanguage(editor, language);
      setActiveCodeBlockLanguage(getActiveCodeBlockLanguage(editor));
    },
    [editor]
  );

  useEffect(() => {
    if (!editor) {
      setActiveCodeBlockLanguage(null);
      return;
    }

    const syncLanguage = () => {
      setActiveCodeBlockLanguage(getActiveCodeBlockLanguage(editor));
    };

    syncLanguage();
    editor.on("selectionUpdate", syncLanguage);
    editor.on("transaction", syncLanguage);

    return () => {
      editor.off("selectionUpdate", syncLanguage);
      editor.off("transaction", syncLanguage);
    };
  }, [editor]);

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

      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        void handleNew();
      } else if (key === "o" && !event.shiftKey) {
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
  }, [handleNew, handleOpen, handleReload, handleSave, handleSaveAs]);

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
              id: "file-new",
              text: "New",
              accelerator: "CmdOrCtrl+N",
              action: () => void handleNew(),
            },
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
              enabled: Boolean(currentFilePath),
              action: () => void handleReload(),
            },
            await PredefinedMenuItem.new({ item: "Separator" }),
            {
              id: "file-export-html",
              text: "Export as HTML…",
              action: () => void handleExportHtml(),
            },
            {
              id: "file-export-pdf",
              text: "Export as PDF…",
              action: () => void handleExportPdf(),
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
  }, [
    currentFilePath,
    handleNew,
    handleOpen,
    handleOpenRecent,
    handleReload,
    handleSave,
    handleSaveAs,
    handleExportHtml,
    handleExportPdf,
    persistedState.recentFiles,
  ]);

  useEffect(() => {
    const title = buildWindowTitle({
      path: currentFilePath,
      isDirty,
      isUntitled,
    });
    void bridge.setWindowTitle(title);
  }, [currentFilePath, isDirty, isUntitled]);

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
        if (closeConfirmInFlightRef.current) {
          return;
        }

        closeConfirmInFlightRef.current = true;
        const canDiscard = await confirmDiscardUnsavedChanges();
        closeConfirmInFlightRef.current = false;
        if (!canDiscard) return;

        allowCloseRef.current = true;
        try {
          await bridge.closeCurrentWindow();
        } catch (error) {
          allowCloseRef.current = false;
          notify.error({
            title: "Could not close window",
            message: error instanceof Error ? error.message : "Unknown error.",
          });
        }
      })
      .then((cleanup) => {
        unlisten = cleanup;
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [confirmDiscardUnsavedChanges, notify]);

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
      hasActiveDocument,
      handleOpen,
      handleNew,
      handleOpenRecent,
      handleReload,
      handleSave,
      handleSaveAs,
      handleExportHtml,
      handleExportPdf,
      handleInsertLink,
      handleRemoveLink,
      handleInsertImage,
      activeCodeBlockLanguage,
      handleToggleCodeBlock,
      handleSetCodeBlockLanguage,
    }),
    [
      editor,
      handleOpen,
      handleNew,
      handleOpenRecent,
      handleReload,
      handleSave,
      handleSaveAs,
      handleExportHtml,
      handleExportPdf,
      handleInsertLink,
      handleRemoveLink,
      handleInsertImage,
      activeCodeBlockLanguage,
      handleToggleCodeBlock,
      handleSetCodeBlockLanguage,
      hasActiveDocument,
      persistedState.recentFiles,
    ]
  );
}
