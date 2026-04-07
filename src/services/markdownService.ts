/**
 * Markdown import / export service.
 *
 * Uses the unified / remark / rehype pipeline to convert between the Markdown
 * format stored on disk and the HTML format consumed by Tiptap.
 *
 * NOTE (MVP): The HTML → Markdown roundtrip is not perfectly lossless for all
 * Tiptap node types (e.g. code block language attributes may be lost).
 * This is an acceptable trade-off for the first version; priority is a clean
 * architecture over a perfect serialiser.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";

/**
 * Converts a Markdown string to an HTML string suitable for loading into
 * Tiptap via `editor.commands.setContent(html)`.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
}

/**
 * Converts the HTML produced by `editor.getHTML()` back to a Markdown string
 * ready to be written to disk.
 */
export async function htmlToMarkdown(html: string): Promise<string> {
  const result = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkStringify)
    .process(html);

  return String(result);
}
