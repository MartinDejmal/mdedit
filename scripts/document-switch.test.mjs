import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";

test("file browser prompts only for real edits and resets the viewport after switching", async () => {
  const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
  let browser;
  try {
    await server.listen();
    const executablePath = process.env.CHROMIUM_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
    assert(executablePath, "Install Chromium or set CHROMIUM_PATH");
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
    await page.addInitScript(() => {
      const callbacks = new Map(); let id = 0;
      window.files = {
        "/docs/tasks.md": "# Tasks\n\n- [x] Done\n- [ ] Pending\n",
        "/docs/code.md": "```js\nconst x = 1;\n```\n",
        "/docs/table.md": "| A | B |\n| --- | --- |\n| one | two |\n",
        "/docs/empty.md": "",
        "/docs/text.md": "# Text\n\nSome **bold** and [link](https://example.com).\n",
      };
      files['/docs/long-a.md'] = '# Long A\n\n' + 'Paragraph in the first document.\n\n'.repeat(150);
      files['/docs/long-b.md'] = '# Long B\n\n' + 'Paragraph in the second document.\n\n'.repeat(150);
      window.writes = 0;
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback(fn) { callbacks.set(++id, fn); return id; },
        async invoke(command, args) {
          if (command === "plugin:event|listen") return ++id;
          if (["plugin:event|unlisten", "plugin:window|set_title"].includes(command)) return;
          if (command === "get_launch_args") return [];
          if (command === "open_folder_dialog") return "/docs";
          if (command === "list_markdown_directory") return Object.keys(files).map(path => ({ path, name: path.split('/').pop(), isDirectory: false }));
          if (command === "read_text_file") return files[args.path];
          if (command === "get_file_metadata") return { modifiedMs: 1 };
          if (command === "save_text_file") { files[args.path] = args.content; writes++; return; }
          throw new Error("Unsupported mock: " + command);
        },
      };
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await page.getByRole('button', { name: 'Choose folder', exact: true }).click();
    await page.evaluate(() => {
      window.dirtyHistory = [];
      new MutationObserver(() => {
        if (document.querySelector('.status-dirty')?.textContent === 'Modified') dirtyHistory.push(document.querySelector('.status-path')?.textContent);
      }).observe(document.querySelector('.status-dirty'), { subtree: true, childList: true, characterData: true });
    });
    const open = async (name) => {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForFunction(name => document.querySelector('.status-path')?.textContent === name, name, { timeout: 3000 });
      assert.equal(await page.locator('.status-dirty').innerText(), 'Saved');
      assert.equal(await page.getByRole('dialog').count(), 0);
    };
    // A second pass exercises normalization of every fixture on switch-out.
    for (const name of ['tasks.md', 'code.md', 'table.md', 'empty.md', 'text.md', 'tasks.md', 'text.md']) await open(name);
    await page.getByRole('button', { name: 'Reload current file from disk (Ctrl/Cmd+Alt+R)', exact: true }).click();
    await open('tasks.md');
    await open('text.md');
    assert.deepEqual(await page.evaluate(() => dirtyHistory), [], 'unedited documents never flash Modified');
    assert.equal(await page.evaluate(() => writes), 0, 'opening must not write to disk');
    const viewport = page.locator('.editor-wrapper');
    const scrollDown = async () => {
      await viewport.evaluate(node => { node.scrollTop = 700; });
      assert.equal(await viewport.evaluate(node => node.scrollTop), 700);
    };
    const assertAtStart = async () => {
      // Let delayed editor focus and browser scroll anchoring settle as well.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await viewport.evaluate(node => node.scrollTop), 0, 'newly opened files start at the top');
    };
    for (const zoom of ['100', '150']) {
      await page.getByRole('combobox', { name: 'Editor zoom', exact: true }).selectOption(zoom);
      await open('long-a.md');
      await scrollDown();
      await open('long-b.md');
      await assertAtStart();
      await scrollDown();
      await open('long-a.md');
      await assertAtStart();
      assert.equal(await page.getByRole('combobox', { name: 'Editor zoom', exact: true }).inputValue(), zoom);
      await open('text.md');
    }
    // Cancelling a switch must preserve the current document and viewport.
    await open('long-a.md');
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.commands.insertContentAt(1, 'Unsaved edit '));
    await page.waitForFunction(() => document.querySelector('.status-dirty')?.textContent === 'Modified');
    await scrollDown();
    await page.getByRole('button', { name: 'long-b.md', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.locator('.status-path').innerText(), 'long-a.md');
    assert.equal(await viewport.evaluate(node => node.scrollTop), 700);
    await page.getByRole('button', { name: 'text.md', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-path')?.textContent === 'text.md');
    await assertAtStart();
    assert.equal(await page.evaluate(() => writes), 0);
    await page.locator('[contenteditable=true]').fill('Actual user edit');
    await page.waitForFunction(() => document.querySelector('.status-dirty')?.textContent === 'Modified');
    await page.getByRole('button', { name: 'tasks.md', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.locator('.status-path').innerText(), 'text.md');
    assert.equal(await page.locator('.status-dirty').innerText(), 'Modified');
    await page.getByRole('button', { name: 'tasks.md', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-path')?.textContent === 'tasks.md');
    assert.equal(await page.evaluate(() => writes), 1);
    assert((await page.evaluate(() => files['/docs/text.md'])).includes('Actual user edit'));
    await open('text.md');
    await page.locator('[contenteditable=true]').fill('Temporary edit');
    await page.waitForFunction(() => document.querySelector('.status-dirty')?.textContent === 'Modified');
    await page.locator('[contenteditable=true]').fill('Actual user edit');
    await page.waitForFunction(() => document.querySelector('.status-dirty')?.textContent === 'Saved');
    await open('tasks.md');
    // Conversions which finish after replacing a document cannot dirty its successor.
    assert.deepEqual(await page.evaluate(async () => {
      const service = await import('/src/features/documents/documentService.ts');
      const { useDocumentStore } = await import('/src/stores/documentStore.ts');
      const pending = service.reconcileCanonicalFromEditorHtml('<p>Stale content</p>');
      service.createNewUntitledDocument();
      await pending;
      const state = useDocumentStore.getState();
      return { dirty: state.isDirty, markdown: state.currentCanonicalMarkdown };
    }), { dirty: false, markdown: '\n' });
  } finally { await browser?.close(); await server.close(); }
});
