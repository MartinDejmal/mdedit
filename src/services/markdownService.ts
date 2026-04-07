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
