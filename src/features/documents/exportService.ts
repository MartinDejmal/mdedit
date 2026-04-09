import { useDocumentStore } from "../../stores/documentStore";
import { buildHtmlDocument, renderMarkdownToExportHtml } from "../../services/markdownService";
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
  markdown: string;
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
  const { currentCanonicalMarkdown, currentFilePath, hasActiveDocument } =
    useDocumentStore.getState();

  if (!hasActiveDocument) {
    throw new Error("No active document to export.");
  }

  const pathName = currentFilePath ? stripExtension(currentFilePath.replace(/.*[\\/]/, "")) : null;
  const title = pathName && pathName.length > 0 ? pathName : "Untitled";

  return {
    markdown: currentCanonicalMarkdown,
    title,
    suggestedBaseName: normalizeSuggestedName(title),
  };
}

export async function exportCurrentDocumentAsHtml(): Promise<ExportResult> {
  try {
    const context = buildExportContext();
    const bodyHtml = await renderMarkdownToExportHtml(context.markdown);
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

export async function exportCurrentDocumentAsPdf(): Promise<ExportResult> {
  try {
    const context = buildExportContext();
    const bodyHtml = await renderMarkdownToExportHtml(context.markdown);
    const htmlDocument = buildHtmlDocument({
      title: context.title,
      bodyHtml,
      printFriendly: true,
    });

    const exportedPath = await bridge.savePdfFileDialog(
      htmlDocument,
      `${context.suggestedBaseName}.pdf`
    );

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
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Unknown export error.",
    };
  }
}
