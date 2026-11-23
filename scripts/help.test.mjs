import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";

test("Help and About are bundled, bilingual, accessible and preserve the active document", async t => {
  const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
  let browser;
  try {
    await server.listen();
    const executablePath = process.env.CHROMIUM_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
    assert(executablePath, 'Install Chromium or set CHROMIUM_PATH');
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.addInitScript(() => {
      window.isTauri = true;
      let nextId = 0;
      const callbacks = new Map();
      window.menus = new Map();
      window.events = [];
      window.destroyed = 0;
      window.activateHelpMenu = (label, submenu = "Help") => {
        const help = [...menus.values()].findLast(menu => menu.kind === 'Submenu' && menu.options.text === submenu);
        const item = help.options.items.find(item => item.text === label);
        callbacks.get(item.handler.id)({ index: 0, message: item.id });
      };
      window.requestWindowClose = () => {
        for (const event of events.filter(event => event.event === 'tauri://close-requested')) callbacks.get(event.handler)({ event: event.event, id: event.id, payload: null });
      };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener(_name, id) { events = events.filter(event => event.id !== id); } };
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
          if (command === 'plugin:event|listen') { const id = ++nextId; events.push({ ...args, id }); return id; }
          if (command === 'plugin:window|destroy') { destroyed++; return; }
          if (['plugin:event|unlisten', 'plugin:window|set_title'].includes(command)) return;
          if (command === 'list_font_families') return ['Arial', 'Courier New'];
          if (command === 'get_launch_args') return [];
          throw new Error('Unsupported mock: ' + command);
        },
      };
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    const externalRequests = [];
    await page.route(/^https?:\/\//, route => {
      if (route.request().url().startsWith(`http://127.0.0.1:${server.httpServer.address().port}/`)) return route.continue();
      externalRequests.push(route.request().url()); return route.abort();
    });
    await page.getByRole('button', { name: 'New document (Ctrl/Cmd+N)', exact: true }).click();
    await page.locator('.ProseMirror').evaluate(node => {
      node.editor.commands.setContent('<p>Keep this unsaved document with <code>inlineCode()</code>.</p><pre><code>blockCode();</code></pre>', true);
    });
    const before = await page.locator('.ProseMirror').innerHTML();
    await page.waitForFunction(() => document.querySelector('.status-dirty')?.textContent === 'Modified');
    await page.waitForFunction(() => [...menus.values()].some(menu => menu.kind === 'Submenu' && menu.options.text === 'Help'));
    assert.deepEqual(await page.evaluate(() => {
      const help = [...menus.values()].findLast(menu => menu.kind === 'Submenu' && menu.options.text === 'Help');
      return help.options.items.map(item => item.text);
    }), ['Help', 'About']);
    const openFonts = () => page.evaluate(() => activateHelpMenu('Font Settings…', 'View'));
    const fonts = page.getByRole('dialog', { name: 'Font Settings', exact: true });
    const family = page.getByLabel('Editor font', { exact: true });
    const codeFamily = page.getByLabel('Code font', { exact: true });
    const textSwitch = fonts.getByRole('button', { name: 'Text', exact: true });
    const codeSwitch = fonts.getByRole('button', { name: 'Code', exact: true });
    const editorFont = () => page.locator('.ProseMirror').evaluate(node => getComputedStyle(node).fontFamily);
    const fontOf = async selector => page.locator(selector).evaluate(node => getComputedStyle(node).fontFamily);
    const originalFont = await editorFont();
    const originalCodeFont = await fontOf('.ProseMirror p code');
    assert.equal(await page.evaluate(() => {
      const view = [...menus.values()].findLast(menu => menu.options?.text === 'View');
      return view.options.items.find(item => item.id === 'view-font-settings').accelerator;
    }), undefined);
    await page.locator('.ProseMirror').press('Control+Shift+f');
    assert.equal(await fonts.count(), 0);
    await openFonts();
    await textSwitch.waitFor();
    const textBounds = await textSwitch.boundingBox();
    const codeBounds = await codeSwitch.boundingBox();
    const switchGap = codeBounds.y - textBounds.y - textBounds.height;
    assert(textBounds.x === codeBounds.x && switchGap > 0 && switchGap <= 8, 'font switches stack with a small gap');
    await page.getByLabel('Search fonts').fill('courier');
    await family.selectOption('Courier New');
    const bottomGap = await fonts.evaluate(dialog =>
      dialog.getBoundingClientRect().bottom - dialog.querySelector('.font-actions button:last-child').getBoundingClientRect().bottom);
    assert(bottomGap >= 0 && bottomGap <= 24, 'dialog ends just below its buttons');
    const sample = fonts.locator('.font-preview p');
    assert.equal(await sample.innerText(), 'This is the first paragraph. This is how bold text looks, and this is how italic text looks.');
    assert.match(await sample.locator('strong').evaluate(node => getComputedStyle(node).fontFamily), /Courier New/);
    assert.equal(await sample.locator('em').evaluate(node => getComputedStyle(node).fontStyle), 'italic');
    assert.equal(await editorFont(), originalFont);
    await codeSwitch.click();
    await codeFamily.selectOption('Courier New');
    assert.equal(await fontOf('.ProseMirror p code'), originalCodeFont);
    await page.setViewportSize({ width: 640, height: 360 });
    assert(await fonts.evaluate(dialog => {
      const body = dialog.querySelector('.font-dialog-body');
      const ok = dialog.querySelector('.font-actions button:last-child').getBoundingClientRect();
      return body.scrollHeight > body.clientHeight && ok.top >= 0 && ok.bottom <= innerHeight;
    }), 'short windows scroll the content and keep the buttons in view');
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.keyboard.press('Escape');
    await family.waitFor({ state: 'detached' });
    await openFonts();
    assert.equal(await family.inputValue(), '');
    await family.selectOption('Arial');
    await codeSwitch.click();
    assert.equal(await codeFamily.inputValue(), '');
    await codeFamily.selectOption('Courier New');
    assert.match(await fontOf('.font-preview p code'), /Courier New/);
    assert.match(await fontOf('.font-preview pre code'), /Courier New/);
    await textSwitch.click();
    assert.equal(await family.inputValue(), 'Arial');
    const saveFonts = fonts.getByRole('button', { name: 'OK', exact: true });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'mdedit.appState.v1') {
          Storage.prototype.setItem = original;
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await saveFonts.click();
    assert.match(await fonts.getByRole('alert').innerText(), /Could not save the font settings/);
    assert.equal(await editorFont(), originalFont);
    assert.equal(await fontOf('.ProseMirror p code'), originalCodeFont);
    assert.equal(await family.inputValue(), 'Arial');
    await codeSwitch.click();
    assert.equal(await codeFamily.inputValue(), 'Courier New');
    await saveFonts.click();
    await fonts.waitFor({ state: 'detached' });
    assert.match(await editorFont(), /Arial/);
    assert.match(await fontOf('.ProseMirror p code'), /Courier New/);
    assert.match(await fontOf('.ProseMirror pre code'), /Courier New/);
    assert.equal(await page.locator('.ProseMirror').innerHTML(), before);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mdedit.appState.v1')).settings.editorFontFamily), 'Arial');
    await page.evaluate(() => activateHelpMenu('Help'));
    const modal = page.locator('dialog.help-dialog');
    await modal.waitFor();
    await page.waitForFunction(() => [...menus.values()].findLast(menu => menu.options?.text === 'File')?.options.enabled === false);
    await modal.getByRole('button', { name: 'English', exact: true }).click();
    let guide = page.frameLocator('iframe.help-content');
    await guide.getByRole('heading', { name: 'mdedit user guide', exact: true }).waitFor();
    assert.equal(await guide.locator('section').count(), 10);
    assert(await guide.locator('html').evaluate(node => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 });
      node.dispatchEvent(event); return event.defaultPrevented;
    }), 'help does not trigger browser-level Ctrl+wheel zoom');
    assert.equal(await guide.locator('script, img, link[rel=stylesheet]').count(), 0);
    assert.equal(await modal.locator('iframe').getAttribute('sandbox'), 'allow-same-origin');
    await modal.getByRole('button', { name: 'Čeština', exact: true }).click();
    guide = page.frameLocator('iframe.help-content');
    await guide.getByRole('heading', { name: 'Uživatelská příručka mdedit', exact: true }).waitFor();
    assert.equal(await guide.locator('html').getAttribute('lang'), 'cs');
    for (const link of await guide.locator('nav a').all()) {
      const hash = await link.getAttribute('href');
      assert.equal(await guide.locator(hash).count(), 1, hash);
    }
    await guide.getByRole('heading', { name: 'Uživatelská příručka mdedit', exact: true }).click();
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.ProseMirror').innerHTML(), before);
    assert.equal(await page.locator('.status-dirty').innerText(), 'Modified');
    await page.keyboard.press('F1');
    await modal.waitFor();
    await page.frameLocator('iframe.help-content').getByRole('heading', { name: 'Uživatelská příručka mdedit', exact: true }).waitFor();
    for (const width of [320, 640, 1280]) {
      await page.setViewportSize({ width, height: 700 });
      assert(await modal.evaluate(node => node.scrollWidth <= node.clientWidth));
      assert(await page.frameLocator('iframe.help-content').locator('html').evaluate(node => node.scrollWidth <= innerWidth), 'guide overflow at '+width);
    }
    if (process.env.HELP_SCREENSHOT) await page.screenshot({ path: process.env.HELP_SCREENSHOT });
    await modal.getByRole('button', { name: 'Zavřít', exact: true }).click();
    await page.evaluate(() => activateHelpMenu('About'));
    await modal.getByRole('heading', { name: 'O aplikaci mdedit', exact: true }).waitFor();
    const { readFile } = await import('node:fs/promises');
    const version = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();
    assert.equal(await modal.locator('.about-name span').innerText(), 'v'+version);
    await modal.getByRole('button', { name: 'English', exact: true }).click();
    await modal.getByRole('heading', { name: 'About mdedit', exact: true }).waitFor();
    assert((await modal.locator('.about-content').innerText()).includes('GNU GPL v3'));
    await modal.getByText('Full license text', { exact: true }).click();
    assert((await modal.locator('pre').innerText()).includes('GNU GENERAL PUBLIC LICENSE'));
    await page.keyboard.press('Control+n');
    assert.equal(await page.locator('.ProseMirror').innerHTML(), before);
    await page.keyboard.press('Escape');
    assert.equal(await modal.count(), 0);
    assert.equal(await page.locator('.status-dirty').innerText(), 'Modified');
    await page.keyboard.press('F1');
    await modal.waitFor();
    await page.evaluate(() => requestWindowClose());
    await modal.waitFor({ state: 'hidden' });
    const confirm = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
    await confirm.waitFor();
    await confirm.getByRole('button', { name: 'Keep Editing', exact: true }).click();
    assert.equal(await page.evaluate(() => destroyed), 0);
    assert.equal(await page.locator('.ProseMirror').innerHTML(), before);
    await page.waitForFunction(() => [...menus.values()].findLast(menu => menu.options?.text === 'File')?.options.enabled === true);
    await page.evaluate(() => {
      const key = 'mdedit.appState.v1';
      const state = JSON.parse(localStorage.getItem(key));
      state.settings.editorFontFamily = 'arial';
      state.settings.codeFontFamily = 'courier NEW';
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();
    await page.waitForFunction(() => [...menus.values()].some(menu => menu.options?.text === 'View'));
    await openFonts();
    await family.locator('option[value="Arial"]').waitFor({ state: 'attached' });
    assert.equal(await family.inputValue(), 'Arial');
    assert.equal(await family.locator('option:checked').innerText(), 'Arial');
    await codeSwitch.click();
    assert.equal(await codeFamily.inputValue(), 'Courier New');
    assert.equal(await codeFamily.locator('option:checked').innerText(), 'Courier New');
    await codeFamily.selectOption('');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => {
      const { editorFontFamily, codeFontFamily } = JSON.parse(localStorage.getItem('mdedit.appState.v1')).settings;
      return [editorFontFamily, codeFontFamily];
    }), ['Arial', null]);
    await openFonts();
    await family.selectOption('');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mdedit.appState.v1')).settings.editorFontFamily), null);
    const preview = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await preview.goto(page.url());
    await preview.locator('.empty-state-panel').waitFor();
    const previewFontButton = preview.getByRole('button', { name: 'Font Settings', exact: true });
    await previewFontButton.click();
    await preview.getByLabel('Installed font family name').fill('Georgia');
    await preview.getByRole('button', { name: 'OK', exact: true }).click();
    assert.equal(await preview.evaluate(() => JSON.parse(localStorage.getItem('mdedit.appState.v1')).settings.editorFontFamily), 'Georgia');
    await previewFontButton.click();
    if (await preview.evaluate(() => typeof window.queryLocalFonts === 'function')) {
      const cdp = await preview.context().newCDPSession(preview);
      await cdp.send('Browser.setPermission', {
        permission: { name: 'local-fonts' }, setting: 'granted', origin: new URL(preview.url()).origin,
        browserContextId: (await cdp.send('Target.getTargetInfo')).targetInfo.browserContextId,
      });
      await preview.getByRole('button', { name: 'Load installed fonts' }).click();
      await preview.waitForFunction(() => document.querySelectorAll('#font-family option').length > 2);
      t.diagnostic('Chrome returned installed font families without a Tauri bridge.');
    }
    await preview.close();
    assert.deepEqual(externalRequests, [], 'Help and About never request external resources');
  } finally { await browser?.close(); await server.close(); }
});
