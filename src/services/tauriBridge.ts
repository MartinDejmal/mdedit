/**
 * Tauri bridge service.
 *
 * Thin wrapper around Tauri APIs, typed and centralized.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { FileMetadata } from "../types";

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

/** Shows PDF save dialog, writes generated PDF, and returns saved path. */
export async function savePdfFileDialog(
  markdown: string,
  suggestedFileName: string
): Promise<string | null> {
  return invoke<string | null>("save_pdf_file_dialog", {
    markdown,
    suggestedFileName,
  });
}

/** Reads lightweight file metadata used for external-change detection. */
export async function getFileMetadata(path: string): Promise<FileMetadata> {
  return invoke<FileMetadata>("get_file_metadata", { path });
}

/** Returns command-line arguments passed to the application (program name excluded). */
export async function getLaunchArgs(): Promise<string[]> {
  return invoke<string[]>("get_launch_args");
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
