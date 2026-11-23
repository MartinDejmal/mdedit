import { useMemo, type MutableRefObject } from "react";
import { basename, parentDirectory, validEntryName } from "../../lib/utils";
import * as bridge from "../../services/tauriBridge";
import { loadAppState, pushRecentFile, removeRecentFile } from "../../services/appStateService";
import { useDocumentStore } from "../../stores/documentStore";
import { useAppUx } from "../ux/useAppUx";
import { createNewUntitledDocument } from "./documentService";
import type { FileActionContext } from "./fileActionService";

export interface BrowserFileOperations {
  renameFile: (path: string) => Promise<string | undefined>;
  moveFile: (path: string, folder?: string) => Promise<string | undefined>;
  deleteFile: (path: string) => Promise<string | undefined>;
  createFolder: (parent: string) => Promise<string | undefined>;
}

export function useBrowserFileOperations(context: FileActionContext, lock: MutableRefObject<boolean>): BrowserFileOperations {
  const { requestInput, confirm } = useAppUx();
  return useMemo(() => {
    const run = async (action: () => Promise<string | undefined>) => {
      if (lock.current) return;
      lock.current = true;
      try { return await action(); }
      catch (error) { context.notify.error({ title: "File operation failed", message: error instanceof Error ? error.message : String(error) }); }
      finally { lock.current = false; }
    };
    const relocate = async (path: string, folder: string, name: string | null = null) => {
      const next = await bridge.relocateMarkdownDocument(path, folder, name);
      const wasCurrent = useDocumentStore.getState().currentFilePath === path;
      if (wasCurrent) useDocumentStore.getState().setFilePath(next);
      const wasRecent = loadAppState().recentFiles.includes(path);
      const state = removeRecentFile(path);
      context.onStateChanged(wasCurrent || wasRecent ? pushRecentFile(next) : state);
      if (wasCurrent) {
        // Path changes must not clear dirty content or replace the editor document.
        const metadata = await bridge.getFileMetadata(next).catch(() => null);
        if (metadata && useDocumentStore.getState().currentFilePath === next) useDocumentStore.setState(state => ({
          activeDocument: { ...state.activeDocument, fileMtime: metadata.modifiedMs, lastObservedDiskMtime: metadata.modifiedMs },
        }));
      }
      return next;
    };
    return {
      renameFile: (path: string) => run(async () => {
        const name = await requestInput({ title: "Rename file", label: "File name (.md)", initialValue: basename(path), confirmLabel: "Rename",
          validation: value => validEntryName(value) && /.+\.md$/i.test(value) ? null : "Enter a valid file name ending in .md." });
        if (!name || name === basename(path)) return;
        return relocate(path, parentDirectory(path), name);
      }),
      moveFile: (path: string, folder?: string) => run(async () => {
        const target = folder ?? await bridge.openFolderDialog();
        if (!target) return;
        return relocate(path, target);
      }),
      deleteFile: (path: string) => run(async () => {
        const state = useDocumentStore.getState();
        const html = context.getEditorHtml();
        if (state.currentFilePath === path && html !== null) await context.reconcileCanonicalFromEditorHtml(html);
        const dirty = useDocumentStore.getState().currentFilePath === path && useDocumentStore.getState().isDirty;
        if (!await confirm({ title: "Delete file?", message: `Permanently delete “${basename(path)}”?${dirty ? " Unsaved changes in this document will also be lost." : ""}`, confirmLabel: "Delete", cancelLabel: "Cancel", variant: "danger" })) return;
        await bridge.deleteMarkdownDocument(path);
        if (useDocumentStore.getState().currentFilePath === path) context.setEditorHtml(createNewUntitledDocument().html);
        context.onStateChanged(removeRecentFile(path));
        return path;
      }),
      createFolder: (parent: string) => run(async () => {
        const name = await requestInput({ title: "New folder", label: "Folder name", initialValue: "New folder", confirmLabel: "Create",
          validation: value => validEntryName(value) ? null : "Enter a valid folder name without path separators." });
        if (!name) return;
        return bridge.createBrowserDirectory(parent, name);
      }),
    };
  }, [context, lock, requestInput, confirm]);
}
