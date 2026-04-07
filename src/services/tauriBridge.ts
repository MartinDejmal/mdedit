/**
 * Tauri bridge service.
 *
 * Thin wrapper around Tauri APIs, typed and centralized.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";

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
