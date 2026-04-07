/**
 * Document service.
 *
 * Orchestrates open/save workflow by combining the Tauri bridge (native I/O),
 * markdown conversion and the document store.
 */
import { useDocumentStore } from "../../stores/documentStore";
import * as bridge from "../../services/tauriBridge";
import { markdownToHtml, htmlToMarkdown } from "../../services/markdownService";
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

  const markdown = await bridge.readTextFile(filePath);
  const html = await markdownToHtml(markdown);

  markLoaded({ markdown, path: filePath });

  return { kind: "opened", html };
}

/**
 * Save flow. If no file path exists, falls back to Save As.
 */
export async function saveDocument(editorHtml: string): Promise<SaveDocumentResult> {
  const { currentFilePath, markSaved } = useDocumentStore.getState();

  if (!currentFilePath) {
    return saveDocumentAs(editorHtml);
  }

  const markdown = await htmlToMarkdown(editorHtml);
  await bridge.saveTextFile(currentFilePath, markdown);
  markSaved({ markdown, path: currentFilePath });

  return { kind: "saved", path: currentFilePath };
}

/**
 * Save As flow. Always opens native save dialog.
 */
export async function saveDocumentAs(
  editorHtml: string
): Promise<SaveDocumentResult> {
  const { markSaved } = useDocumentStore.getState();
  const markdown = await htmlToMarkdown(editorHtml);

  const savedPath = await bridge.saveFileDialog(markdown);
  if (!savedPath) {
    return { kind: "cancelled" };
  }

  markSaved({ markdown, path: savedPath });
  return { kind: "saved", path: savedPath };
}
