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

#[derive(Clone, Copy)]
struct LineStyle {
    font: &'static str,
    font_size: f64,
    leading: f64,
    indent_pt: f64,
    background_gray: Option<f64>,
}

struct RenderLine {
    text: String,
    style: LineStyle,
}

fn escape_pdf_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn strip_html_tags(value: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;

    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }

    decode_html_entities(&output)
}

fn convert_html_to_semantic_text(html_document: &str) -> String {
    let mut text = html_document.replace("\r\n", "\n").replace('\r', "\n");

    let replacements = [
        ("<br>", "\n"),
        ("<br/>", "\n"),
        ("<br />", "\n"),
        ("</p>", "\n\n"),
        ("</blockquote>", "\n\n"),
        ("<h1>", "\n# "),
        ("<h2>", "\n## "),
        ("<h3>", "\n### "),
        ("<h4>", "\n#### "),
        ("<h5>", "\n##### "),
        ("<h6>", "\n###### "),
        ("</h1>", "\n\n"),
        ("</h2>", "\n\n"),
        ("</h3>", "\n\n"),
        ("</h4>", "\n\n"),
        ("</h5>", "\n\n"),
        ("</h6>", "\n\n"),
        ("<li>", "\n- "),
        ("</li>", ""),
        ("<tr>", "\n| "),
        ("</tr>", " |\n"),
        ("<th>", ""),
        ("</th>", " | "),
        ("<td>", ""),
        ("</td>", " | "),
        ("</table>", "\n"),
        ("</ul>", "\n"),
        ("</ol>", "\n"),
    ];

    for (from, to) in replacements {
        text = text.replace(from, to);
    }

    text = text.replace(
        "<input checked=\"\" disabled=\"\" type=\"checkbox\">",
        "[x] ",
    );
    text = text.replace(
        "<input disabled=\"\" type=\"checkbox\">",
        "[ ] ",
    );

    while let Some(start) = text.find("<pre><code") {
        let Some(open_end_rel) = text[start..].find('>') else {
            break;
        };
        let content_start = start + open_end_rel + 1;
        let Some(end_rel) = text[content_start..].find("</code></pre>") else {
            break;
        };
        let content_end = content_start + end_rel;
        let code_content = decode_html_entities(&text[content_start..content_end]);
        let replacement = format!("\n```\n{}\n```\n", code_content);
        text.replace_range(start..content_end + "</code></pre>".len(), &replacement);
    }

    strip_html_tags(&text)
}

fn style_for_text_line(line: &str, in_code_block: bool) -> LineStyle {
    if in_code_block {
        return LineStyle {
            font: "F3",
            font_size: 9.5,
            leading: 14.0,
            indent_pt: 8.0,
            background_gray: Some(0.95),
        };
    }

    if line.starts_with("# ") {
        return LineStyle {
            font: "F2",
            font_size: 22.0,
            leading: 30.0,
            indent_pt: 0.0,
            background_gray: None,
        };
    }

    if line.starts_with("## ") {
        return LineStyle {
            font: "F2",
            font_size: 18.0,
            leading: 26.0,
            indent_pt: 0.0,
            background_gray: None,
        };
    }

    if line.starts_with("### ") {
        return LineStyle {
            font: "F2",
            font_size: 15.0,
            leading: 22.0,
            indent_pt: 0.0,
            background_gray: None,
        };
    }

    if line.starts_with("#### ") || line.starts_with("##### ") || line.starts_with("###### ") {
        return LineStyle {
            font: "F2",
            font_size: 13.0,
            leading: 20.0,
            indent_pt: 0.0,
            background_gray: None,
        };
    }

    if line.starts_with("- ") || line.starts_with("[x]") || line.starts_with("[ ]") {
        return LineStyle {
            font: "F1",
            font_size: 11.0,
            leading: 17.0,
            indent_pt: 14.0,
            background_gray: None,
        };
    }

    if line.starts_with('|') {
        return LineStyle {
            font: "F1",
            font_size: 10.5,
            leading: 16.0,
            indent_pt: 0.0,
            background_gray: Some(0.97),
        };
    }

    LineStyle {
        font: "F1",
        font_size: 11.0,
        leading: 17.0,
        indent_pt: 0.0,
        background_gray: None,
    }
}

fn wrap_line_by_width(line: &str, max_width_pt: f64, font_size: f64) -> Vec<String> {
    let approx_char_width = font_size * 0.52;
    let mut max_chars = (max_width_pt / approx_char_width).floor() as usize;
    if max_chars < 16 {
        max_chars = 16;
    }

    if line.chars().count() <= max_chars {
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
        if candidate.chars().count() <= max_chars {
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

fn normalize_line_text(line: &str) -> String {
    line.trim_end().to_string()
}

fn build_render_lines(html_document: &str) -> Vec<RenderLine> {
    let semantic_text = convert_html_to_semantic_text(html_document);
    let mut lines = Vec::new();
    let mut in_code_block = false;

    for raw_line in semantic_text.lines() {
        let trimmed = normalize_line_text(raw_line);

        if trimmed == "```" {
            in_code_block = !in_code_block;
            lines.push(RenderLine {
                text: String::new(),
                style: style_for_text_line("", in_code_block),
            });
            continue;
        }

        let style = style_for_text_line(&trimmed, in_code_block);
        let cleaned = trimmed
            .trim_start_matches("# ")
            .trim_start_matches("## ")
            .trim_start_matches("### ")
            .trim_start_matches("#### ")
            .trim_start_matches("##### ")
            .trim_start_matches("###### ")
            .to_string();

        if cleaned.is_empty() {
            lines.push(RenderLine {
                text: String::new(),
                style,
            });
            continue;
        }

        let content_width = A4_WIDTH_PT - PAGE_MARGIN_PT * 2.0 - style.indent_pt;
        for wrapped in wrap_line_by_width(&cleaned, content_width, style.font_size) {
            lines.push(RenderLine {
                text: wrapped,
                style,
            });
        }
    }

    if lines.is_empty() {
        lines.push(RenderLine {
            text: String::new(),
            style: style_for_text_line("", false),
        });
    }

    lines
}

fn build_pdf_bytes_from_html(html_document: &str) -> Vec<u8> {
    let render_lines = build_render_lines(html_document);

    let mut page_streams: Vec<String> = vec![String::new()];
    let mut page_index = 0usize;
    let mut cursor_y = A4_HEIGHT_PT - PAGE_MARGIN_PT;

    for line in render_lines {
        if cursor_y - line.style.leading < PAGE_MARGIN_PT {
            page_streams.push(String::new());
            page_index += 1;
            cursor_y = A4_HEIGHT_PT - PAGE_MARGIN_PT;
        }

        let x = PAGE_MARGIN_PT + line.style.indent_pt;
        let y = cursor_y;

        if let Some(gray) = line.style.background_gray {
            let rect_height = line.style.leading - 2.0;
            let rect_width = A4_WIDTH_PT - (x + PAGE_MARGIN_PT);
            let rect_y = y - rect_height + 4.0;
            page_streams[page_index].push_str(&format!(
                "q {:.3} {:.3} {:.3} rg {} {} {} {} re f Q\n",
                gray, gray, gray, x, rect_y, rect_width, rect_height
            ));
        }

        let escaped = escape_pdf_text(&line.text);
        page_streams[page_index].push_str(&format!(
            "BT /{} {} Tf 1 0 0 1 {} {} Tm ({}) Tj ET\n",
            line.style.font, line.style.font_size, x, y, escaped
        ));

        cursor_y -= line.style.leading;
    }

    let page_count = page_streams.len();
    let pages_root_id = 2usize;
    let first_page_id = 3usize;
    let font_helvetica_id = first_page_id + page_count;
    let font_bold_id = font_helvetica_id + 1;
    let font_mono_id = font_helvetica_id + 2;
    let first_content_stream_id = font_helvetica_id + 3;

    let mut objects: Vec<String> = Vec::new();
    objects.push("<< /Type /Catalog /Pages 2 0 R >>".to_string());

    let kids = (0..page_count)
        .map(|i| format!("{} 0 R", first_page_id + i))
        .collect::<Vec<_>>()
        .join(" ");
    objects.push(format!(
        "<< /Type /Pages /Kids [{}] /Count {} >>",
        kids, page_count
    ));

    for i in 0..page_count {
        let content_id = first_content_stream_id + i;
        objects.push(format!(
            "<< /Type /Page /Parent {} 0 R /MediaBox [0 0 {} {}] /Resources << /Font << /F1 {} 0 R /F2 {} 0 R /F3 {} 0 R >> >> /Contents {} 0 R >>",
            pages_root_id,
            A4_WIDTH_PT,
            A4_HEIGHT_PT,
            font_helvetica_id,
            font_bold_id,
            font_mono_id,
            content_id
        ));
    }

    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string());
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>".to_string());
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>".to_string());

    for stream in page_streams {
        objects.push(format!(
            "<< /Length {} >>\nstream\n{}endstream",
            stream.len(),
            stream
        ));
    }

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
    html_document: String,
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
            let pdf = build_pdf_bytes_from_html(&html_document);
            std::fs::write(&path, pdf).map_err(|e| e.to_string())?;
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
