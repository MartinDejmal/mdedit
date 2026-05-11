/**
 * Tauri bridge service.
 *
 * Thin wrapper around Tauri APIs, typed and centralized.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { DragDropEvent } from "@tauri-apps/api/webview";
import type { FileMetadata } from "../types";

export type { DragDropEvent };

/** Shows the OS file-open dialog filtered to Markdown files. */
export async function openFileDialog(): Promise<string | null> {
  return invoke<string | null>("open_file_dialog");
}

/** Reads UTF-8 text file content by absolute path. */
export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

/** Writes `content` to the file at `path`. */
export async function saveTextFile(path: string, content: string): Promise<void> {
  return invoke<void>("save_text_file", { path, content });
}

/** Shows save dialog, writes `content`, and returns saved path. */
export async function saveFileDialog(content: string): Promise<string | null> {
  return invoke<string | null>("save_file_dialog", { content });
}

/** Shows HTML save dialog, writes `content`, and returns saved path. */
export async function saveHtmlFileDialog(
  content: string,
  suggestedFileName: string
): Promise<string | null> {
  return invoke<string | null>("save_html_file_dialog", {
    content,
    suggestedFileName,
  });
}

/**
 * Shows PDF save dialog, writes pre-rendered PDF bytes, and returns saved path.
 *
 * Bytes are base64-encoded for transport so the IPC payload remains a JSON
 * string instead of a JSON number array (which would balloon a 300 KB PDF
 * into several MB of JSON).
 */
export async function savePdfFileDialog(
  pdfBytes: Uint8Array,
  suggestedFileName: string
): Promise<string | null> {
  const pdfBase64 = await uint8ArrayToBase64(pdfBytes);
  return invoke<string | null>("save_pdf_file_dialog", {
    pdfBase64,
    suggestedFileName,
  });
}

async function uint8ArrayToBase64(bytes: Uint8Array): Promise<string> {
  // Use a Blob + FileReader so we don't blow the call stack with
  // String.fromCharCode(...bytes) on multi-MB inputs.
  // Cast the typed array to BlobPart — the lib.dom typings flag a possible
  // SharedArrayBuffer backing, but runtime-wise any ArrayBufferView is fine.
  const blob = new Blob([bytes as unknown as BlobPart]);
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to encode PDF bytes."));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

/** Reads lightweight file metadata used for external-change detection. */
export async function getFileMetadata(path: string): Promise<FileMetadata> {
  return invoke<FileMetadata>("get_file_metadata", { path });
}

/** Returns command-line arguments passed to the application (program name excluded). */
export async function getLaunchArgs(): Promise<string[]> {
  return invoke<string[]>("get_launch_args");
}

/** Opens a URL in the system default browser. */
export async function openInBrowser(url: string): Promise<void> {
  return invoke<void>("open_in_browser", { url });
}

/** Updates native window title. */
export async function setWindowTitle(title: string): Promise<void> {
  await getCurrentWindow().setTitle(title);
}

/** Registers a Tauri close-request handler (supports preventDefault). */
export async function onWindowCloseRequested(
  listener: (event: { preventDefault: () => void }) => void | Promise<void>
): Promise<UnlistenFn> {
  return getCurrentWindow().onCloseRequested(listener);
}

/** Closes current window (used after explicit discard confirmation). */
export async function closeCurrentWindow(): Promise<void> {
  await getCurrentWindow().close();
}

/** Destroys the current window immediately without re-emitting close-requested. */
export async function destroyCurrentWindow(): Promise<void> {
  await getCurrentWindow().destroy();
}

/** Registers a Tauri drag-drop event listener for the current window. */
export async function onDragDropEvent(
  handler: (event: { payload: DragDropEvent }) => void
): Promise<UnlistenFn> {
  return getCurrentWindow().onDragDropEvent(handler);
}
