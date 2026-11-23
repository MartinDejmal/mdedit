import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";

test("New creates empty files in the selected folder from toolbar, shortcut and menu", async () => {
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
      window.files = { '/docs/Untitled.md': 'Existing content' };
      window.created = [];
      window.failCreation = false;
      window.activateNew = () => {
        const file = [...menus.values()].findLast(menu => menu.options?.text === 'File');
        const item = file.options.items.find(item => item.id === 'file-new');
        callbacks.get(item.handler.id)({ index: 0, message: 'file-new' });
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
          if (command === 'open_folder_dialog') return '/docs';
          if (command === 'list_markdown_directory') {
            const entries = Object.keys(files).filter(path => path.slice(0, path.lastIndexOf('/')) === args.path)
              .map(path => ({ path, name: path.slice(path.lastIndexOf('/') + 1), isDirectory: false }));
            return args.path === '/docs' ? [{ path: '/docs/sub', name: 'sub', isDirectory: true }, ...entries] : entries;
          }
          if (command === 'create_markdown_document') {
            if (failCreation) throw 'Folder is read-only';
            let index = 1, path;
            do { path = args.folder + '/Untitled' + (index === 1 ? '' : ' ' + index) + '.md'; index++; } while (path in files);
            files[path] = '';
            created.push(path);
            return path;
          }
          if (command === 'read_text_file') return files[args.path];
          if (command === 'get_file_metadata') return { modifiedMs: 1 };
          throw new Error('Unsupported mock: ' + command);
        },
      };
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    const newButton = page.getByRole('button', { name: 'New document (Ctrl/Cmd+N)', exact: true });
    const waitPath = async path => {
      await page.waitForFunction(path => document.querySelector('.status-path')?.getAttribute('title') === path, path);
      assert.equal(await page.locator('.status-dirty').innerText(), 'Saved');
      assert.equal(await page.evaluate(path => files[path], path), '');
      await page.waitForFunction(path => [...document.querySelectorAll('.folder-tree-item')].some(node => node.title === path), path);
    };
    // No selection, or a hidden browser, keeps the existing untitled workflow.
    await newButton.click();
    assert.equal(await page.locator('.status-path').innerText(), 'Untitled');
    assert.equal(await page.evaluate(() => created.length), 0);
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await newButton.click();
    assert.equal(await page.evaluate(() => created.length), 0);
    await page.getByRole('button', { name: 'Choose folder', exact: true }).click();
    await page.getByRole('button', { name: 'sub', exact: true }).waitFor();
    await newButton.click();
    await waitPath('/docs/Untitled 2.md');
    assert.equal(await page.evaluate(() => files['/docs/Untitled.md']), 'Existing content');
    await page.getByRole('button', { name: 'sub', exact: true }).click();
    await page.keyboard.press('Control+n');
    await waitPath('/docs/sub/Untitled.md');
    await page.waitForFunction(() => [...menus.values()].some(menu => menu.options?.text === 'File'));
    await page.evaluate(() => activateNew());
    await waitPath('/docs/sub/Untitled 2.md');
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await newButton.click();
    await waitPath('/docs/Untitled 3.md');
    // Cancelling discard must not create anything on disk.
    await page.locator('[contenteditable=true]').fill('Unsaved changes');
    await newButton.click();
    await page.getByRole('button', { name: 'Keep Editing', exact: true }).click();
    assert.equal(await page.evaluate(() => created.length), 4);
    assert.equal(await page.locator('[contenteditable=true]').innerText(), 'Unsaved changes');
    await newButton.click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await waitPath('/docs/Untitled 4.md');
    await page.evaluate(() => { failCreation = true; });
    await newButton.click();
    await page.getByText('Folder is read-only', { exact: true }).waitFor();
    assert.equal(await page.locator('.status-path').getAttribute('title'), '/docs/Untitled 4.md');
    assert.equal(await page.evaluate(() => created.length), 5);
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await newButton.click();
    assert.equal(await page.locator('.status-path').innerText(), 'Untitled');
    assert.equal(await page.evaluate(() => created.length), 5);
  } finally { await browser?.close(); await server.close(); }
});
