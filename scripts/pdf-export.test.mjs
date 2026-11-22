import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const exec = promisify(execFile);
let server, browser, directory, url;
before(async () => {
  // These tests exercise the real browser pdfmake bundle and inspect actual PDFs.
  const executablePath = process.env.CHROMIUM_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
  assert(executablePath, "Install Chromium and set CHROMIUM_PATH to its executable.");
  await exec("pdftotext", ["-v"]);
  server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
  server.middlewares.use("/__pdf_test__", (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><html><body></body></html>");
  });
  await server.listen();
  url = `http://127.0.0.1:${server.httpServer.address().port}/__pdf_test__`;
  directory = await mkdtemp(join(tmpdir(), "mdedit-pdf-test-"));
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
});
after(async () => {
  await browser?.close();
  await server?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function render(name, html, markdown = false) {
  const page = await browser.newPage();
  try {
    await page.route(/^https?:\/\//, (route) =>
      route.request().url().startsWith(new URL(url).origin) ? route.continue() : route.abort()
    );
    await page.goto(url);
    const base64 = await page.evaluate(async ({ html, markdown }) => {
      const { renderEditorHtmlToPdfBytes } = await import("/src/services/pdfRenderer.ts");
      if (markdown) {
        const { parseMarkdownToEditorContent } = await import("/src/services/markdownService.ts");
        html = (await parseMarkdownToEditorContent(html)).editorContent;
      }
      const bytes = await renderEditorHtmlToPdfBytes(html, { title: "PDF regression" });
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    }, { html, markdown });
    const bytes = Buffer.from(base64, "base64");
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    const path = join(directory, `${name}.pdf`);
    await writeFile(path, bytes);
    const { stdout: text } = await exec("pdftotext", ["-layout", path, "-"]);
    return { path, text, bytes };
  } finally { await page.close(); }
}

test("Markdown formatting creates a real PDF with Unicode, all font faces, lists and links", async () => {
  const markdown = await readFile(new URL("../tests/fixtures/pdf-formatting.md", import.meta.url), "utf8");
  const result = await render("markdown", markdown, true);
  for (const text of ["Žluťoučký kůň", "Third item", "Fourth item", "Nested bullet", "Nested quote", "Done", "Pending", "Bold cell", "Italic cell", "const answer = 42;"]) assert(result.text.includes(text), text);
  const { stdout: fonts } = await exec("pdffonts", [result.path]);
  for (const font of ["LiberationSerif-Bold", "LiberationSerif-Italic", "LiberationSerif-BoldItalic", "LiberationMono"]) assert(fonts.includes(font), font);
  assert(result.bytes.toString("latin1").includes("/Annots"), "link annotation");
});

test("nested table blocks, spanning cells and inline images survive export", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="blue"/></svg>').toString("base64");
  const result = await render("blocks", `<table><tr><th>Header A</th><th>Header B</th></tr><tr><td><p>ParagraphOne</p><p>ParagraphTwo</p><ul><li><p>BulletInCell</p></li></ul></td><td><p>BeforeImage</p><p><img src="data:image/svg+xml;base64,${svg}" alt="Embedded"/></p><p>AfterImage</p></td></tr><tr><td colspan="2"><p>MergedCell</p></td></tr><tr><td rowspan="2"><p>RowSpan</p></td><td><p>RightTop</p></td></tr><tr><td><p>RightBottom</p></td></tr></table><ul data-type="taskList"><li data-checked="true"><p>ParentTask</p><ul data-type="taskList"><li data-checked="false"><p>ChildTask</p></li></ul></li></ul>`);
  for (const value of ["ParagraphOne", "ParagraphTwo", "BulletInCell", "BeforeImage", "AfterImage", "MergedCell", "RowSpan", "RightTop", "RightBottom", "ParentTask", "ChildTask"]) assert(result.text.includes(value), value);
  const { stdout: images } = await exec("pdfimages", ["-list", result.path]);
  assert.match(images, /image\s+120\s+40/, "real image embedded at natural size");
  const { stdout: boxes } = await exec("pdftotext", ["-bbox", result.path, "-"]);
  const y = (text) => Number(boxes.match(new RegExp(`<word[^>]*yMin="([^"]+)"[^>]*>${text}</word>`))?.[1]);
  assert(y("ParagraphTwo") > y("ParagraphOne"), "table paragraphs retain separate lines");
});

test("Mermaid is rendered offline as a styled vector diagram with selectable labels", async () => {
  const result = await render("diagram", '<pre><code class="language-mermaid">flowchart LR\n A[StartLabel] --> B{DecisionLabel}\n B -->|YesLabel| C[FinishLabel]</code></pre>');
  // Mermaid's class-based styles must be inlined; otherwise nodes become black boxes.
  const streams = [...result.bytes.toString("latin1").matchAll(/\nstream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap((match) => {
    try { return [inflateSync(Buffer.from(match[1], "latin1")).toString("latin1")]; }
    catch { return []; }
  }).join("\n");
  const colors = [...streams.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (?:scn|rg)/g)];
  assert(colors.some((color) => Number(color[3]) === 1 && Number(color[1]) > 0.7 && Number(color[1]) < 1 && Number(color[2]) < 1), "diagram has its purple fill, not black defaults");
  // Each label appears once in source code and once in the rendered vector diagram.
  for (const label of ["StartLabel", "DecisionLabel", "FinishLabel"]) assert.equal(result.text.split(label).length - 1, 2, label);
  const { stdout: info } = await exec("pdfinfo", [result.path]);
  assert.match(info, /Pages:\s+1/, "percentage SVG dimensions must not create a spurious page");
});

test("missing images fail explicitly and empty documents still produce valid PDFs", async () => {
  await assert.rejects(render("bad-image", '<p><img src="data:image/png;base64,invalid" alt="Missing"/></p>'), /Could not embed image/);
  const empty = await render("empty", "");
  assert(empty.bytes.length > 100);
});

test("long documents paginate without losing code or table rows", async () => {
  const paragraphs = Array.from({ length: 60 }, (_, i) => `<p>Paragraph_${i}: content for pagination.</p>`).join("");
  const code = Array.from({ length: 100 }, (_, i) => `  const CODE_${i} = ${i};`).join("\n");
  const rows = Array.from({ length: 60 }, (_, i) => `<tr><td><p>ROW_${i}</p></td><td><p>Value_${i}</p></td></tr>`).join("");
  const result = await render("long", `${paragraphs}<h2>Long code</h2><pre><code class="language-javascript">${code}</code></pre><h2>Long table</h2><table><tr><th>Name</th><th>Value</th></tr>${rows}</table><p>DOCUMENT_END</p>`);
  for (const text of ["Paragraph_59", "CODE_99", "ROW_59", "DOCUMENT_END"]) assert(result.text.includes(text), text);
  const { stdout: info } = await exec("pdfinfo", [result.path]);
  assert(Number(info.match(/Pages:\s+(\d+)/)?.[1]) >= 3);
});
