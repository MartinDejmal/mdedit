import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";

test("toolbar overflow preserves actions and View menu shares file browser state", async () => {
  const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
  let browser;
  try {
    await server.listen();
    const executablePath = process.env.CHROMIUM_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
    assert(executablePath, 'Install Chromium or set CHROMIUM_PATH');
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.addInitScript(() => {
      let nextId = 0;
      const callbacks = new Map();
      window.menus = new Map();
      window.activateBrowserMenu = () => {
        const item = menus.get('view-toggle-file-browser');
        callbacks.get(item.handler.id)({ index: 0, message: 'view-toggle-file-browser' });
      };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback(fn) { const id = ++nextId; callbacks.set(id, fn); return id; },
        unregisterCallback(id) { callbacks.delete(id); },
        async invoke(command, args) {
          if (command === 'plugin:menu|new') {
            const id = args.options?.id ?? String(++nextId);
            menus.set(id, args);
            return [++nextId, id];
          }
          if (command === 'plugin:menu|set_as_app_menu') return null;
          if (command === 'plugin:event|listen') return ++nextId;
          if (['plugin:event|unlisten', 'plugin:window|set_title'].includes(command)) return;
          if (command === 'get_launch_args') return [];
          throw new Error('Unsupported mock: ' + command);
        },
      };
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    const toolbar = page.getByRole('toolbar', { name: 'Editor toolbar' });
    const more = page.getByRole('button', { name: 'More editor tools', exact: true });
    const popup = page.getByRole('dialog', { name: 'More editor tools' });
    assert.equal(await toolbar.locator('.toolbar-items button').first().getAttribute('title'), 'Toggle file browser');
    await page.waitForFunction(() => menus.get('view-toggle-file-browser')?.options.text === 'Toggle file browser');
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await page.getByRole('complementary', { name: 'File browser' }).waitFor();
    await page.waitForFunction(() => menus.get('view-toggle-file-browser').options.checked === true);
    await page.evaluate(() => activateBrowserMenu());
    await page.getByRole('complementary', { name: 'File browser' }).waitFor({ state: 'hidden' });
    await page.waitForFunction(() => menus.get('view-toggle-file-browser').options.checked === false);
    await page.evaluate(() => activateBrowserMenu());
    await page.getByRole('complementary', { name: 'File browser' }).waitFor();
    await page.getByRole('button', { name: 'New document (Ctrl/Cmd+N)', exact: true }).click();
    assert.equal(await more.count(), 0);
    const titles = await toolbar.locator('.toolbar-items button, .toolbar-items select').evaluateAll(nodes => nodes.map(node => node.title));
    for (const width of [640, 800, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await more.waitFor();
      await more.click();
      await popup.waitFor();
      const available = await toolbar.locator('.toolbar-items button, .toolbar-items select, .toolbar-overflow-panel button, .toolbar-overflow-panel select').evaluateAll(nodes => nodes.map(node => node.title));
      assert.deepEqual(available, titles, `all controls remain available at ${width}px`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.keyboard.press('Escape');
      assert.equal(await popup.count(), 0);
      assert(await more.evaluate(button => document.activeElement === button));
    }
    await page.setViewportSize({ width: 640, height: 900 });
    await more.click();
    if (process.env.TOOLBAR_SCREENSHOT) await page.screenshot({ path: process.env.TOOLBAR_SCREENSHOT });
    await popup.getByRole('button', { name: 'Toggle outline', exact: true }).click();
    assert.equal(await page.getByRole('complementary', { name: 'Document outline' }).count(), 0);
    assert.equal(await popup.count(), 0);
    await more.click();
    await popup.getByRole('button', { name: 'Insert table', exact: true }).click();
    await page.locator('.ProseMirror table').waitFor();
    await more.click();
    await popup.getByRole('button', { name: 'Code block', exact: true }).click();
    await more.click();
    await popup.locator('select').filter({ has: page.locator('option[value="javascript"]') }).selectOption('javascript');
    await page.waitForFunction(() => {
      let applied = false;
      document.querySelector('.ProseMirror').editor.state.doc.descendants(node => {
        if (node.type.name === 'codeBlock' && node.attrs.language === 'javascript') applied = true;
      });
      return applied;
    });
    assert.equal(await popup.count(), 0, 'selecting a language applies it and closes overflow');
    await more.click();
    await page.locator('.status-bar').click();
    assert.equal(await popup.count(), 0, 'outside click closes overflow');
    await page.setViewportSize({ width: 1600, height: 900 });
    await more.waitFor({ state: 'hidden' });
    assert.equal(await toolbar.locator('.toolbar-items button, .toolbar-items select').count(), titles.length);
  } finally { await browser?.close(); await server.close(); }
});
