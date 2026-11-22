/** Structural PDF export of the editor's HTML, with selectable text and embedded assets. */
// @ts-expect-error pdfmake's browser entry point has no bundled declarations
import pdfMakeModule from "pdfmake/build/pdfmake";
import { loadPdfFonts, PDF_FONTS } from "./pdfFonts";
import { loadMermaid } from "./mermaidRenderer";
import { getCodeHighlightRanges, normalizeCodeBlockLanguage } from "../features/editor/codeBlockSyntax";

interface PdfMakeApi {
  addVirtualFileSystem: (vfs: Record<string, string>) => void;
  addFonts: (fonts: typeof PDF_FONTS) => void;
  createPdf: (definition: Content) => { getBuffer: () => Promise<Uint8Array> };
}
const pdfMake = pdfMakeModule as PdfMakeApi;
type Content = Record<string, unknown>;
interface InlineObject {
  text: string;
  bold?: boolean;
  italics?: boolean;
  decoration?: string[];
  color?: string;
  background?: string;
  link?: string;
  font?: string;
  fontSize?: number;
}
type Marks = Omit<InlineObject, "text">;
type Inline = string | InlineObject;
interface ImageRun { image: HTMLImageElement; link?: string }
type Run = Inline | ImageRun;
interface RenderContext {
  depth: number;
  width: number;
  images: Map<string, { data: string; width: number; height: number }>;
  diagrams: Map<HTMLElement, string>;
}
const PAGE_WIDTH = 595.28;
const PAGE_MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;
const MAX_DEPTH = 80;
const EXPORT_TIMEOUT_MS = 30_000;
const CODE_COLORS: Record<string, string> = {
  "cm-comment": "#6a737d", "cm-keyword": "#8a3ffc", "cm-string": "#0f7b0f",
  "cm-number": "#b35a00", "cm-property": "#005a9c", "cm-variable": "#7a2f8f",
};
function descend(ctx: RenderContext, width = ctx.width): RenderContext {
  if (ctx.depth >= MAX_DEPTH) throw new Error("Document is nested too deeply to export safely as PDF.");
  return { ...ctx, width: Math.max(24, width), depth: ctx.depth + 1 };
}
function element(node: Node): node is HTMLElement { return node.nodeType === Node.ELEMENT_NODE; }
function tag(node: Element): string { return node.tagName.toLowerCase(); }
function withDecoration(marks: Marks, decoration: string): Marks {
  return { ...marks, decoration: [...new Set([...(marks.decoration ?? []), decoration])] };
}

function collectInline(parent: Node, marks: Marks = {}, depth = 0): Run[] {
  if (depth > MAX_DEPTH) throw new Error("Inline formatting is nested too deeply to export as PDF.");
  const result: Run[] = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) result.push({ ...marks, text: node.textContent });
      continue;
    }
    if (!element(node)) continue;
    const name = tag(node);
    if (["script", "style", "label", "input"].includes(name)) continue;
    if (name === "br") { result.push("\n"); continue; }
    if (name === "img") { result.push({ image: node as HTMLImageElement, link: marks.link }); continue; }
    let next = { ...marks };
    if (["strong", "b"].includes(name)) next.bold = true;
    if (["em", "i"].includes(name)) next.italics = true;
    if (name === "u") next = withDecoration(next, "underline");
    if (["s", "strike", "del"].includes(name)) next = withDecoration(next, "lineThrough");
    if (name === "code") next = { ...next, font: "Mono", fontSize: 10.56, background: "#f0f0f0" };
    if (name === "a") {
      next = { ...withDecoration(next, "underline"), color: "#4a90d9" };
      const href = node.getAttribute("href");
      if (href && /^(https?:|mailto:|tel:|#)/i.test(href)) next.link = href;
    }
    if (name === "p" && result.length) result.push("\n");
    result.push(...collectInline(node, next, depth + 1));
  }
  return result;
}

function imageContent(image: HTMLImageElement, ctx: RenderContext, link?: string): Content {
  const source = ctx.images.get(image.getAttribute("src") ?? "");
  if (!source) throw new Error(`Image could not be embedded: ${image.alt || image.src}`);
  const cssWidth = Number.parseFloat(image.style.width || image.getAttribute("width") || "");
  const requestedWidth = (Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : source.width) * 0.75;
  const width = Math.min(ctx.width, requestedWidth, 600 * source.width / source.height);
  return { image: source.data, width, ...(link ? { link } : {}), margin: [0, 4, 0, 6] };
}

function paragraph(node: HTMLElement, ctx: RenderContext, style: Content = {}): Content[] {
  const blocks: Content[] = [];
  let text: Inline[] = [];
  const flush = () => {
    if (text.length) blocks.push({ text, margin: [0, 6, 0, 6], ...style });
    text = [];
  };
  for (const run of collectInline(node)) {
    if (typeof run === "object" && "image" in run) {
      flush();
      blocks.push(imageContent(run.image, ctx, run.link));
    } else text.push(run);
  }
  flush();
  return blocks.length ? blocks : [{ text: " ", margin: [0, 6, 0, 6], ...style }];
}

function checkbox(checked: boolean): Content {
  const canvas: Content[] = [{ type: "rect", x: 0, y: 2, w: 9, h: 9, lineWidth: 0.8, lineColor: "#555555" }];
  if (checked) canvas.push({ type: "polyline", points: [{ x: 1.5, y: 6 }, { x: 4, y: 9 }, { x: 8, y: 3.5 }], lineWidth: 1.2, lineColor: "#333333" });
  return { width: 14, canvas, margin: [0, 6, 0, 0] };
}
function listContent(list: HTMLElement, ctx: RenderContext): Content {
  const items = Array.from(list.children).filter((child) => tag(child) === "li");
  if (!items.length) return { text: "" };
  const isTaskList = list.getAttribute("data-type") === "taskList" || items.every((li) => li.hasAttribute("data-checked") || li.querySelector('input[type="checkbox"]'));
  const content = items.map((li) => {
    const stack = processChildren(li, descend(ctx, ctx.width - 20));
    const item = { stack: stack.length ? stack : [{ text: " " }], margin: [0, 0, 0, 2] };
    if (!isTaskList) return item;
    const input = li.querySelector('input[type="checkbox"]');
    const checked = li.getAttribute("data-checked") === "true" || Boolean(input?.hasAttribute("checked"));
    return { columns: [checkbox(checked), { ...item, width: "*" }], columnGap: 3 };
  });
  if (isTaskList) return { stack: content, margin: [4, 2, 0, 6] };
  if (tag(list) === "ol") {
    const start = Number.parseInt(list.getAttribute("start") ?? "1", 10);
    return { ol: content, start: Number.isFinite(start) ? start : 1, margin: [0, 2, 0, 6] };
  }
  return { ul: content, margin: [0, 2, 0, 6] };
}

function codeContent(node: HTMLElement, ctx: RenderContext): Content[] {
  const code = node.querySelector("code") ?? node;
  const source = code.textContent ?? "";
  const language = normalizeCodeBlockLanguage(code.className.match(/language-([\w-]+)/)?.[1] ?? node.getAttribute("data-language"));
  const ranges = getCodeHighlightRanges(language, source);
  const boundaries = [...new Set([0, source.length, ...ranges.flatMap((range) => [range.from, range.to])])].sort((a, b) => a - b);
  const runs: InlineObject[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i], end = boundaries[i + 1];
    // Decoration order matches the editor; later decorations override colors.
    const match = ranges.filter((range) => range.from <= start && range.to >= end).pop();
    runs.push({ text: source.slice(start, end), ...(match ? { color: CODE_COLORS[match.className] } : {}) });
  }
  const result: Content[] = [{
    table: { widths: ["*"], body: [[{ text: runs.length ? runs : " ", font: "Mono", fontSize: 10.56, lineHeight: 1.2, preserveLeadingSpaces: true }]] },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0.5,
      hLineColor: () => "#e0e0e0", vLineColor: () => "#e0e0e0",
      paddingLeft: () => 10, paddingRight: () => 10,
      paddingTop: () => 8, paddingBottom: () => 8, fillColor: () => "#f5f5f5",
    }, margin: [0, 8, 0, 8],
  }];
  const diagram = ctx.diagrams.get(node);
  if (diagram) result.push({ svg: diagram, fit: [ctx.width, 600], margin: [0, 6, 0, 8] });
  return result;
}

function tableContent(node: HTMLElement, ctx: RenderContext): Content {
  const rows = Array.from(node.querySelectorAll("tr")).filter((row) => row.closest("table") === node);
  if (!rows.length) return { text: "" };
  const body: Content[][] = [];
  const occupied: boolean[][] = [];
  const sources = new Map<Content, HTMLElement>();
  let columns = 0;
  for (const [r, row] of rows.entries()) {
    const cells: Content[] = [];
    const rowOccupied = occupied[r] ??= [];
    let c = 0;
    for (const cell of Array.from(row.children).filter(element).filter((cell) => ["th", "td"].includes(tag(cell)))) {
      while (rowOccupied[c]) cells[c++] = {};
      const colSpan = Math.min(100, Math.max(1, Number.parseInt(cell.getAttribute("colspan") ?? "1", 10) || 1));
      const rowSpan = Math.min(rows.length - r, Math.max(1, Number.parseInt(cell.getAttribute("rowspan") ?? "1", 10) || 1));
      cells[c] = { stack: [], ...(colSpan > 1 ? { colSpan } : {}), ...(rowSpan > 1 ? { rowSpan } : {}),
        ...(tag(cell) === "th" ? { bold: true, fillColor: "#f7f7f7" } : {}) };
      // Render after the grid width is known, so images fit within their cells.
      sources.set(cells[c], cell);
      for (let y = r; y < r + rowSpan; y++) {
        const slots = occupied[y] ??= [];
        for (let x = c; x < c + colSpan; x++) slots[x] = true;
      }
      for (let x = 1; x < colSpan; x++) cells[c + x] = {};
      c += colSpan;
    }
    while (rowOccupied[c]) cells[c++] = {};
    columns = Math.max(columns, cells.length);
    body.push(cells);
  }
  if (!columns) return { text: "" };
  for (const row of body) {
    while (row.length < columns) row.push({});
    for (const cell of row) {
      const source = sources.get(cell);
      if (!source) continue;
      const width = (ctx.width / columns) * Number(cell.colSpan ?? 1) - 14;
      cell.stack = processChildren(source, descend(ctx, width));
      if (!(cell.stack as Content[]).length) cell.stack = [{ text: " " }];
      const align = source.style.textAlign || source.getAttribute("align");
      if (["left", "right", "center", "justify"].includes(align ?? "")) cell.alignment = align;
    }
  }
  const headerRows = rows.findIndex((row) => !Array.from(row.children).every((cell) => tag(cell) === "th"));
  return {
    table: { headerRows: headerRows === -1 ? rows.length : headerRows, widths: Array(columns).fill("*"), body },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5,
      hLineColor: () => "#e0e0e0", vLineColor: () => "#e0e0e0",
      paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 },
    margin: [0, 10, 0, 10],
  };
}

const BLOCKS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "pre", "blockquote", "table", "hr", "div", "section", "article", "img"]);
function processBlock(node: HTMLElement, ctx: RenderContext): Content[] {
  const name = tag(node);
  if (/^h[1-6]$/.test(name)) {
    const level = Number(name[1]);
    return paragraph(node, ctx, { fontSize: [24, 18, 14.4, 12, 12, 12][level - 1], bold: true, lineHeight: 1.05,
      margin: [0, [28.8, 18, 13, 12, 12, 12][level - 1], 0, 8], headlineLevel: level });
  }
  switch (name) {
    case "p": return paragraph(node, ctx);
    case "ul": case "ol": return [listContent(node, ctx)];
    case "pre": return codeContent(node, ctx);
    case "table": return [tableContent(node, ctx)];
    case "blockquote": return [{
      table: { widths: ["*"], body: [[{ stack: processChildren(node, descend(ctx, ctx.width - 20)), italics: true, color: "#999999" }]] },
      layout: { hLineWidth: () => 0, vLineWidth: (i: number) => i === 0 ? 2.25 : 0,
        vLineColor: () => "#e0e0e0", paddingLeft: () => 12, paddingRight: () => 4, paddingTop: () => 0, paddingBottom: () => 0 },
      margin: [0, 8, 0, 8],
    }];
    case "hr": return [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: ctx.width, y2: 0, lineWidth: 1.5, lineColor: "#e0e0e0" }], margin: [0, 18, 0, 18] }];
    case "img": return [imageContent(node as HTMLImageElement, ctx)];
    default: return processChildren(node, descend(ctx));
  }
}
function processChildren(parent: Node, ctx: RenderContext): Content[] {
  const blocks: Content[] = [];
  let inline = document.createElement("span");
  const flush = () => {
    if (inline.childNodes.length) blocks.push(...paragraph(inline, ctx));
    inline = document.createElement("span");
  };
  for (const child of Array.from(parent.childNodes)) {
    if (element(child)) {
      if (["script", "style", "label", "input"].includes(tag(child))) continue;
      if (BLOCKS.has(tag(child))) {
        flush(); blocks.push(...processBlock(child, ctx));
      } else inline.append(child.cloneNode(true));
    } else if ((child.textContent ?? "").trim()) inline.append(child.cloneNode(true));
  }
  flush();
  return blocks;
}

async function embedImage(image: HTMLImageElement): Promise<{ data: string; width: number; height: number }> {
  const source = image.getAttribute("src");
  if (!source) throw new Error("Cannot export an image without a source.");
  const decoded = new Image();
  decoded.crossOrigin = "anonymous";
  decoded.src = source;
  try {
    await decoded.decode();
    const canvas = document.createElement("canvas");
    // Limit decoded export dimensions while keeping high resolution on A4.
    const scale = Math.min(1, 2400 / Math.max(decoded.naturalWidth, decoded.naturalHeight));
    canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image rendering is unavailable.");
    context.drawImage(decoded, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL("image/png"), width: decoded.naturalWidth, height: decoded.naturalHeight };
  } catch {
    throw new Error(`Could not embed image "${image.alt || source}". Check that it is available and permits cross-origin access.`);
  }
}

/** pdfmake's SVG renderer does not resolve Mermaid's embedded CSS selectors. */
function inlineSvgStyles(root: Element): string {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  const svg = document.importNode(root, true);
  host.append(svg);
  document.body.append(host);
  try {
    const properties = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray",
      "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "display"];
    const styles = [svg, ...Array.from(svg.querySelectorAll("*"))].map((node) => {
      const computed = getComputedStyle(node);
      return { node, values: properties.map((property) => [property, computed.getPropertyValue(property)] as const) };
    });
    // Capture all styles before removing classes so descendants keep inherited values.
    for (const { node, values } of styles) {
      node.removeAttribute("class");
      node.removeAttribute("style");
      for (const [property, value] of values) if (value) node.setAttribute(property, value);
      node.setAttribute("font-family", "Serif");
    }
    svg.querySelectorAll("style").forEach((style) => style.remove());
    return new XMLSerializer().serializeToString(svg);
  } finally {
    host.remove();
  }
}

async function render(editorHtml: string, title: string): Promise<Uint8Array> {
  pdfMake.addVirtualFileSystem(await loadPdfFonts());
  pdfMake.addFonts(PDF_FONTS);
  const parsed = new DOMParser().parseFromString(editorHtml, "text/html");
  const root = parsed.querySelector("article") ?? parsed.body;
  const ctx: RenderContext = { depth: 0, width: CONTENT_WIDTH, images: new Map(), diagrams: new Map() };
  await Promise.all(Array.from(root.querySelectorAll("img")).map(async (image) => {
    ctx.images.set(image.getAttribute("src") ?? "", await embedImage(image));
  }));
  let diagramId = 0;
  for (const pre of Array.from(root.querySelectorAll("pre"))) {
    const code = pre.querySelector("code");
    if (!code?.classList.contains("language-mermaid") || !code.textContent?.trim()) continue;
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(`mdedit-pdf-${Date.now()}-${++diagramId}`, code.textContent);
    // Mermaid emits width="100%". pdfmake interprets that as 100 points,
    // which distorts the aspect ratio and can push a small diagram off-page.
    const svgDocument = new DOMParser().parseFromString(svg, "image/svg+xml");
    const svgRoot = svgDocument.documentElement;
    const viewBox = (svgRoot.getAttribute("viewBox") ?? "").trim().split(/[ ,]+/).map(Number);
    if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
      throw new Error("Mermaid diagram has invalid SVG dimensions.");
    }
    svgRoot.setAttribute("width", String(viewBox[2]));
    svgRoot.setAttribute("height", String(viewBox[3]));
    ctx.diagrams.set(pre, inlineSvgStyles(svgRoot));
  }
  const content = processChildren(root, ctx);
  const buffer = await pdfMake.createPdf({
    info: { title }, pageSize: "A4", pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN],
    defaultStyle: { font: "Serif", fontSize: 12, lineHeight: 1.35, color: "#333333" },
    content: content.length ? content : [{ text: "" }],
    pageBreakBefore: (node: { headlineLevel?: number }, container: { getFollowingNodesOnPage: () => unknown[] }) =>
      Boolean(node.headlineLevel && container.getFollowingNodesOnPage().length === 0),
  }).getBuffer();
  if (!(buffer instanceof Uint8Array) || buffer.length === 0) throw new Error("PDF renderer returned an empty document.");
  return new Uint8Array(buffer);
}

export async function renderEditorHtmlToPdfBytes(editorHtml: string, options: { title: string }): Promise<Uint8Array> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      render(editorHtml, options.title),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("PDF rendering timed out after 30 seconds.")), EXPORT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
