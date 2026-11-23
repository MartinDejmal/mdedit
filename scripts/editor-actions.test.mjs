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
    editor.commands.setContent(html, false, { preserveWhitespace: "full" });
    editor.view.updateState(editor.state.constructor.create({
      schema: editor.schema, doc: editor.state.doc, plugins: editor.state.plugins,
    }));
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


test('#46 Heading lifts only the selected list item, preserving siblings, marks and undo', async () => {
  const page = await openEditor();
  try {
    for (const html of [
      '<ul><li><p>Before</p></li><li><p>Target <strong>bold</strong></p></li><li><p>After</p></li></ul>',
      '<ol start="3"><li><p>Before</p></li><li><p>Target <strong>bold</strong></p></li><li><p>After</p></li></ol>',
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Before</p></li><li data-type="taskItem" data-checked="false"><p>Target <strong>bold</strong></p></li><li data-type="taskItem"><p>After</p></li></ul>',
      '<ul><li><p>Parent</p><ul><li><p>Before</p></li><li><p>Target <strong>bold</strong></p></li><li><p>After</p></li></ul></li></ul>',
    ]) {
      await setContent(page, html);
      await page.evaluate(() => {
        const editor = document.querySelector('.ProseMirror').editor;
        editor.state.doc.descendants((node, pos) => {
          if (node.isText && node.text.startsWith('Target')) editor.chain().focus().setTextSelection(pos + 1).run();
        });
      });
      await page.waitForTimeout(40);
      const before = await documentJSON(page);
      await page.getByRole('button', { name: 'Heading: Normal → H1', exact: true }).click();
      const after = await documentJSON(page);
      const heading = after.content.find(node => node.type === 'heading');
      assert(heading, 'heading is outside the list: ' + JSON.stringify(after));
      assert.equal(heading.attrs.level, 1);
      assert(heading.content.some(node => node.marks?.some(mark => mark.type === 'bold')));
      assert.equal(await page.locator('.ProseMirror li').filter({ hasText: 'Before' }).count() >= 1, true);
      assert.equal(await page.locator('.ProseMirror li').filter({ hasText: 'After' }).count() >= 1, true);
      await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)', exact: true }).click();
      assert.deepEqual(await documentJSON(page), before, 'one Undo restores the list');
    }
    await setContent(page, '<p>Cycle</p>');
    for (const title of ['Heading: Normal → H1', 'Heading: H1 → H2', 'Heading: H2 → H3', 'Heading: H3 → Normal']) {
      await page.getByRole('button', { name: title, exact: true }).click();
    }
    assert.equal((await documentJSON(page)).content[0].type, 'paragraph');
  } finally { await page.close(); }
});


test('#47 Table converts selected lines, TSV and Markdown cells while preserving outside text and marks', async () => {
  const page = await openEditor();
  try {
    const selectAll = () => page.evaluate(() => {
      const editor = document.querySelector('.ProseMirror').editor;
      editor.chain().focus().setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 }).run();
    });
    for (const [html, rows, columns] of [
      ['<p>One</p><p><strong>Two</strong></p><p>Three</p><p>Four</p>', 4, 1],
      ['<p>Name\tValue</p><p>Alpha\t42</p><p>Beta</p>', 3, 2],
      ['<p>| Name | Value |</p><p>| --- | --- |</p><p>| Alpha | 42 |</p>', 2, 2],
      ['<p>First<br>Second<br>Third</p>', 3, 1],
    ]) {
      await setContent(page, html);
      await selectAll();
      await page.waitForTimeout(40);
      const before = await documentJSON(page);
      await page.getByRole('button', { name: 'Insert table', exact: true }).click();
      const table = (await documentJSON(page)).content.find(node => node.type === 'table');
      assert.equal(table.content.length, rows);
      assert(table.content.every(row => row.content.length === columns), JSON.stringify(table));
      if (html.includes('<strong>')) assert(JSON.stringify(table).includes('"bold"'));
      await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)', exact: true }).click();
      assert.deepEqual(await documentJSON(page), before);
    }
    await setContent(page, '<p>Before selected After</p>');
    await page.evaluate(() => document.querySelector('.ProseMirror').editor.chain().focus().setTextSelection({ from: 8, to: 16 }).run());
    await page.getByRole('button', { name: 'Insert table', exact: true }).click();
    const result = await documentJSON(page);
    assert.equal(result.content[0].content[0].text, 'Before ');
    assert.equal(result.content[1].type, 'table');
    assert.equal(result.content[1].content[0].content[0].content[0].content[0].text, 'selected');
    assert.equal(result.content[2].content[0].text, ' After');
    await setContent(page, '<p></p>');
    await page.getByRole('button', { name: 'Insert table', exact: true }).click();
    const defaults = (await documentJSON(page)).content.find(node => node.type === 'table');
    assert.equal(defaults.content.length, 3);
    assert(defaults.content.every(row => row.content.length === 3));
  } finally { await page.close(); }
});


test('#48 Tab and Shift-Tab indent the nearest list item and keep editor focus', async () => {
  const page = await openEditor();
  try {
    const cursor = async text => {
      await page.evaluate(text => {
        const editor = document.querySelector('.ProseMirror').editor;
        let position;
        editor.state.doc.descendants((node, pos) => {
          if (node.isText && node.text.startsWith(text)) position = pos + 1;
        });
        editor.chain().focus().setTextSelection(position).run();
      }, text);
      await page.waitForTimeout(40);
    };
    const depth = () => page.evaluate(() => {
      const { $from } = document.querySelector('.ProseMirror').editor.state.selection;
      let count = 0;
      for (let i = 1; i <= $from.depth; i++) if (['listItem', 'taskItem'].includes($from.node(i).type.name)) count++;
      return count;
    });
    for (const html of [
      '<ul><li><p>Before</p></li><li><p>Target <strong>bold</strong></p></li></ul>',
      '<ol start="3"><li><p>Before</p></li><li><p>Target <strong>bold</strong></p></li></ol>',
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Before</p></li><li data-type="taskItem" data-checked="true"><p>Target <strong>bold</strong></p></li></ul>',
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Parent task</p><ul><li><p>Before</p></li><li><p>Target <strong>bold</strong></p></li></ul></li></ul>',
    ]) {
      await setContent(page, html);
      await cursor('Target');
      const before = await documentJSON(page);
      const beforeDepth = await depth();
      await page.keyboard.press('Tab');
      assert.equal(await depth(), beforeDepth + 1);
      assert(await page.evaluate(() => Boolean(document.activeElement.closest('.ProseMirror'))));
      assert(JSON.stringify(await documentJSON(page)).includes('"bold"'));
      await page.keyboard.press('Shift+Tab');
      assert.equal(await depth(), beforeDepth);
      assert.deepEqual(await documentJSON(page), before, 'outdent restores structure and task checked state');
    }
    await setContent(page, '<ul><li><p>First</p></li><li><p>Second</p></li></ul>');
    await cursor('First');
    const before = await documentJSON(page);
    await page.keyboard.press('Tab');
    assert.deepEqual(await documentJSON(page), before, 'first item has no preceding parent to sink under');
    assert(await page.evaluate(() => Boolean(document.activeElement.closest('.ProseMirror'))));
    await page.keyboard.press('Shift+Tab');
    assert.equal((await documentJSON(page)).content[0].type, 'paragraph');
    assert.equal(await depth(), 0);
  } finally { await page.close(); }
});
