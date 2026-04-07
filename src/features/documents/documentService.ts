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
import type { OpenDocumentResult, SaveDocumentResult } from "../../types";

export type ConfirmDiscardChanges = () => Promise<boolean>;

interface OpenDocumentOptions {
  confirmDiscardChanges?: ConfirmDiscardChanges;
}

/**
 * Open flow with dirty-check confirmation.
 */
export async function openDocument(
  options: OpenDocumentOptions = {}
): Promise<OpenDocumentResult> {
  const { isDirty, markLoaded } = useDocumentStore.getState();

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

  const rawMarkdown = await bridge.readTextFile(filePath);
  const { editorContent, canonicalMarkdown } =
    await parseMarkdownToEditorContent(rawMarkdown);
  const metadata = await bridge.getFileMetadata(filePath);

  markLoaded({
    rawMarkdown,
    canonicalMarkdown,
    path: filePath,
    fileMtime: metadata.modifiedMs,
  });

  return { kind: "opened", html: editorContent };
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
