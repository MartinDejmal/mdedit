/**
 * Document service.
 *
 * Orchestrates open/save workflow by combining the Tauri bridge (native I/O),
 * markdown conversion and the document store.
 */
import { useDocumentStore } from "../../stores/documentStore";
import * as bridge from "../../services/tauriBridge";
import {
  parseMarkdownToEditorContent,
  serializeEditorToMarkdown,
} from "../../services/markdownService";
import type {
  OpenDocumentResult,
  ReloadDocumentResult,
  SaveDocumentResult,
} from "../../types";

export type ConfirmDiscardChanges = () => Promise<boolean>;

interface OpenDocumentOptions {
  confirmDiscardChanges?: ConfirmDiscardChanges;
}

async function loadPathIntoStore(
  filePath: string,
  source: "open" | "reload"
): Promise<OpenDocumentResult> {
  const rawMarkdown = await bridge.readTextFile(filePath);
  const { editorContent, canonicalMarkdown } =
    await parseMarkdownToEditorContent(rawMarkdown);
  const metadata = await bridge.getFileMetadata(filePath);

  useDocumentStore.getState().markLoaded({
    rawMarkdown,
    canonicalMarkdown,
    path: filePath,
    fileMtime: metadata.modifiedMs,
    source,
  });

  return { kind: "opened", html: editorContent, path: filePath };
}

/**
 * Open flow with dirty-check confirmation.
 */
export async function openDocument(
  options: OpenDocumentOptions = {}
): Promise<OpenDocumentResult> {
  const { isDirty } = useDocumentStore.getState();

  if (isDirty && options.confirmDiscardChanges) {
    const canDiscard = await options.confirmDiscardChanges();
    if (!canDiscard) {
      return { kind: "cancelled" };
    }
  }

  const filePath = await bridge.openFileDialog();
  if (!filePath) {
    return { kind: "cancelled" };
  }

  return loadPathIntoStore(filePath, "open");
}

/** Opens a known path (used by recent files and startup restore). */
export async function openDocumentFromPath(
  filePath: string,
  options: OpenDocumentOptions = {}
): Promise<OpenDocumentResult> {
  const { isDirty } = useDocumentStore.getState();

  if (isDirty && options.confirmDiscardChanges) {
    const canDiscard = await options.confirmDiscardChanges();
    if (!canDiscard) {
      return { kind: "cancelled" };
    }
  }

  try {
    return await loadPathIntoStore(filePath, "open");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to open selected file.";

    return { kind: "error", message, path: filePath };
  }
}

/** Save flow. If no file path exists, falls back to Save As. */
export async function saveDocument(): Promise<SaveDocumentResult> {
  const { currentFilePath, currentCanonicalMarkdown, markSaved } =
    useDocumentStore.getState();

  if (!currentFilePath) {
    return saveDocumentAs();
  }

  await bridge.saveTextFile(currentFilePath, currentCanonicalMarkdown);
  const metadata = await bridge.getFileMetadata(currentFilePath);

  markSaved({
    canonicalMarkdown: currentCanonicalMarkdown,
    path: currentFilePath,
    fileMtime: metadata.modifiedMs,
  });

  return { kind: "saved", path: currentFilePath };
}

/** Save As flow. Always opens native save dialog. */
export async function saveDocumentAs(): Promise<SaveDocumentResult> {
  const { currentCanonicalMarkdown, markSaved } = useDocumentStore.getState();

  const savedPath = await bridge.saveFileDialog(currentCanonicalMarkdown);
  if (!savedPath) {
    return { kind: "cancelled" };
  }

  const metadata = await bridge.getFileMetadata(savedPath);

  markSaved({
    canonicalMarkdown: currentCanonicalMarkdown,
    path: savedPath,
    fileMtime: metadata.modifiedMs,
  });
  return { kind: "saved", path: savedPath };
}

/** Explicit reload flow for the currently open document path. */
export async function reloadDocumentFromDisk(
  options: OpenDocumentOptions = {}
): Promise<ReloadDocumentResult> {
  const { currentFilePath, isDirty } = useDocumentStore.getState();

  if (!currentFilePath) {
    return { kind: "noop" };
  }

  if (isDirty && options.confirmDiscardChanges) {
    const canDiscard = await options.confirmDiscardChanges();
    if (!canDiscard) {
      return { kind: "cancelled" };
    }
  }

  try {
    const loaded = await loadPathIntoStore(currentFilePath, "reload");
    return { kind: "reloaded", html: loaded.html };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to reload document from disk.";

    return { kind: "error", message };
  }
}

/**
 * Helper used by editor controller to synchronise editor content into canonical markdown.
 */
export async function reconcileCanonicalFromEditorHtml(
  editorHtml: string
): Promise<string> {
  const canonicalMarkdown = await serializeEditorToMarkdown(editorHtml);
  useDocumentStore
    .getState()
    .reconcileCurrentCanonicalMarkdown(canonicalMarkdown);
  return canonicalMarkdown;
}
