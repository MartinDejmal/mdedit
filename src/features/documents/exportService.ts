import { useDocumentStore } from "../../stores/documentStore";
import { buildHtmlDocument } from "../../services/markdownService";
import { renderEditorHtmlToPdfBytes } from "../../services/pdfRenderer";
import * as bridge from "../../services/tauriBridge";

export type ExportFormat = "html" | "pdf";

export interface ExportedFile {
  format: ExportFormat;
  path: string;
}

export type ExportResult =
  | { kind: "exported"; file: ExportedFile }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

interface ExportContext {
  title: string;
  suggestedBaseName: string;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function normalizeSuggestedName(name: string): string {
  const sanitized = name.trim().replace(/[<>:"/\\|?*]+/g, "-");
  return sanitized.length > 0 ? sanitized : "Untitled";
}

function buildExportContext(): ExportContext {
  const { currentFilePath, hasActiveDocument } = useDocumentStore.getState();

  if (!hasActiveDocument) {
    throw new Error("No active document to export.");
  }

  const pathName = currentFilePath ? stripExtension(currentFilePath.replace(/.*[\\/]/, "")) : null;
  const title = pathName && pathName.length > 0 ? pathName : "Untitled";

  return {
    title,
    suggestedBaseName: normalizeSuggestedName(title),
  };
}

export async function exportCurrentDocumentAsHtml(editorHtml: string): Promise<ExportResult> {
  try {
    const context = buildExportContext();
    const bodyHtml = editorHtml;
    const htmlDocument = buildHtmlDocument({ title: context.title, bodyHtml });

    const exportedPath = await bridge.saveHtmlFileDialog(
      htmlDocument,
      `${context.suggestedBaseName}.html`
    );

    if (!exportedPath) {
      return { kind: "cancelled" };
    }

    return {
      kind: "exported",
      file: {
        format: "html",
        path: exportedPath,
      },
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Unknown export error.",
    };
  }
}

export async function exportCurrentDocumentAsPdf(editorHtml: string): Promise<ExportResult> {
  try {
    console.log('[DEBUG] PDF Export: exportCurrentDocumentAsPdf started');
    const context = buildExportContext();
    console.log('[DEBUG] PDF Export: Export context:', context);

    console.log('[DEBUG] PDF Export: Calling renderEditorHtmlToPdfBytes');
    const pdfBytes = await renderEditorHtmlToPdfBytes(editorHtml, {
      title: context.title,
    });
    console.log('[DEBUG] PDF Export: PDF rendered, bytes length:', pdfBytes.length);

    console.log('[DEBUG] PDF Export: Calling savePdfFileDialog');
    const exportedPath = await bridge.savePdfFileDialog(
      pdfBytes,
      `${context.suggestedBaseName}.pdf`
    );
    console.log('[DEBUG] PDF Export: Dialog result:', exportedPath);

    if (!exportedPath) {
      return { kind: "cancelled" };
    }

    return {
      kind: "exported",
      file: {
        format: "pdf",
        path: exportedPath,
      },
    };
  } catch (error) {
    console.error('[DEBUG] PDF Export: Error in exportCurrentDocumentAsPdf:', error);
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Unknown export error.",
    };
  }
}
