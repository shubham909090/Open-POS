// Run only after the installed Hub has stopped; inherit the Windows smoke environment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { _electron } = require('playwright');

const [executablePath, smokeRoot, onlineTargetVersion] = process.argv.slice(2);
const report = {
  platform: process.platform,
  limits: ['Empty, unlicensed smoke database; no dense order workflows or business mutations.',
    'Application zoom only; Windows system DPI, physical touch and printer output are not tested.'],
  captures: [], keyboardChecks: [], errors: []
};
let app;
let page;
let output;
let exitedForUpdate = false;

async function clickOnlineUpdate() {
  await page.getByRole('navigation', { name: 'Hub sections', exact: true }).getByRole('button', { name: 'Administration', exact: true }).click();
  await page.getByRole('navigation', { name: 'Administration sections', exact: true }).getByRole('button', { name: 'App updates', exact: true }).click();
  const button = page.getByRole('button', { name: 'Update app', exact: true });
  await button.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-update-trigger]')?.disabled === false);
  await capture('online-update-before-click');
  const oldPid = app.process().pid;
  const processExit = once(app.process(), 'exit', { signal: AbortSignal.timeout(600000) });
  const closed = app.waitForEvent('close', { timeout: 600000 });
  // Observe the expected process exit even if an earlier click assertion fails.
  closed.catch(() => {});
  processExit.catch(() => {});
  const route = '/system/update/online/install';
  await Promise.all([
    page.waitForRequest(request => new URL(request.url()).pathname === route && request.method() === 'POST'),
    button.click()
  ]);
  report.onlineButton = { requestedTarget: onlineTargetVersion, route, oldPid, oldProcessExited: false };
  await closed;
  const [code, signal] = await processExit;
  exitedForUpdate = true;
  assert.equal(code, 0, 'Fixture process did not quit cleanly for the online update');
  report.onlineButton = { requestedTarget: onlineTargetVersion, route, oldPid, oldProcessExited: true, exit: { code, signal } };
}

async function capture(name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = await page.evaluate(() => {
    const visible = element => {
      const box = element.getBoundingClientRect();
      return element.checkVisibility() && box.width > 0 && box.height > 0;
    };
    const describe = element => {
      const box = element.getBoundingClientRect();
      return { tag: element.tagName, label: element.getAttribute('aria-label') || element.innerText || element.getAttribute('placeholder') || '',
        disabled: element.matches(':disabled'), x: box.x, y: box.y, width: box.width, height: box.height,
        inViewport: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1 };
    };
    return { title: document.querySelector('.workspace-page-title')?.textContent,
      heading: document.querySelector('.settings-page-heading h2')?.textContent,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      document: { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
        height: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight },
      visibleActions: [...document.querySelectorAll('button, input:not([type="hidden"]), select, textarea, a[href]')].filter(visible).map(describe),
      focus: document.activeElement ? describe(document.activeElement) : null,
      notices: [...document.querySelectorAll('[role="alert"], [role="status"]')].filter(visible).map(element => element.innerText) };
  });
  state.name = name;
  state.nativeWindow = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { contentSize: window.getContentSize(), zoomFactor: window.webContents.getZoomFactor() };
  });
  try {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('DOM.enable');
      await session.send('CSS.enable');
      const { root } = await session.send('DOM.getDocument');
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.workspace-page-title' });
      state.renderedFonts = (await session.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
    } finally { await session.detach(); }
  } catch (error) { state.fontInspectionError = error.message; }
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  report.captures.push(state);
  assert.deepEqual(state.nativeWindow.contentSize, [1366, 768], `${name}: native content size changed`);
  assert.ok(state.document.scrollWidth <= state.document.width + 1, `${name}: horizontal page overflow`);
}

async function testCommandDialog(prefix) {
  const opener = page.getByTitle('Go to a page (Ctrl+K)', { exact: true });
  await opener.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Go to a page', exact: true });
  await dialog.waitFor();
  await page.getByRole('combobox', { name: 'Search pages' }).waitFor();
  await page.keyboard.press('Tab');
  assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), 'Command dialog lost keyboard focus');
  await capture(`${prefix}-command-dialog`);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await opener.evaluate(element => element === document.activeElement), 'Escape did not restore command opener focus');
  report.keyboardChecks.push({ zoom: prefix, commandShortcut: true, tabStayedInDialog: true, escapeClosedDialog: true, openerFocusRestored: true });
}

async function main() {
  assert.equal(process.platform, 'win32', 'This audit must run against the installed Windows application');
  assert.ok(executablePath && smokeRoot, 'Usage: node test-windows-ui.cjs <installed-exe> <smoke-root> [online-target-version]');
  if (onlineTargetVersion) assert.match(onlineTargetVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(fs.existsSync(executablePath), 'Installed executable is missing');
  assert.equal(process.env.HUB_HOST, '127.0.0.1');
  assert.equal(process.env.HUB_PORT, '43737');
  assert.ok(process.env.HUB_ADMIN_TOKEN, 'Inherit the isolated smoke authentication configuration');
  const root = path.resolve(smokeRoot).toLowerCase() + path.sep;
  for (const key of ['HUB_DATABASE_PATH', 'HUB_CONFIG_FILE', 'HUB_BACKUP_DIR', 'HUB_UPDATE_DIR']) {
    assert.ok(process.env[key] && path.resolve(process.env[key]).toLowerCase().startsWith(root), `${key} must stay inside the smoke root`);
  }
  output = path.resolve(smokeRoot);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({ executablePath: path.resolve(executablePath), env, timeout: 60000 });
  page = await app.firstWindow({ timeout: 60000 });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.getByRole('navigation', { name: 'Hub sections', exact: true }).waitFor();
  await page.getByRole('status', { name: 'Loading workspace', exact: true }).waitFor({ state: 'hidden' });
  report.nativeBridge = await page.evaluate(() => ({ chooseUpdatePackage: typeof window.gauravPos?.chooseUpdatePackage,
    repairFocus: typeof window.gauravPos?.repairFocus }));
  assert.equal(report.nativeBridge.chooseUpdatePackage, 'function', 'Packaged preload update bridge is missing');
  assert.equal(report.nativeBridge.repairFocus, 'function', 'Packaged preload focus bridge is missing');
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(1366, 768);
    window.webContents.setZoomFactor(1);
  });
  const lock = page.getByRole('button', { name: 'Lock hub', exact: true });
  if (await lock.isVisible()) await lock.click();
  const unlock = page.getByRole('button', { name: 'Unlock setup', exact: true });
  await unlock.click();
  const unlockDialog = page.getByRole('dialog', { name: 'Unlock setup', exact: true });
  await unlockDialog.getByLabel('Manager PIN').fill('4321');
  await capture('unlock-dialog');
  await unlockDialog.getByRole('button', { name: 'Unlock setup', exact: true }).click();
  await unlockDialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Lock hub', exact: true }).waitFor();
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  if (await dismiss.count()) await dismiss.click();
  const navigation = page.getByRole('navigation', { name: 'Hub sections', exact: true });
  const sections = await navigation.getByRole('button').allTextContents();
  for (const zoom of [1, 1.25]) {
    await app.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor), zoom);
    const prefix = `zoom-${Math.round(zoom * 100)}`;
    for (const label of sections.map(value => value.trim())) {
      await navigation.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('heading', { level: 1, name: label, exact: true }).waitFor();
      const slug = label.toLowerCase();
      await capture(`${prefix}-${slug}`);
      if (!['Settings', 'Administration'].includes(label)) continue;
      const subsections = page.getByRole('navigation', { name: `${label} sections`, exact: true });
      await subsections.waitFor();
      const names = await subsections.getByRole('button').allTextContents();
      for (const name of names.map(value => value.trim())) {
        const button = subsections.getByRole('button', { name, exact: true });
        await button.click();
        await page.locator('.settings-page-heading h2').filter({ hasText: name }).waitFor();
        assert.equal(await button.getAttribute('aria-current'), 'page', `${name}: navigation was not selected`);
        await button.focus();
        await page.keyboard.press('Tab');
        assert.ok(await page.evaluate(() => document.activeElement?.matches('button, input, select, textarea, a[href], [tabindex]')), `${name}: Tab did not reach a control`);
        await capture(`${prefix}-${slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
      }
    }
    await testCommandDialog(prefix);
  }
  assert.equal(report.errors.length, 0, 'Renderer emitted uncaught JavaScript errors; see audit JSON');
  if (onlineTargetVersion) await clickOnlineUpdate();
  assert.equal(report.errors.length, 0, 'Renderer emitted uncaught JavaScript errors during the update');
  report.passed = true;
}

main().catch(async error => {
  report.passed = false;
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
  if (page && output) await page.screenshot({ path: path.join(output, 'ui-failure.png'), fullPage: true }).catch(() => {});
}).finally(async () => {
  if (app && !exitedForUpdate) {
    try { await app.close(); }
    catch (error) { report.passed = false; report.closeError = error.message; process.exitCode = 1; }
  }
  if (output) fs.writeFileSync(path.join(output, 'windows-ui-audit.json'), JSON.stringify(report, null, 2) + '\n');
});
