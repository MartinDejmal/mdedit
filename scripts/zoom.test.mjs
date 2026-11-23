import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";

test("editor zoom changes only the view, survives document switches and resets at startup", async () => {
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
      window.writes = 0;
      window.htmlExports = [];
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback(fn) { callbacks.set(++id, fn); return id; },
        async invoke(command, args) {
          if (command === "plugin:event|listen") return ++id;
          if (["plugin:event|unlisten", "plugin:window|set_title"].includes(command)) return;
          if (command === "get_launch_args") return [];
          if (command === "save_html_file_dialog") { htmlExports.push(args.content); return '/docs/export.html'; }
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
    const zoom = page.getByRole('combobox', { name: 'Editor zoom', exact: true });
    assert.equal(await zoom.inputValue(), '100');
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await page.getByRole('button', { name: 'Choose folder', exact: true }).click();
    await page.getByRole('button', { name: 'text.md', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-path')?.textContent === 'text.md');
    const snapshot = () => page.evaluate(() => {
      const editor = document.querySelector('.ProseMirror').editor;
      return { html: editor.getHTML(), json: editor.getJSON() };
    });
    const before = await snapshot();
    await page.getByRole('button', { name: 'Export as HTML', exact: true }).click();
    await page.waitForFunction(() => htmlExports.length === 1);
    const sidebarWidth = (await page.locator('.folder-sidebar').boundingBox()).width;
    const toolbarHeight = (await page.getByRole('toolbar').boundingBox()).height;
    const textHeight = await page.locator('.ProseMirror h1').evaluate(node => node.getBoundingClientRect().height);
    await zoom.selectOption('150');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.editor-zoom')).zoom === '1.5');
    const enlarged = await page.locator('.ProseMirror h1').evaluate(node => node.getBoundingClientRect().height);
    assert(Math.abs(enlarged / textHeight - 1.5) < 0.03);
    assert.equal((await page.locator('.folder-sidebar').boundingBox()).width, sidebarWidth);
    assert.equal((await page.getByRole('toolbar').boundingBox()).height, toolbarHeight);
    assert.deepEqual(await snapshot(), before);
    assert.equal(await page.locator('.status-dirty').innerText(), 'Saved');
    assert.equal(await page.evaluate(() => writes), 0);
    // A real Ctrl+wheel gesture changes the editor level and toolbar selection.
    await page.locator('.editor-wrapper').hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await page.waitForFunction(() => document.querySelector('.zoom-control select').value === '175');
    const wheel = (selector, deltaY, ctrlKey) => page.locator(selector).first().evaluate((node, data) => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: data.deltaY, ctrlKey: data.ctrlKey });
      node.dispatchEvent(event); return event.defaultPrevented;
    }, { deltaY, ctrlKey });
    assert(await wheel('.editor-wrapper', 100, true));
    await page.waitForFunction(() => document.querySelector('.zoom-control select').value === '150');
    assert.equal(await wheel('.editor-wrapper', 100, false), false);
    assert(await wheel('.folder-sidebar', -100, true));
    assert.equal(await zoom.inputValue(), '150', 'sidebars do not trigger editor or browser zoom');
    await zoom.selectOption('200');
    await wheel('.editor-wrapper', -100, true);
    assert.equal(await zoom.inputValue(), '200');
    await zoom.selectOption('50');
    await wheel('.editor-wrapper', 100, true);
    assert.equal(await zoom.inputValue(), '50');
    await zoom.selectOption('125');
    assert.deepEqual(await snapshot(), before);
    await page.getByRole('button', { name: 'Export as HTML', exact: true }).click();
    await page.waitForFunction(() => htmlExports.length === 2);
    assert(await page.evaluate(() => htmlExports[0] === htmlExports[1]), 'zoom is absent from exported HTML');
    await page.getByRole('button', { name: 'code.md', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-path')?.textContent === 'code.md');
    assert.equal(await zoom.inputValue(), '125');
    assert.equal(await page.locator('.status-dirty').innerText(), 'Saved');
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await page.getByRole('button', { name: 'New document (Ctrl/Cmd+N)', exact: true }).click();
    assert.equal(await page.locator('.status-path').innerText(), 'Untitled');
    assert.equal(await zoom.inputValue(), '125');
    assert.equal(await page.evaluate(() => writes), 0);
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(key => /zoom/i.test(key))), []);
    // Session reload may restore a recent file, but must not restore zoom.
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.status-path')?.textContent === 'code.md');
    assert.equal(await zoom.inputValue(), '100');
    await page.setViewportSize({ width: 640, height: 900 });
    await page.getByRole('button', { name: 'More editor tools', exact: true }).click();
    await page.getByRole('dialog', { name: 'More editor tools' }).getByRole('combobox', { name: 'Editor zoom' }).selectOption('200');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.editor-zoom')).zoom === '2');
    assert.equal(await page.locator('.status-dirty').innerText(), 'Saved');
    const clean = await snapshot();
    await page.locator('.ProseMirror').fill('Keep these unsaved edits');
    const modified = await snapshot();
    await wheel('.editor-wrapper', 100, true);
    assert.deepEqual(await snapshot(), modified);
    assert.equal(await page.locator('.status-dirty').innerText(), 'Modified');
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.commands.undo());
    assert.deepEqual(await snapshot(), clean, 'zoom does not create undo history entries');
    await page.getByRole('button', { name: 'More editor tools', exact: true }).click();
    assert.equal(await zoom.inputValue(), '175');
  } finally { await browser?.close(); await server.close(); }
});
