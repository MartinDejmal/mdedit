import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";

test("Mermaid preview mutations do not recreate its node view; source edits still reach ProseMirror", async () => {
  const executablePath = process.env.CHROMIUM_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
  assert(executablePath, "Install Chromium and set CHROMIUM_PATH.");
  const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
  let browser;
  try {
    server.middlewares.use("/__mermaid_test__", (_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end("<!doctype html><html><body></body></html>");
    });
    await server.listen();
    browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__mermaid_test__`);
    await page.evaluate(async () => {
      const { createMermaidEditor } = await import("/tests/fixtures/mermaid-editor.ts");
      window.fixture = await createMermaidEditor();
    });
    await page.locator(".mermaid-preview svg").waitFor();
    // Allow the real MutationObserver and asynchronous rendering to settle.
    await page.waitForTimeout(600);
    assert.deepEqual(await page.evaluate(() => ({
      renders: fixture.stats.renders,
      sameView: fixture.wrapper === fixture.editor.view.dom.querySelector(".mermaid-code-block"),
    })), { renders: 1, sameView: true });

    // Preview attributes/text are owned by the view, not the editor document.
    await page.evaluate(() => {
      const preview = fixture.wrapper.querySelector(".mermaid-preview");
      preview.setAttribute("aria-busy", "true");
      preview.appendChild(document.createTextNode("preview-only"));
    });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => fixture.stats.renders), 1);
    assert(!await page.evaluate(() => fixture.editor.getText().includes("preview-only")));

    // Simulate a DOM text mutation inside contentDOM (the browser typing path).
    await page.evaluate(() => {
      const code = fixture.wrapper.querySelector("code");
      code.appendChild(document.createTextNode("\n B --> C[Next]"));
    });
    await page.waitForFunction(() => fixture.editor.getText().includes("C[Next]"));
    await page.waitForFunction(() => fixture.wrapper.querySelector(".mermaid-preview")?.textContent.includes("Next"));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => fixture.stats.renders), 2);
    assert(await page.evaluate(() => fixture.wrapper === fixture.editor.view.dom.querySelector(".mermaid-code-block")));
    await page.evaluate(() => fixture.editor.destroy());
  } finally {
    await browser?.close();
    await server.close();
  }
});
