/**
 * Tauri bridge service.
 *
 * Thin wrapper around Tauri's `invoke` that types all custom Rust commands.
 * Import from here instead of calling `invoke` directly in components or
 * business logic layers.
 */
import { invoke } from "@tauri-apps/api/core";

/** Shows the OS file-open dialog filtered to Markdown files.
 *  Returns the selected absolute path, or null if the dialog was cancelled. */
export async function openFileDialog(): Promise<string | null> {
  return invoke<string | null>("open_file_dialog");
}

/** Reads the UTF-8 text content of the file at `path`. */
export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

/** Writes `content` to the file at `path`, creating it if necessary. */
export async function saveTextFile(
  path: string,
  content: string
): Promise<void> {
  return invoke<void>("save_text_file", { path, content });
}

/** Shows the OS save dialog, writes `content` to the chosen path.
 *  Returns the saved absolute path, or null if the dialog was cancelled. */
export async function saveFileDialog(content: string): Promise<string | null> {
  return invoke<string | null>("save_file_dialog", { content });
}
