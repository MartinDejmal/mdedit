import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";

test("Help and About are bundled, bilingual, accessible and preserve the active document", async () => {
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
      window.events = [];
      window.destroyed = 0;
      window.activateHelpMenu = label => {
        const help = [...menus.values()].findLast(menu => menu.kind === 'Submenu' && menu.options.text === 'Help');
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
    await page.locator('.ProseMirror').fill('Keep this unsaved document');
    const before = await page.locator('.ProseMirror').innerHTML();
    await page.waitForFunction(() => document.querySelector('.status-dirty')?.textContent === 'Modified');
    await page.waitForFunction(() => [...menus.values()].some(menu => menu.kind === 'Submenu' && menu.options.text === 'Help'));
    assert.deepEqual(await page.evaluate(() => {
      const help = [...menus.values()].findLast(menu => menu.kind === 'Submenu' && menu.options.text === 'Help');
      return help.options.items.map(item => item.text);
    }), ['Help', 'About']);
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
    assert.deepEqual(externalRequests, [], 'Help and About never request external resources');
  } finally { await browser?.close(); await server.close(); }
});
