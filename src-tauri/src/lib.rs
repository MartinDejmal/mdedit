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

const A4_WIDTH_PT: f64 = 595.0;
const A4_HEIGHT_PT: f64 = 842.0;
const PAGE_MARGIN_PT: f64 = 56.0;
const LINE_HEIGHT_PT: f64 = 14.0;
const MAX_COLUMNS: usize = 92;
const MAX_LINES: usize = 52;

fn escape_pdf_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

fn wrap_line(line: &str, max_columns: usize) -> Vec<String> {
    if line.chars().count() <= max_columns {
        return vec![line.to_string()];
    }

    let mut wrapped = Vec::new();
    let mut current = String::new();

    for word in line.split_whitespace() {
        if current.is_empty() {
            current.push_str(word);
            continue;
        }

        let candidate = format!("{} {}", current, word);
        if candidate.chars().count() <= max_columns {
            current = candidate;
        } else {
            wrapped.push(current);
            current = word.to_string();
        }
    }

    if !current.is_empty() {
        wrapped.push(current);
    }

    if wrapped.is_empty() {
        vec![line.to_string()]
    } else {
        wrapped
    }
}

fn build_pdf_bytes(markdown: &str) -> Vec<u8> {
    let mut lines: Vec<String> = Vec::new();

    for raw_line in markdown.replace("\r\n", "\n").replace('\r', "\n").lines() {
        if raw_line.trim().is_empty() {
            lines.push(String::new());
            continue;
        }

        lines.extend(wrap_line(raw_line, MAX_COLUMNS));
    }

    if lines.len() > MAX_LINES {
        lines.truncate(MAX_LINES - 1);
        lines.push("[...output truncated for MVP PDF export...]".to_string());
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    let start_y = A4_HEIGHT_PT - PAGE_MARGIN_PT;
    let mut content = String::new();
    content.push_str("BT\n");
    content.push_str("/F1 10 Tf\n");
    content.push_str(&format!("{} TL\n", LINE_HEIGHT_PT));
    content.push_str(&format!("{} {} Td\n", PAGE_MARGIN_PT, start_y));

    for (index, line) in lines.iter().enumerate() {
        if index > 0 {
            content.push_str("T*\n");
        }

        let escaped = escape_pdf_text(line);
        content.push_str(&format!("({}) Tj\n", escaped));
    }

    content.push_str("ET\n");

    let objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {} {}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            A4_WIDTH_PT, A4_HEIGHT_PT
        ),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>".to_string(),
        format!("<< /Length {} >>\nstream\n{}endstream", content.len(), content),
    ];

    let mut pdf = String::from("%PDF-1.4\n");
    let mut offsets = vec![0usize];

    for (idx, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.push_str(&format!("{} 0 obj\n{}\nendobj\n", idx + 1, object));
    }

    let xref_start = pdf.len();
    pdf.push_str(&format!("xref\n0 {}\n", objects.len() + 1));
    pdf.push_str("0000000000 65535 f \n");

    for offset in offsets.iter().skip(1) {
        pdf.push_str(&format!("{:010} 00000 n \n", offset));
    }

    pdf.push_str(&format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
        objects.len() + 1,
        xref_start
    ));

    pdf.into_bytes()
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

#[tauri::command]
async fn save_pdf_file_dialog(
    markdown: String,
    suggested_file_name: String,
) -> Result<Option<String>, String> {
    let handle = AsyncFileDialog::new()
        .add_filter("PDF", &["pdf"])
        .set_title("Export as PDF")
        .set_file_name(&suggested_file_name)
        .save_file()
        .await;

    match handle {
        Some(file) => {
            let path = file.path().to_string_lossy().to_string();
            let pdf = build_pdf_bytes(&markdown);
            std::fs::write(&path, pdf).map_err(|e| e.to_string())?;
            Ok(Some(path))
        }
        None => Ok(None),
    }
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
