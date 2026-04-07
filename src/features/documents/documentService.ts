/**
 * Document service.
 *
 * Orchestrates the open/save workflow by combining the Tauri bridge (native
 * I/O), the markdown service (format conversion), and the document store
 * (application state).  React components should call these functions instead
 * of importing the bridge or store directly.
 */
import { useDocumentStore } from "../../stores/documentStore";
import * as bridge from "../../services/tauriBridge";
import { markdownToHtml, htmlToMarkdown } from "../../services/markdownService";

/**
 * Opens the native file-picker dialog, reads the chosen Markdown file, and
 * returns the HTML string to load into the editor.  Updates the store with
 * the new file path and raw content.
 *
 * Returns `null` if the dialog was cancelled or the file could not be read.
 */
export async function openDocument(): Promise<string | null> {
  const { setContent, setFilePath, resetDirty } =
    useDocumentStore.getState();

  const filePath = await bridge.openFileDialog();
  if (!filePath) return null;

  const markdown = await bridge.readTextFile(filePath);
  const html = await markdownToHtml(markdown);

  setContent(markdown);
  setFilePath(filePath);
  resetDirty();

  return html;
}

/**
 * Saves the current editor HTML to the currently open file path as Markdown.
 * Falls back to `saveDocumentAs` when no path is known yet.
 */
export async function saveDocument(editorHtml: string): Promise<void> {
  const { currentFilePath, setContent, resetDirty } =
    useDocumentStore.getState();

  if (!currentFilePath) {
    await saveDocumentAs(editorHtml);
    return;
  }

  const markdown = await htmlToMarkdown(editorHtml);
  await bridge.saveTextFile(currentFilePath, markdown);
  setContent(markdown);
  resetDirty();
}

/**
 * Shows the native save-file dialog, converts the editor HTML to Markdown,
 * and writes it to the chosen path.  Updates the store on success.
 */
export async function saveDocumentAs(editorHtml: string): Promise<void> {
  const { setContent, setFilePath, resetDirty } =
    useDocumentStore.getState();

  const markdown = await htmlToMarkdown(editorHtml);
  const savedPath = await bridge.saveFileDialog(markdown);

  if (savedPath) {
    setContent(markdown);
    setFilePath(savedPath);
    resetDirty();
  }
}
