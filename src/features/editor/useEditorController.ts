import type { HelpView } from "../../components/HelpDialog";
import { EditorState } from "@tiptap/pm/state";
import { useBrowserFileOperations, type BrowserFileOperations } from "../documents/useBrowserFileOperations";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import { CheckMenuItem, Menu, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";

import { createEditorExtensions } from "./editorSchema";

import { parentDirectory, basename } from "../../lib/utils";
import { saveAppState, type AppearanceSettings } from "../../services/appStateService";
import * as bridge from "../../services/tauriBridge";
import { useAppUx } from "../ux/useAppUx";
import { useDocumentStore } from "../../stores/documentStore";
import {
  getInitialPersistedState,
  runNewAction,
  runOpenAction,
  runOpenBrowserAction,
  runOpenRecentAction,
  runReloadAction,
  runSaveAction,
  runSaveAsAction,
  runExportHtmlAction,
  runExportPdfAction,
  runStartupReopenAction,
  runOpenFromArgAction,
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
import { useDragDropHandler } from "./useDragDropHandler";

const APP_VERSION = __APP_VERSION__;
const APP_NAME = `mdedit v${APP_VERSION}`;
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
  activeDialog: HelpView | "settings";
  showSettings: () => void;
  appearanceSettings: AppearanceSettings;
  applySettings: (fonts: AppearanceSettings) => boolean;
  closeDialog: () => void;
  browserLocation: { path: string; version: number } | null;
  browserOperations: BrowserFileOperations;
  editor: Editor | null;
  recentFiles: string[];
  hasActiveDocument: boolean;
  isDragOver: boolean;
  handleOpen: () => Promise<void>;
  handleNew: () => Promise<void>;
  handleOpenRecent: (path: string) => Promise<void>;
  handleOpenBrowserFile: (path: string) => Promise<string | null>;
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
  selectedBrowserFolder: string | null;
  handleSelectBrowserFolder: (path: string) => void;
  folderRefresh: { path: string; version: number } | null;
  isBrowserVisible: boolean;
  handleToggleBrowser: () => void;
  isOutlineVisible: boolean;
  handleToggleOutline: () => void;
  outlineSidebarWidth: number;
  handleOutlineWidthChange: (width: number) => void;
}

export function useEditorController(): EditorController {
  const [activeDialog, setActiveDialog] = useState<HelpView | "settings">(null);
  const showSettings = useCallback(() => {
    if (!document.querySelector("dialog[open]")) setActiveDialog("settings");
  }, []);
  const showHelp = useCallback(() => setActiveDialog("help"), []);
  const showAbout = useCallback(() => setActiveDialog("about"), []);
  const closeDialog = useCallback(() => setActiveDialog(null), []);
  const isApplyingRemoteContent = useRef(false);
  const browserSwitchInFlight = useRef(false);
  const closeConfirmInFlightRef = useRef(false);
  const startupReopenDoneRef = useRef(false);
  const [selectedBrowserFolder, setSelectedBrowserFolder] = useState<string | null>(null);
  const [folderRefresh, setFolderRefresh] = useState<{ path: string; version: number } | null>(null);
  const handleSelectBrowserFolder = useCallback((path: string) => setSelectedBrowserFolder(path), []);
  const [isBrowserVisible, setIsBrowserVisible] = useState(false);
  const [browserLocation, setBrowserLocation] = useState<{ path: string; version: number } | null>(null);
  const handleToggleBrowser = useCallback(() => {
    const path = useDocumentStore.getState().currentFilePath;
    if (!isBrowserVisible && path) {
      const folder = parentDirectory(path);
      setSelectedBrowserFolder(folder);
      setBrowserLocation(previous => ({ path: folder, version: (previous?.version ?? 0) + 1 }));
    }
    setIsBrowserVisible(!isBrowserVisible);
  }, [isBrowserVisible]);
  const [persistedState, setPersistedState] = useState(getInitialPersistedState);
  const applySettings = useCallback((fonts: AppearanceSettings) => {
    const current = getInitialPersistedState();
    const next = { ...current, settings: { ...current.settings, ...fonts } };
    try {
      saveAppState(next);
    } catch {
      return false;
    }
    setPersistedState(next);
    closeDialog();
    return true;
  }, [closeDialog]);
  const [activeCodeBlockLanguage, setActiveCodeBlockLanguage] = useState<string | null>(null);
  const { isDirty, currentFilePath, isUntitled, hasActiveDocument } =
    useDocumentStore();
  const { confirm, notify, requestInput, requestSaveChanges } = useAppUx();

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: "",
    onUpdate: ({ editor: nextEditor }) => {
      if (isApplyingRemoteContent.current) return;

      void reconcileCanonicalFromEditorHtml(nextEditor.getHTML());
    },
  });

  const setEditorHtml = useCallback(
    (html: string) => {
      if (!editor) return;
      isApplyingRemoteContent.current = true;
      editor.commands.setContent(html, true);
      // Undo must start with user edits in this document, not loading a file or
      // editing a previously opened document. Reinitialize plugin state/history.
      editor.view.updateState(EditorState.create({
        schema: editor.schema, doc: editor.state.doc,
        selection: editor.state.selection, plugins: editor.state.plugins,
      }));
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

  const browserOperations = useBrowserFileOperations(actionContext, browserSwitchInFlight);

  const handleOpenBrowserFile = useCallback(async (path: string) => {
    if (browserSwitchInFlight.current) return useDocumentStore.getState().currentFilePath;
    browserSwitchInFlight.current = true;
    try {
      await runOpenBrowserAction(path, {
        ...actionContext,
        setEditorHtml: (html) => {
          setEditorHtml(html);
          // The editor DOM is reused between files, including its scroll offset.
          // Reset only when the new document has actually replaced the old one.
          const viewport = editor?.view.dom.closest(".editor-wrapper");
          if (viewport) {
            viewport.scrollTop = 0;
            viewport.scrollLeft = 0;
          }
        },
      }, requestSaveChanges);
      return useDocumentStore.getState().currentFilePath;
    } finally {
      browserSwitchInFlight.current = false;
    }
  }, [actionContext, editor, requestSaveChanges, setEditorHtml]);

  const handleOpen = useCallback(async () => {
    await runOpenAction(actionContext);
  }, [actionContext]);

  const { isDragOver } = useDragDropHandler(actionContext);

  const handleNew = useCallback(async () => {
    if (browserSwitchInFlight.current) return;
    browserSwitchInFlight.current = true;
    try {
      const folder = isBrowserVisible ? selectedBrowserFolder : null;
      const path = await runNewAction(actionContext, folder);
      if (path && folder) setFolderRefresh((previous) => ({ path: folder, version: (previous?.version ?? 0) + 1 }));
    } finally {
      browserSwitchInFlight.current = false;
    }
  }, [actionContext, isBrowserVisible, selectedBrowserFolder]);

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

  const handleToggleOutline = useCallback(() => {
    setPersistedState((current) => {
      const nextState = {
        ...current,
        ui: {
          ...current.ui,
          isOutlineVisible: !current.ui.isOutlineVisible,
        },
      };
      saveAppState(nextState);
      return nextState;
    });
  }, []);

  const handleOutlineWidthChange = useCallback((width: number) => {
    setPersistedState((current) => {
      const nextState = {
        ...current,
        ui: {
          ...current.ui,
          outlineSidebarWidth: width,
        },
      };
      saveAppState(nextState);
      return nextState;
    });
  }, []);

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

    const handleStartup = async () => {
      // Check for a file path passed as a command-line argument (e.g. "Open With" on Windows).
      try {
        const args = await bridge.getLaunchArgs();
        const filePath = args.find((arg) => !arg.startsWith("-"));
        if (filePath) {
          const opened = await runOpenFromArgAction(filePath, actionContext);
          if (opened) return; // Arg-driven open succeeded; skip startup reopen.
        }
      } catch {
        // getLaunchArgs unavailable in browser preview or other environments; fall through.
      }

      await runStartupReopenAction(actionContext, persistedState);
    };

    void handleStartup();
  }, [actionContext, editor, persistedState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F1") { event.preventDefault(); if (activeDialog !== "settings") showHelp(); return; }
      if ((event.target as Element)?.closest?.("dialog[open]")) return;
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
  }, [handleNew, handleOpen, handleReload, handleSave, handleSaveAs, showHelp, activeDialog]);

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
          enabled: activeDialog === null,
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
          enabled: activeDialog === null,
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

        const viewSubmenu = await Submenu.new({
          text: "View",
          enabled: activeDialog === null,
          items: [
            await CheckMenuItem.new({
              id: "view-toggle-file-browser",
              text: "Toggle file browser",
              checked: isBrowserVisible,
              action: handleToggleBrowser,
            }),
            await CheckMenuItem.new({
              id: "view-toggle-outline",
              text: "Toggle Outline",
              checked: persistedState.ui.isOutlineVisible,
              action: () => {
                handleToggleOutline();
              },
            }),
            { id: "view-settings", text: "Settings…", action: showSettings },
          ],
        });

        const helpSubmenu = await Submenu.new({
          text: "Help",
          enabled: activeDialog !== "settings",
          items: [
            { id: "help-guide", text: "Help", accelerator: "F1", action: showHelp },
            { id: "help-about", text: "About", action: showAbout },
          ],
        });
        const menu = await Menu.new({
          items: [fileSubmenu, editSubmenu, viewSubmenu, helpSubmenu],
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
    showHelp,
    showAbout,
    showSettings,
    activeDialog,
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
    persistedState.ui.isOutlineVisible,
    handleToggleOutline,
    isBrowserVisible,
    handleToggleBrowser,
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
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void bridge
      .onWindowCloseRequested(async (event) => {
        // Handle every close ourselves so destroy errors are reported even when
        // the document is clean, rather than escaping from Tauri's listener.
        event.preventDefault();
        if (disposed || closeConfirmInFlightRef.current) return;

        closeConfirmInFlightRef.current = true;
        try {
          closeDialog();
          if (useDocumentStore.getState().isDirty) {
            const canDiscard = await confirmDiscardUnsavedChanges();
            if (!canDiscard || disposed) return;
          }
          await bridge.destroyCurrentWindow();
        } catch (error) {
          if (!disposed) {
            notify.error({
              title: "Could not close window",
              message: error instanceof Error ? error.message : "Unknown error.",
            });
          }
        } finally {
          // A failed confirmation or destroy must not block subsequent attempts.
          closeConfirmInFlightRef.current = false;
        }
      })
      .then((cleanup) => {
        // Registration is asynchronous: React StrictMode may already have run
        // the effect cleanup before the listener becomes available.
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => {
        if (!disposed) {
          notify.error({
            title: "Could not register window close handler",
            message: error instanceof Error ? error.message : "Unknown error.",
          });
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [confirmDiscardUnsavedChanges, notify, closeDialog]);

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
      appearanceSettings: persistedState.settings,
      applySettings,
      activeDialog,
      showSettings,
      closeDialog,
      editor,
      recentFiles: persistedState.recentFiles,
      hasActiveDocument,
      isDragOver,
      handleOpen,
      handleNew,
      handleOpenRecent,
      handleOpenBrowserFile,
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
      browserLocation,
      browserOperations,
      selectedBrowserFolder,
      handleSelectBrowserFolder,
      folderRefresh,
      isBrowserVisible,
      handleToggleBrowser,
      isOutlineVisible: persistedState.ui.isOutlineVisible,
      handleToggleOutline,
      outlineSidebarWidth: persistedState.ui.outlineSidebarWidth,
      handleOutlineWidthChange,
    }),
    [
      persistedState.settings,
      applySettings,
      activeDialog,
      showSettings,
      closeDialog,
      editor,
      handleOpen,
      handleNew,
      handleOpenRecent,
      handleOpenBrowserFile,
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
      handleToggleOutline,
      handleOutlineWidthChange,
      hasActiveDocument,
      isDragOver,
      persistedState.recentFiles,
      persistedState.ui.isOutlineVisible,
      browserLocation,
      browserOperations,
      selectedBrowserFolder,
      handleSelectBrowserFolder,
      folderRefresh,
      isBrowserVisible,
      handleToggleBrowser,
      persistedState.ui.outlineSidebarWidth,
    ]
  );
}
