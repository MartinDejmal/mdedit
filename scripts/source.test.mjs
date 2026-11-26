import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('Markdown source preserves raw files, tracks edits, saves, exports and switches safely', async () => {
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
      files['/docs/raw.md'] = '#  Original\r\n\r\nParagraph with **bold**.\r\n\r\n';
      window.exports = [];
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
          if (command === 'save_html_file_dialog') { exports.push(args.content); return '/docs/export.html'; }
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
    const toggle = page.getByRole('button', { name: 'Toggle Markdown source', exact: true });
    const source = page.getByRole('textbox', { name: 'Markdown source', exact: true });
    const status = async text => page.waitForFunction(text => document.querySelector('.status-dirty')?.textContent === text, text);
    await open('raw.md');
    const raw = await page.evaluate(() => files['/docs/raw.md']);
    await toggle.click();
    await source.waitFor();
    assert.equal(await source.inputValue(), raw.replace(/\r\n/g, '\n'));
    await status('Saved');
    assert.equal(await page.locator('.status-size').innerText(), `${Buffer.byteLength(raw)} B`);
    await page.getByRole('button', { name: 'Save file (Ctrl/Cmd+S)', exact: true }).click();
    await page.waitForFunction(() => writes.length === 1);
    assert.equal(await page.evaluate(() => writes[0].content), raw, 'merely viewing source does not rewrite line endings or formatting');
    await toggle.click();
    await source.waitFor({ state: 'detached' });
    await status('Saved');
    await page.getByRole('button', { name: 'Save file (Ctrl/Cmd+S)', exact: true }).click();
    await page.waitForFunction(() => writes.length === 2);
    assert.equal(await page.evaluate(() => writes[1].content), raw, 'WYSIWYG projection preserves unedited source');
    await toggle.click();
    const edited = '# Edited\n\nSource **bold** and `code`.\n';
    await source.fill(edited);
    await status('Modified');
    await page.waitForFunction(() => document.querySelector('.status-cursor').textContent === 'Ln 4, Col 1');
    assert.equal(await page.locator('.status-lines').innerText(), 'Lines: 4');
    assert(await page.getByRole('button', { name: 'Bold (Ctrl+B)', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)', exact: true }).click();
    assert.equal(await source.inputValue(), raw.replace(/\r\n/g, '\n'));
    await status('Saved');
    await source.press('Control+Shift+z');
    assert.equal(await source.inputValue(), edited);
    await status('Modified');
    await page.getByRole('button', { name: 'Export as HTML', exact: true }).click();
    await page.waitForFunction(() => exports.length === 1);
    assert(await page.evaluate(() => exports[0].includes('<h1>Edited</h1>') && exports[0].includes('<strong>bold</strong>')));
    await source.press('Control+s');
    await status('Saved');
    assert.equal(await page.evaluate(() => files['/docs/raw.md']), edited);
    await toggle.click();
    await page.locator('.ProseMirror h1').getByText('Edited', { exact: true }).waitFor();
    await status('Saved');
    await page.locator('.ProseMirror').press('Control+End');
    await page.keyboard.type('More');
    await status('Modified');
    await toggle.click();
    assert((await source.inputValue()).includes('More'));
    await source.press('Control+h');
    const find = page.getByRole('search');
    await find.getByRole('textbox', { name: 'Find', exact: true }).fill('More');
    await find.getByRole('textbox', { name: 'Replace with', exact: true }).fill('Replaced');
    await find.getByRole('button', { name: 'Replace all', exact: true }).click();
    assert((await source.inputValue()).includes('Replaced'));
    await find.getByRole('button', { name: 'Close find', exact: true }).click();
    await source.press('Control+z');
    assert((await source.inputValue()).includes('More'), 'source Replace all is one undo step');
    await page.getByRole('button', { name: 'unicode.md', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert((await source.inputValue()).includes('More'));
    await page.getByRole('button', { name: 'unicode.md', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-path').textContent === 'unicode.md');
    assert.equal(await source.inputValue(), '# Ahoj světe\n\nŽluťoučký kůň 😀\n');
    assert((await page.evaluate(() => files['/docs/raw.md'])).includes('More'));
    await status('Saved');
    await source.fill('Temporary');
    await source.press('Control+z');
    await status('Saved');
    await page.getByRole('button', { name: 'empty.md', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-path').textContent === 'empty.md');
    assert.equal(await source.inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)', exact: true }).isDisabled(), true, 'history does not leak across files');
    await source.fill('# New heading\n');
    await toggle.click();
    await page.locator('.ProseMirror h1').getByText('New heading', { exact: true }).waitFor();
    await status('Modified');
    await page.getByRole('button', { name: 'Save file (Ctrl/Cmd+S)', exact: true }).click();
    await status('Saved');
    await toggle.click();
    await source.fill('# Long\n\n' + 'A line of text.\n'.repeat(150));
    await page.getByRole('button', { name: 'Save file (Ctrl/Cmd+S)', exact: true }).click();
    await status('Saved');
    await source.evaluate(node => { node.scrollTop = 700; });
    assert((await source.evaluate(node => node.scrollTop)) > 0);
    await page.getByRole('button', { name: 'unicode.md', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.status-path').textContent === 'unicode.md');
    assert.equal(await source.evaluate(node => node.scrollTop), 0);
    await page.waitForFunction(() => document.querySelector('.status-cursor').textContent === 'Ln 1, Col 1');
  } finally { await browser?.close(); await server.close(); }
});
