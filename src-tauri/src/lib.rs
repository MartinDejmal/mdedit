/**
 * Tauri application entry point and command definitions.
 *
 * Commands form the narrow native bridge between the frontend and
 * the OS. File dialogs use `rfd` with its async API so
 * the GTK/AppKit dialog loop runs on the correct platform thread.
 */
use rfd::AsyncFileDialog;
use serde::Serialize;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileMetadata {
    modified_ms: Option<u64>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Shows the OS file-open dialog filtered to Markdown files.
/// Returns the selected absolute path, or `null` if the dialog was cancelled.
#[tauri::command]
async fn open_file_dialog() -> Option<String> {
    AsyncFileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .set_title("Open Markdown File")
        .pick_file()
        .await
        .map(|f| f.path().to_string_lossy().to_string())
}

/// Reads the UTF-8 text content of the file at `path`.
#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Writes `content` to the file at `path`, creating it if it does not exist.
#[tauri::command]
async fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Shows the OS save dialog, writes `content` to the chosen path.
/// Returns the saved absolute path, or `null` if the dialog was cancelled.
#[tauri::command]
async fn save_file_dialog(content: String) -> Result<Option<String>, String> {
    let handle = AsyncFileDialog::new()
        .add_filter("Markdown", &["md", "markdown"])
        .set_title("Save Markdown File")
        .save_file()
        .await;

    match handle {
        Some(file) => {
            let path = file.path().to_string_lossy().to_string();
            std::fs::write(&path, content).map_err(|e| e.to_string())?;
            Ok(Some(path))
        }
        None => Ok(None),
    }
}

/// Reads file metadata used for lightweight external-change detection.
#[tauri::command]
async fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);

    Ok(FileMetadata { modified_ms })
}

// ---------------------------------------------------------------------------
// Application bootstrap
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            read_text_file,
            save_text_file,
            save_file_dialog,
            get_file_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
