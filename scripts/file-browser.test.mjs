import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";

test("file browser navigates, renames, moves, creates folders and confirms deletion", async () => {
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
      window.files = { '/work/a.md': 'Original text', '/work/dest/c.md': 'Keep target' };
      window.directories = new Set(['/', '/work', '/work/dest']);
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
          if (command === 'get_launch_args') return ['/work/a.md'];
          if (command === 'open_folder_dialog') return '/work/dest';
          if (command === 'list_markdown_directory') {
            const parent = path => path.slice(0, path.lastIndexOf('/')) || '/';
            return [...directories].filter(path => path !== args.path && parent(path) === args.path).map(path => ({ path, name: path.split('/').pop(), isDirectory: true }))
              .concat(Object.keys(files).filter(path => parent(path) === args.path).map(path => ({ path, name: path.split('/').pop(), isDirectory: false })));
          }
          if (command === 'relocate_markdown_document') {
            const path = args.folder + '/' + (args.name ?? args.source.split('/').pop());
            if (path in files) throw 'Destination already exists';
            files[path] = files[args.source]; delete files[args.source]; return path;
          }
          if (command === 'delete_markdown_document') { delete files[args.path]; return; }
          if (command === 'create_browser_directory') {
            const path = args.parent.replace(/\/$/, '') + '/' + args.name;
            if (directories.has(path)) throw 'Folder already exists';
            directories.add(path); return path;
          }
          if (command === 'save_text_file') { files[args.path] = args.content; return; }
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
    assert.deepEqual(await page.evaluate(async () => {
      const { parentDirectory } = await import('/src/lib/utils.ts');
      return ['/work/a.md', '/', 'C:\\notes\\a.md', 'C:\\', '\\\\server\\share\\a.md', '\\\\server\\share'].map(parentDirectory);
    }), ['/work', '/', 'C:\\notes', 'C:\\', '\\\\server\\share', '\\\\server\\share']);
    const row = path => page.locator('.folder-tree-item').filter({ has: page.locator('span') }).and(page.locator(`[title="${path}"]`));
    const waitPath = path => page.waitForFunction(path => document.querySelector('.status-path')?.getAttribute('title') === path, path);
    const dialog = page.getByRole('dialog');
    await waitPath('/work/a.md');
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await page.getByRole('button', { name: 'work', exact: true }).waitFor();
    await row('/work/a.md').click();
    await dialog.getByRole('textbox').fill('renamed.md');
    await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
    await waitPath('/work/renamed.md');
    assert.equal(await page.evaluate(() => files['/work/a.md']), undefined);
    await page.locator('[contenteditable=true]').fill('Unsaved editor content');
    await row('/work/renamed.md').dragTo(row('/work/dest'));
    await waitPath('/work/dest/renamed.md');
    await row('/work/dest/renamed.md').waitFor();
    assert.equal(await page.locator('[contenteditable=true]').innerText(), 'Unsaved editor content');
    assert.equal(await page.locator('.status-dirty').innerText(), 'Modified');
    await page.getByRole('button', { name: 'Save file (Ctrl/Cmd+S)', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-dirty')?.textContent === 'Saved');
    assert((await page.evaluate(() => files['/work/dest/renamed.md'])).includes('Unsaved editor content'));
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await page.getByRole('button', { name: 'dest', exact: true }).waitFor();
    await row('/work/dest/renamed.md').waitFor();
    await row('/work/dest/renamed.md').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename…', exact: true }).click();
    await dialog.getByRole('textbox').fill('c.md');
    await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
    await page.getByText('Destination already exists', { exact: true }).waitFor();
    assert.equal(await page.locator('.status-path').getAttribute('title'), '/work/dest/renamed.md');
    await row('/work/dest/renamed.md').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete…', exact: true }).click();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert(await page.evaluate(() => '/work/dest/renamed.md' in files));
    await page.locator('[contenteditable=true]').fill('Do not silently lose me');
    await row('/work/dest/renamed.md').press('Delete');
    await dialog.getByText(/Unsaved changes/).waitFor();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-path')?.textContent === 'Untitled');
    assert.equal(await page.evaluate(() => '/work/dest/renamed.md' in files), false);
    await page.getByRole('button', { name: 'Parent folder', exact: true }).click();
    await page.getByRole('button', { name: 'work', exact: true }).waitFor();
    await page.getByRole('button', { name: 'New folder', exact: true }).click();
    await dialog.getByRole('textbox').fill('New notes');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await row('/work/New notes').waitFor();
    assert(await page.evaluate(() => directories.has('/work/New notes')));
    await page.getByRole('button', { name: 'Parent folder', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.folder-root')?.title === '/');
    assert(await page.getByRole('button', { name: 'Parent folder', exact: true }).isDisabled());
  } finally { await browser?.close(); await server.close(); }
});
