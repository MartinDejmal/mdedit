import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

let server, browser, origin;
before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const executablePath = process.env.CHROMIUM_PATH ?? ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
  assert(executablePath, 'Install Chromium or set CHROMIUM_PATH');
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
});
after(async () => { await browser?.close(); await server?.close(); });

async function openEditor() {
  const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
  await page.addInitScript(() => {
    let id = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback() { return ++id; },
      async invoke(command) {
        if (command === 'plugin:event|listen') return ++id;
        if (['plugin:event|unlisten', 'plugin:window|set_title'].includes(command)) return;
        if (command === 'get_launch_args') return [];
        throw new Error('Unsupported test command: ' + command);
      },
    };
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'New document (Ctrl/Cmd+N)', exact: true }).click();
  await page.locator('.ProseMirror').waitFor();
  return page;
}

// Set test content without carrying unrelated setup transactions into undo history.
async function setContent(page, html) {
  await page.evaluate(html => {
    const editor = document.querySelector('.ProseMirror').editor;
    editor.commands.setContent(html);
    editor.commands.setTextSelection(1);
  }, html);
}

async function documentJSON(page) {
  return page.evaluate(() => document.querySelector('.ProseMirror').editor.getJSON());
}

test('#44 Undo and Redo buttons track history and work through overflow', async () => {
  const page = await openEditor();
  try {
    const undo = page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)', exact: true });
    const redo = page.getByRole('button', { name: 'Redo (Ctrl/Cmd+Shift+Z)', exact: true });
    assert(await undo.isDisabled()); assert(await redo.isDisabled());
    await page.locator('.ProseMirror').pressSequentially('Hello history');
    assert.equal(await undo.isDisabled(), false);
    await undo.click();
    assert.equal((await page.locator('.ProseMirror').innerText()).trim(), '');
    assert.equal(await redo.isDisabled(), false);
    await redo.click();
    assert.equal(await page.locator('.ProseMirror').innerText(), 'Hello history');
    await page.setViewportSize({ width: 420, height: 900 });
    await page.getByRole('button', { name: 'More editor tools', exact: true }).click();
    await page.getByRole('dialog', { name: 'More editor tools' }).getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)', exact: true }).click();
    assert.equal((await page.locator('.ProseMirror').innerText()).trim(), '');
  } finally { await page.close(); }
});
