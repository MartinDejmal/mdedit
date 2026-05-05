/**
 * Editor HTML → PDF bytes renderer.
 *
 * The PDF is built on the JS side using pdfmake so we keep the full
 * structural fidelity of the editor (headings, ordered/unordered/nested lists,
 * task lists, tables, code blocks, blockquotes, inline marks, links) and get
 * proper Unicode out of the box — pdfmake bundles Roboto, which covers Latin
 * Extended-A so European diacritics (Czech / Polish / German / French …)
 * render correctly instead of as mojibake.
 *
 * The Rust backend just writes the bytes to disk; it does not attempt to
 * understand the document.
 */
// pdfmake ships its own .d.ts but is JS at runtime; the browser bundle is the
// one that works inside the Tauri webview (the default `main` entry pulls in
// node-only `fs`).
// @ts-expect-error - no bundled types for the browser entry point
import pdfMake from "pdfmake/build/pdfmake";
// @ts-expect-error - vfs bundle is plain JS
import vfsFonts from "pdfmake/build/vfs_fonts";

type Inline = string | InlineObject;
interface InlineObject {
  text: string | Inline[];
  bold?: boolean;
  italics?: boolean;
  decoration?: "underline" | "lineThrough" | "overline";
  color?: string;
  background?: string;
  link?: string;
  style?: string | string[];
}

type Content = unknown;

interface RenderContext {
  /** Nesting depth used to gate huge documents from blowing the stack. */
  depth: number;
}

const ROBOTO_VFS_INSTALLED = installVfs();

function installVfs(): boolean {
  const target = pdfMake as { vfs?: unknown; fonts?: unknown };
  // vfs_fonts is exported either as the raw vfs object (newer builds) or
  // wrapped under `pdfMake.vfs` (older builds). Handle both.
  const candidate = (vfsFonts as { pdfMake?: { vfs?: unknown }; vfs?: unknown }) ?? {};
  target.vfs =
    (candidate as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs ??
    (candidate as { vfs?: unknown }).vfs ??
    vfsFonts;
  // Without an explicit font map pdfmake's PDFKit pipeline silently fails
  // resolving "Roboto" and `getBuffer` never fires its callback. Pin the
  // four Roboto faces to the keys shipped in vfs_fonts.
  target.fonts = {
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  };
  return true;
}

const HEADING_STYLES = {
  h1: { fontSize: 24, bold: true, marginTop: 18, marginBottom: 8 },
  h2: { fontSize: 20, bold: true, marginTop: 16, marginBottom: 8 },
  h3: { fontSize: 17, bold: true, marginTop: 14, marginBottom: 6 },
  h4: { fontSize: 14, bold: true, marginTop: 12, marginBottom: 6 },
  h5: { fontSize: 12, bold: true, marginTop: 10, marginBottom: 4 },
  h6: { fontSize: 11, bold: true, marginTop: 10, marginBottom: 4 },
};

/** Strips everything except the article body if a full HTML document was passed. */
function extractBodyHtml(html: string): string {
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) return articleMatch[1];
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1];
  return html;
}

function parseFragment(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = extractBodyHtml(html);
  return template.content;
}

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function tagName(node: HTMLElement): string {
  return node.tagName.toLowerCase();
}

/** Turns inline content (strong/em/code/a/text) into a pdfmake `text` array. */
function collectInline(parent: Node, marks: InlineObject = {} as InlineObject): Inline[] {
  const out: Inline[] = [];

  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      if (!value) return;
      if (Object.keys(marks).length === 0) {
        out.push(value);
      } else {
        out.push({ ...marks, text: value });
      }
      return;
    }

    if (!isElement(node)) return;

    const tag = tagName(node);

    if (tag === "br") {
      out.push("\n");
      return;
    }

    if (tag === "strong" || tag === "b") {
      out.push(...collectInline(node, { ...marks, bold: true }));
      return;
    }

    if (tag === "em" || tag === "i") {
      out.push(...collectInline(node, { ...marks, italics: true }));
      return;
    }

    if (tag === "u") {
      out.push(...collectInline(node, { ...marks, decoration: "underline" }));
      return;
    }

    if (tag === "s" || tag === "strike" || tag === "del") {
      out.push(...collectInline(node, { ...marks, decoration: "lineThrough" }));
      return;
    }

    if (tag === "code") {
      // Inline code: monospace + subtle background. pdfmake supports the
      // `background` property on text fragments.
      const text = node.textContent ?? "";
      out.push({
        ...marks,
        text,
        style: "inlineCode",
      });
      return;
    }

    if (tag === "a") {
      const href = node.getAttribute("href");
      const linkMarks: InlineObject = {
        ...marks,
        color: "#1d4ed8",
        decoration: "underline",
      };
      if (href) linkMarks.link = href;
      out.push(...collectInline(node, linkMarks));
      return;
    }

    if (tag === "img") {
      // Inline images aren't supported in inline runs by pdfmake; fall back to
      // an alt-text marker so authors don't lose the reference.
      const alt = node.getAttribute("alt") ?? "";
      const src = node.getAttribute("src") ?? "";
      const label = alt || src || "image";
      out.push({ ...marks, text: `[${label}]`, italics: true, color: "#6b7280" });
      return;
    }

    // Fallback: descend without changing marks.
    out.push(...collectInline(node, marks));
  });

  return out;
}

function trimLeadingNewlines(items: Inline[]): Inline[] {
  while (items.length > 0 && items[0] === "\n") items.shift();
  while (items.length > 0 && items[items.length - 1] === "\n") items.pop();
  return items;
}

function inlineToText(parent: Node): Inline[] {
  return trimLeadingNewlines(collectInline(parent));
}

function processList(
  list: HTMLElement,
  ordered: boolean,
  ctx: RenderContext
): Content {
  const items: Content[] = [];

  list.childNodes.forEach((child) => {
    if (!isElement(child)) return;
    if (tagName(child) !== "li") return;
    items.push(processListItem(child, ctx));
  });

  if (ordered) {
    const start = list.getAttribute("start");
    const startNum = start ? parseInt(start, 10) : NaN;
    return {
      ol: items,
      ...(Number.isFinite(startNum) ? { start: startNum } : {}),
      marginBottom: 6,
    };
  }
  return { ul: items, marginBottom: 6 };
}

function processListItem(li: HTMLElement, ctx: RenderContext): Content {
  // A list item may contain inline content followed by nested lists. pdfmake
  // accepts an array as a list item's content.
  const stack: Content[] = [];
  const inlineBuffer: Node[] = [];

  const flushInline = () => {
    if (inlineBuffer.length === 0) return;
    const synthetic = document.createElement("span");
    inlineBuffer.forEach((n) => synthetic.appendChild(n.cloneNode(true)));
    const inlines = inlineToText(synthetic);
    if (inlines.length > 0) {
      stack.push({ text: inlines });
    }
    inlineBuffer.length = 0;
  };

  // Handle Tiptap task list items: <li data-checked="true|false">…<label><input/>…</label><div><p>…</p></div></li>
  const dataChecked = li.getAttribute("data-checked");
  const isTaskItem = dataChecked === "true" || dataChecked === "false";
  const checkbox = isTaskItem ? (dataChecked === "true" ? "☑ " : "☐ ") : "";

  li.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      inlineBuffer.push(child);
      return;
    }
    if (!isElement(child)) return;

    const tag = tagName(child);

    if (tag === "ul" || tag === "ol") {
      flushInline();
      stack.push(processList(child, tag === "ol", { depth: ctx.depth + 1 }));
      return;
    }

    if (tag === "p") {
      // Treat a paragraph inside an <li> as inline so we don't get extra
      // spacing between marker and text.
      flushInline();
      const inlines = inlineToText(child);
      if (inlines.length > 0) {
        stack.push({ text: inlines });
      }
      return;
    }

    if (tag === "blockquote" || tag === "pre" || tag === "table" || tag === "hr") {
      flushInline();
      stack.push(...processBlock(child, ctx));
      return;
    }

    if (tag === "label" || tag === "div" || tag === "span") {
      // Common Tiptap task-item wrappers — descend.
      child.childNodes.forEach((n) => inlineBuffer.push(n));
      return;
    }

    if (tag === "input") {
      // Plain markdown-style task list: <input type="checkbox" checked>
      const type = child.getAttribute("type");
      if (type === "checkbox") {
        const checked = child.hasAttribute("checked");
        inlineBuffer.push(document.createTextNode(checked ? "☑ " : "☐ "));
      }
      return;
    }

    inlineBuffer.push(child);
  });

  flushInline();

  if (isTaskItem && stack.length > 0) {
    const first = stack[0] as { text?: Inline[] };
    if (first && Array.isArray(first.text)) {
      first.text = [checkbox, ...first.text];
    } else {
      stack.unshift({ text: checkbox });
    }
  }

  if (stack.length === 0) return { text: " " };
  if (stack.length === 1) return stack[0];
  return { stack };
}

function processCodeBlock(node: HTMLElement): Content {
  // <pre><code>…</code></pre>; preserve raw text exactly as written.
  const codeEl = node.querySelector("code") ?? node;
  const text = codeEl.textContent ?? "";
  // Render as a single-cell table so we get a real background fill behind the
  // monospaced text. pdfmake's text background only colors the run, not the
  // full block width.
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            text,
            style: "code",
            preserveLeadingSpaces: true,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      fillColor: () => "#f3f4f6",
    },
    marginBottom: 8,
    marginTop: 4,
  };
}

function processBlockquote(node: HTMLElement, ctx: RenderContext): Content {
  const inner = processChildren(node, { ...ctx, depth: ctx.depth + 1 });
  return {
    table: {
      widths: ["*"],
      body: [[{ stack: inner, margin: [10, 0, 0, 0] }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 3 : 0),
      vLineColor: () => "#d1d5db",
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
      fillColor: () => "#f9fafb",
    },
    marginBottom: 8,
    marginTop: 4,
  };
}

function processTable(node: HTMLElement): Content {
  const rows: HTMLElement[] = Array.from(node.querySelectorAll("tr"));
  if (rows.length === 0) return { text: "" };

  const body: Content[][] = [];
  let columnCount = 0;
  let hasHeader = false;

  rows.forEach((row, rowIdx) => {
    const cells = Array.from(row.children).filter(isElement);
    columnCount = Math.max(columnCount, cells.length);
    const isHeader = cells.every((c) => tagName(c) === "th");
    if (isHeader && rowIdx === 0) hasHeader = true;
    body.push(
      cells.map((cell) => {
        const inlines = inlineToText(cell);
        const content: InlineObject = {
          text: inlines.length > 0 ? inlines : "",
        };
        if (tagName(cell) === "th") content.bold = true;
        return content;
      })
    );
  });

  if (columnCount === 0) return { text: "" };

  const widths = Array.from({ length: columnCount }, () => "*");
  return {
    table: {
      headerRows: hasHeader ? 1 : 0,
      widths,
      body,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#d1d5db",
      vLineColor: () => "#d1d5db",
      fillColor: (rowIndex: number) =>
        hasHeader && rowIndex === 0 ? "#f9fafb" : null,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    marginBottom: 8,
    marginTop: 4,
  };
}

function processBlock(node: HTMLElement, ctx: RenderContext): Content[] {
  const tag = tagName(node);

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const inlines = inlineToText(node);
      if (inlines.length === 0) return [];
      return [{ text: inlines, style: tag }];
    }
    case "p": {
      const inlines = inlineToText(node);
      if (inlines.length === 0) return [{ text: "", marginBottom: 4 }];
      return [{ text: inlines, marginBottom: 6, lineHeight: 1.35 }];
    }
    case "ul":
    case "ol":
      return [processList(node, tag === "ol", ctx)];
    case "pre":
      return [processCodeBlock(node)];
    case "blockquote":
      return [processBlockquote(node, ctx)];
    case "table":
      return [processTable(node)];
    case "hr":
      return [
        {
          canvas: [
            {
              type: "line",
              x1: 0,
              y1: 4,
              x2: 515,
              y2: 4,
              lineWidth: 0.5,
              lineColor: "#d1d5db",
            },
          ],
          marginBottom: 8,
          marginTop: 4,
        },
      ];
    case "img": {
      // Standalone image — only inline supported sources (data URLs).
      const src = node.getAttribute("src") ?? "";
      const alt = node.getAttribute("alt") ?? "";
      if (src.startsWith("data:image/")) {
        return [{ image: src, fit: [515, 515], marginBottom: 6 }];
      }
      return [
        {
          text: `[${alt || src || "image"}]`,
          italics: true,
          color: "#6b7280",
          marginBottom: 6,
        },
      ];
    }
    case "br":
      return [{ text: "", marginBottom: 4 }];
    default:
      // Container/unknown — flatten children as blocks.
      return processChildren(node, ctx);
  }
}

function processChildren(parent: Node, ctx: RenderContext): Content[] {
  const out: Content[] = [];
  const inlineRun: Node[] = [];

  const flushInline = () => {
    if (inlineRun.length === 0) return;
    const synthetic = document.createElement("span");
    inlineRun.forEach((n) => synthetic.appendChild(n.cloneNode(true)));
    const inlines = inlineToText(synthetic);
    if (inlines.length > 0) {
      out.push({ text: inlines, marginBottom: 4 });
    }
    inlineRun.length = 0;
  };

  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? "").trim().length > 0) {
        inlineRun.push(node);
      }
      return;
    }
    if (!isElement(node)) return;

    const tag = tagName(node);
    const isBlockTag = [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "ul",
      "ol",
      "pre",
      "blockquote",
      "table",
      "hr",
      "div",
      "section",
      "article",
      "img",
    ].includes(tag);

    if (isBlockTag) {
      flushInline();
      out.push(...processBlock(node, ctx));
    } else {
      inlineRun.push(node);
    }
  });

  flushInline();
  return out;
}

interface PdfRenderOptions {
  title: string;
}

export async function renderEditorHtmlToPdfBytes(
  editorHtml: string,
  options: PdfRenderOptions
): Promise<Uint8Array> {
  console.log('[DEBUG] PDF Renderer: renderEditorHtmlToPdfBytes called');
  console.log('[DEBUG] PDF Renderer: ROBOTO_VFS_INSTALLED:', ROBOTO_VFS_INSTALLED);

  if (!ROBOTO_VFS_INSTALLED) {
    throw new Error("PDF font assets failed to load.");
  }

  console.log('[DEBUG] PDF Renderer: Parsing HTML fragment');
  const fragment = parseFragment(editorHtml);
  console.log('[DEBUG] PDF Renderer: Processing children');
  const content = processChildren(fragment, { depth: 0 });

  console.log('[DEBUG] PDF Renderer: Building PDF document definition');
  const docDefinition = {
    info: {
      title: options.title,
    },
    pageSize: "A4",
    pageMargins: [56, 56, 56, 56] as [number, number, number, number],
    defaultStyle: {
      font: "Roboto",
      fontSize: 11,
      lineHeight: 1.35,
      color: "#1f2937",
    },
    styles: {
      h1: HEADING_STYLES.h1,
      h2: HEADING_STYLES.h2,
      h3: HEADING_STYLES.h3,
      h4: HEADING_STYLES.h4,
      h5: HEADING_STYLES.h5,
      h6: HEADING_STYLES.h6,
      code: {
        font: "Roboto",
        fontSize: 10,
        color: "#111827",
        preserveLeadingSpaces: true,
      },
      inlineCode: {
        fontSize: 10,
        color: "#111827",
        background: "#f3f4f6",
      },
    },
    content,
  };

  console.log('[DEBUG] PDF Renderer: Creating PDF');
  // pdfmake 0.3.x changed `getBuffer` to return `Promise<Buffer>` instead of
  // accepting a callback. Passing a callback (the 0.2.x API) is silently
  // ignored, which is why the export used to hang indefinitely.
  try {
    const generator = pdfMake.createPdf(docDefinition);
    const buffer: ArrayBuffer | Uint8Array = await generator.getBuffer();
    console.log('[DEBUG] PDF Renderer: PDF buffer received');
    return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  } catch (error) {
    console.error('[DEBUG] PDF Renderer: Error creating PDF:', error);
    throw error;
  }
}
