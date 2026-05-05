/**
 * Tauri application entry point and command definitions.
 *
 * Commands form the narrow native bridge between the frontend and
 * the OS. File dialogs use `rfd` with its async API so
 * the GTK/AppKit dialog loop runs on the correct platform thread.
 */
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
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

#[tauri::command]
async fn open_file_dialog() -> Option<String> {
    AsyncFileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .set_title("Open Markdown File")
        .pick_file()
        .await
        .map(|f| f.path().to_string_lossy().to_string())
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

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

#[tauri::command]
async fn save_html_file_dialog(
    content: String,
    suggested_file_name: String,
) -> Result<Option<String>, String> {
    let handle = AsyncFileDialog::new()
        .add_filter("HTML", &["html", "htm"])
        .set_title("Export as HTML")
        .set_file_name(&suggested_file_name)
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

/// Writes a pre-rendered PDF to disk. The PDF is generated on the JS side
/// (pdfmake) so the document keeps its visual structure and Unicode text
/// (Czech, Polish, German, French, …) survives the round-trip — generating
/// PDFs from Rust against the standard 14 Type1 fonts mangles anything
/// outside WinAnsi.
///
/// Bytes arrive base64-encoded so the IPC payload stays a plain JSON string
/// rather than a (slow, memory-hungry) JSON number array.
#[tauri::command]
async fn save_pdf_file_dialog(
    pdf_base64: String,
    suggested_file_name: String,
) -> Result<Option<String>, String> {
    let pdf_bytes = BASE64
        .decode(pdf_base64.as_bytes())
        .map_err(|e| format!("Invalid PDF payload: {}", e))?;

    let handle = AsyncFileDialog::new()
        .add_filter("PDF", &["pdf"])
        .set_title("Export as PDF")
        .set_file_name(&suggested_file_name)
        .save_file()
        .await;

    match handle {
        Some(file) => {
            let path = file.path().to_string_lossy().to_string();
            std::fs::write(&path, &pdf_bytes).map_err(|e| e.to_string())?;
            Ok(Some(path))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn get_launch_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_launch_args,
            open_file_dialog,
            read_text_file,
            save_text_file,
            save_file_dialog,
            save_html_file_dialog,
            save_pdf_file_dialog,
            get_file_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
