import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('status statistics follow content, Unicode, cursor, save, undo and file switches', async () => {
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
    const expectText = async (selector, text) => {
      await page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent === text, { selector, text }, { timeout: 5000 }).catch(async () => assert.equal(await page.locator(selector).textContent(), text));
    };
    const expectCounts = async (lines, words, characters) => {
      await expectText('.status-lines', `Lines: ${lines}`);
      await expectText('.status-words', `Words: ${words}`);
      await expectText('.status-characters', `Chars: ${characters}`);
    };
    await open('unicode.md');
    const text = 'Ahoj světe\nŽluťoučký kůň 😀';
    await expectCounts(2, 4, Array.from(text).length);
    await expectText('.status-cursor', 'Ln 1, Col 1');
    const expectedBytes = Buffer.byteLength('# Ahoj světe\n\nŽluťoučký kůň 😀\n', 'utf8');
    await expectText('.status-size', `${expectedBytes} B`);
    // Cursor position uses Unicode characters, not UTF-16 code units or Markdown syntax.
    await page.evaluate(() => {
      const editor = document.querySelector('.ProseMirror').editor;
      editor.commands.focus('end');
    });
    await expectText('.status-cursor', `Ln 2, Col ${Array.from('Žluťoučký kůň 😀').length + 1}`);
    await page.waitForFunction(() => document.activeElement?.classList.contains('ProseMirror'));
    await page.keyboard.press('ArrowLeft');
    await expectText('.status-cursor', `Ln 2, Col ${Array.from('Žluťoučký kůň ').length + 1}`);
    // With a backwards selection, report the active end rather than its sorted start.
    await page.evaluate(() => {
      const editor = document.querySelector('.ProseMirror').editor;
      editor.commands.setTextSelection({ from: editor.state.doc.content.size - 1, to: 1 });
    });
    await expectText('.status-cursor', 'Ln 1, Col 1');
    assert.equal(await page.locator('.status-dirty').innerText(), 'Saved');
    assert.equal(await page.evaluate(() => writes.length), 0);
    // Narrow windows and zoom must not change logical counts or overflow the status bar.
    await page.getByRole('combobox', { name: 'Editor zoom', exact: true }).selectOption('150');
    await page.setViewportSize({ width: 380, height: 900 });
    await expectCounts(2, 4, Array.from(text).length);
    assert(await page.locator('.status-bar').evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.setViewportSize({ width: 1800, height: 900 });
    await open('blocks.md');
    const blocksText = 'First\nSecond\none\ntwo\n\nred\nblue\nA\nB\nC\nD';
    await expectCounts(11, 10, Array.from(blocksText).length);
    await expectText('.status-cursor', 'Ln 1, Col 1');
    await page.evaluate(() => {
      const editor = document.querySelector('.ProseMirror').editor;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'codeBlock') editor.commands.setTextSelection(pos + 1 + 'one\ntw'.length);
      });
    });
    await expectText('.status-cursor', 'Ln 4, Col 3');
    await open('empty.md');
    await expectCounts(1, 0, 0);
    await expectText('.status-cursor', 'Ln 1, Col 1');
    // The canonical empty Markdown saved by the application contains one LF byte.
    await expectText('.status-size', '1 B');
    await page.locator('.ProseMirror').fill('Příliš 😀');
    await expectCounts(1, 1, Array.from('Příliš 😀').length);
    await expectText('.status-size', `${Buffer.byteLength('Příliš 😀\n', 'utf8')} B`);
    await expectText('.status-dirty', 'Modified');
    await page.getByRole('button', { name: 'Save file (Ctrl/Cmd+S)', exact: true }).click();
    await expectText('.status-dirty', 'Saved');
    const saved = await page.evaluate(() => writes.at(-1).content);
    assert.equal(await page.locator('.status-size').innerText(), `${Buffer.byteLength(saved, 'utf8')} B`);
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.commands.undo());
    await expectCounts(1, 0, 0);
    await expectText('.status-size', '1 B');
    await expectText('.status-dirty', 'Modified');
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.commands.redo());
    await expectCounts(1, 1, Array.from('Příliš 😀').length);
    await expectText('.status-dirty', 'Saved');
    assert.equal(await page.evaluate(() => writes.length), 1, 'statistics never write to disk');
    await open('unicode.md');
    await expectCounts(2, 4, Array.from(text).length);
    await expectText('.status-cursor', 'Ln 1, Col 1');
    await expectText('.status-size', `${expectedBytes} B`);
  } finally { await browser?.close(); await server.close(); }
});
