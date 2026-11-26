import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('find/replace supports literal and regex searches, decorations, replacement and undo', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    const executablePath = process.env.CHROMIUM_PATH ?? ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
    assert(executablePath, 'Install Chromium or set CHROMIUM_PATH');
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
    await page.addInitScript(() => {
      let id = 0;
      window.files = {
        '/docs/unicode.md': '# Ahoj světe\n\nŽluťoučký kůň 😀\n',
        '/docs/blocks.md': 'First  \nSecond\n\n```text\none\ntwo\n```\n\n- red\n- blue\n\n| A | B |\n| --- | --- |\n| C | D |\n',
        '/docs/empty.md': '',
      };
      window.writes = [];
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback() { return ++id; },
        async invoke(command, args) {
          if (command === 'plugin:event|listen') return ++id;
          if (['plugin:event|unlisten', 'plugin:window|set_title'].includes(command)) return;
          if (command === 'get_launch_args') return [];
          if (command === 'open_folder_dialog') return '/docs';
          if (command === 'list_markdown_directory') return Object.keys(files).map(path => ({ path, name: path.split('/').pop(), isDirectory: false }));
          if (command === 'read_text_file') return files[args.path];
          if (command === 'get_file_metadata') return { modifiedMs: 1 };
          if (command === 'save_text_file') { files[args.path] = args.content; writes.push(args); return; }
          throw new Error('Unsupported mock: ' + command);
        },
      };
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    assert.equal(await page.locator('.status-statistics').count(), 0);
    assert.equal(await page.locator('.status-size').count(), 0);
    await page.getByRole('button', { name: 'Toggle file browser', exact: true }).click();
    await page.getByRole('button', { name: 'Choose folder', exact: true }).click();
    const open = async name => {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForFunction(name => document.querySelector('.status-path')?.textContent === name, name);
      assert.equal(await page.locator('.status-dirty').innerText(), 'Saved');
    };
    await open('unicode.md');
    const html = () => page.locator('.ProseMirror').evaluate(node => node.editor.getHTML());
    const before = await html();
    await page.keyboard.press('Control+f');
    const search = page.getByRole('search');
    await search.getByRole('textbox', { name: 'Find', exact: true }).fill('světe');
    await page.waitForFunction(() => document.querySelector('.find-bar [role="status"]').textContent === '1 / 1');
    assert.equal(await page.locator('.search-current').innerText(), 'světe');
    assert.equal(await html(), before, 'search decorations are not document content');
    assert.equal(await page.locator('.status-dirty').innerText(), 'Saved');
    assert.equal(await page.evaluate(() => writes.length), 0);
    await page.keyboard.press('Escape');
    assert.equal(await search.count(), 0);
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.commands.setContent('<p><strong>Cat</strong> cat cat2</p><p>cat</p>', true));
    await page.keyboard.press('Control+h');
    const find = search.getByRole('textbox', { name: 'Find', exact: true });
    await find.fill('cat');
    await page.waitForFunction(() => document.querySelector('.find-bar [role="status"]').textContent === '1 / 4');
    await search.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await search.getByRole('status').innerText(), '2 / 4');
    await search.getByRole('button', { name: 'Previous', exact: true }).click();
    await search.getByLabel('Match case', { exact: true }).check();
    await page.waitForFunction(() => document.querySelector('.find-bar [role="status"]').textContent === '1 / 3');
    await search.getByLabel('Regex', { exact: true }).check();
    await find.fill('[');
    assert.match(await search.getByRole('status').innerText(), /Invalid regular expression/);
    assert(await search.getByRole('button', { name: 'Replace all', exact: true }).isDisabled());
    await find.fill('^');
    await page.waitForFunction(() => document.querySelector('.find-bar [role="status"]').textContent === '0 / 0');
    await find.fill('cat(2?)');
    await search.getByRole('textbox', { name: 'Replace with', exact: true }).fill('dog$1');
    const old = await html();
    await search.getByRole('button', { name: 'Replace all', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.getText().includes('dog2'));
    assert.equal(await page.locator('.ProseMirror').innerText(), 'Cat dog dog2\n\ndog');
    assert.equal(await page.locator('.ProseMirror strong').innerText(), 'Cat');
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.commands.undo());
    assert.equal(await html(), old, 'Replace all is one undo step');
    await find.fill('cat');
    await search.getByLabel('Regex', { exact: true }).uncheck();
    await search.getByRole('textbox', { name: 'Replace with', exact: true }).fill('$1');
    await search.getByRole('button', { name: 'Replace', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.getText().includes('$1'));
    await search.getByRole('button', { name: 'Close find', exact: true }).click();
    assert.equal(await page.locator('.search-match').count(), 0);
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.commands.undo());
    await page.getByRole('button', { name: 'blocks.md', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-path').textContent === 'blocks.md');
    await page.keyboard.press('Control+f');
    await page.getByRole('search').getByRole('textbox', { name: 'Find', exact: true }).fill('two');
    await page.waitForFunction(() => document.querySelector('.find-bar [role="status"]').textContent === '1 / 1');
    assert.equal(await page.locator('.search-current').innerText(), 'two');
  } finally { await browser?.close(); await server.close(); }
});
