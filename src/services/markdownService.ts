/**
 * Markdown lifecycle service.
 *
 * Separates three representations used in the app:
 * 1) raw Markdown read from disk,
 * 2) editor-facing HTML content,
 * 3) canonical Markdown persisted to disk and used for dirty checks.
 *
 * NOTE (MVP): HTML → Markdown roundtrip via rehype/remark is not perfectly
 * lossless for every possible markdown feature. We intentionally accept this
 * in exchange for predictable, centralised conversion behaviour.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";

export interface ParsedMarkdownResult {
  editorContent: string;
  canonicalMarkdown: string;
}

interface BuildHtmlDocumentParams {
  title: string;
  bodyHtml: string;
  printFriendly?: boolean;
}

const EXPORT_BASE_CSS = `
:root {
  color-scheme: light;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #1f2937;
  background: #ffffff;
}
article {
  max-width: 860px;
  margin: 0 auto;
  padding: 2.5rem 2rem 3rem;
}
a { color: #1d4ed8; }
img {
  max-width: 100%;
  height: auto;
}
h1, h2, h3, h4, h5, h6 {
  margin-top: 1.8em;
  margin-bottom: 0.6em;
  line-height: 1.25;
}
p, ul, ol, blockquote, table, pre {
  margin-top: 0;
  margin-bottom: 1rem;
}
blockquote {
  margin-left: 0;
  padding: 0.25rem 1rem;
  border-left: 4px solid #d1d5db;
  color: #4b5563;
  background: #f9fafb;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.9em;
  background: #f3f4f6;
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
}
pre {
  overflow-x: auto;
  padding: 0.75rem 0.9rem;
  background: #0b1020;
  color: #e5e7eb;
  border-radius: 0.5rem;
}
pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  color: inherit;
}
table {
  width: 100%;
  border-collapse: collapse;
  display: block;
  overflow-x: auto;
}
th, td {
  border: 1px solid #d1d5db;
  padding: 0.5rem 0.625rem;
  text-align: left;
  vertical-align: top;
}
th {
  background: #f9fafb;
  font-weight: 600;
}
input[type="checkbox"] {
  vertical-align: middle;
}
`;

const EXPORT_PRINT_CSS = `
@page { margin: 20mm; }
@media print {
  html, body {
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  article {
    max-width: none;
    margin: 0;
    padding: 0;
  }
  pre {
    white-space: pre-wrap;
    word-break: break-word;
    page-break-inside: avoid;
  }
  table {
    page-break-inside: auto;
  }
  tr {
    page-break-inside: avoid;
  }
}
`;

/** Converts raw Markdown to HTML that can be set into Tiptap. */
export async function parseMarkdownToEditorContent(
  rawMarkdown: string
): Promise<ParsedMarkdownResult> {
  const editorContent = await markdownToHtml(rawMarkdown);
  const canonicalMarkdown = await serializeEditorToMarkdown(editorContent);

  return {
    editorContent,
    canonicalMarkdown,
  };
}

/** Converts current editor HTML content to canonical Markdown. */
export async function serializeEditorToMarkdown(
  editorHtml: string
): Promise<string> {
  const markdown = await htmlToMarkdown(editorHtml);
  return normalizeMarkdown(markdown);
}

/** Converts canonical markdown to export-oriented HTML fragment. */
export async function renderMarkdownToExportHtml(markdown: string): Promise<string> {
  return markdownToHtml(markdown);
}

/** Builds complete standalone HTML document for disk export. */
export function buildHtmlDocument({
  title,
  bodyHtml,
  printFriendly = false,
}: BuildHtmlDocumentParams): string {
  const escapedTitle = escapeHtml(title || "Untitled");
  const css = `${EXPORT_BASE_CSS}\n${printFriendly ? EXPORT_PRINT_CSS : ""}`;

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapedTitle}</title>`,
    `  <style>${css}</style>`,
    "</head>",
    "<body>",
    `  <article>${bodyHtml}</article>`,
    "</body>",
    "</html>",
  ].join("\n");
}

/**
 * Minimal deterministic normalisation for persisted markdown.
 * - normalises line endings to LF
 * - trims trailing whitespace on each line
 * - heuristically collapses >1 blank line between blocks
 * - normalises task list marker casing ([X] -> [x])
 * - enforces exactly one trailing newline
 */
export function normalizeMarkdown(markdown: string): string {
  const withLf = markdown.replace(/\r\n?/g, "\n");
  const lines = withLf.split("\n");
  const normalized: string[] = [];
  let inCodeFence = false;
  let currentFence: "```" | "~~~" | null = null;
  let pendingBlankLinesOutsideFence = 0;

  const flushPendingBlankLines = () => {
    if (pendingBlankLinesOutsideFence > 0) {
      normalized.push("");
      pendingBlankLinesOutsideFence = 0;
    }
  };

  const toggleFenceState = (line: string): void => {
    const marker = line.startsWith("```") ? "```" : line.startsWith("~~~") ? "~~~" : null;
    if (!marker) return;

    if (!inCodeFence) {
      inCodeFence = true;
      currentFence = marker;
      return;
    }

    if (currentFence === marker) {
      inCodeFence = false;
      currentFence = null;
    }
  };

  for (const line of lines) {
    if (inCodeFence) {
      normalized.push(line);
      toggleFenceState(line);
      continue;
    }

    const trimmed = line.replace(/[\t ]+$/g, "");
    const normalizedTaskMarker = trimmed.replace(/\[(X)\]/g, "[x]");

    if (!normalizedTaskMarker) {
      pendingBlankLinesOutsideFence += 1;
      continue;
    }

    flushPendingBlankLines();
    normalized.push(normalizedTaskMarker);
    toggleFenceState(normalizedTaskMarker);
  }

  const withoutTrailingBlankLines = normalized.join("\n").replace(/\n+$/g, "");
  return `${withoutTrailingBlankLines}\n`;
}

async function markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
}

async function htmlToMarkdown(html: string): Promise<string> {
  const result = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: "-",
      fences: true,
      listItemIndent: "one",
      strong: "*",
    })
    .process(html);

  return String(result);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
