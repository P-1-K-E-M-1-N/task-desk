// Checks autosave and the look settings (themes, frames, light/dark, text size) in TEST mode,
// and saves screenshots of each frame material to test/shots/.
// Run: node test/look.js
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { useTestSettings, launchOpts, DATA, HOTKEY } = require('./env');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const SETTINGS = path.join(DATA, 'settings.json');
const STATE = path.join(DATA, 'state.test.json');
const results = [];
const ok = (name, cond, extra = '') => { results.push(cond); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const readState = () => JSON.parse(fs.readFileSync(STATE, 'utf8'));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  useTestSettings({ look: { theme: 'clay', material: 'paper', appearance: 'light', size: 'm' } });
  try { fs.unlinkSync(STATE); } catch {} // test-mode memory only; start clean

  const launch = async () => {
    const app = await _electron.launch(launchOpts());
    await app.evaluate(({ shell }) => { shell.openExternal = async () => {}; shell.openPath = async () => ''; });
    const box = await app.firstWindow();
    box.on('pageerror', (e) => ok('no box errors', false, e.message));
    await box.waitForSelector('.card', { timeout: 20000 });
    return { app, box };
  };
  const openTask = async (app, box, re) => {
    await box.locator('.chip').first().click();
    const [win] = await Promise.all([app.waitForEvent('window'), box.locator('.card', { hasText: re }).first().click()]);
    win.on('pageerror', (e) => ok('no task errors', false, e.message));
    await win.waitForSelector('.step', { timeout: 15000 });
    return win;
  };

  let { app, box } = await launch();
  let win = await openTask(app, box, /Detroit Open Data/);
  const tid = await win.evaluate(() => new URLSearchParams(location.search).get('id'));

  // ---- autosave ----
  ok('title bar says all changes saved', /All changes saved/.test(await win.locator('#savestate').innerText()));
  await win.locator('#notes').fill('');
  await win.locator('#notes').pressSequentially('Autosave check one', { delay: 5 });
  ok('shows Saving… while typing', /Saving/.test(await win.locator('#savestate').innerText()));
  await win.waitForTimeout(900);
  ok('notes show Saved after a pause', /Saved/.test(await win.locator('.notes-head .saved').innerText()));
  ok('notes are on disk', readState().tasks[tid].notes === 'Autosave check one');
  const paste = win.locator('.sact textarea').first();
  if (await paste.count()) {
    await paste.fill('Pasted reply for autosave');
    await win.waitForTimeout(900);
    ok('paste box shows Saved', /Saved/.test(await win.locator('.sact .field-head .saved').first().innerText()));
    ok('paste box text on disk', Object.values(readState().tasks[tid].pastes).some((p) => p.value === 'Pasted reply for autosave'));
  }
  // Close the window immediately after typing: the text must still be saved.
  await win.locator('#notes').fill('Typed then closed right away');
  await win.evaluate(() => desk.close());
  await box.waitForTimeout(800);
  ok('typing then closing at once still saves', readState().tasks[tid].notes === 'Typed then closed right away');
  win = await openTask(app, box, /Detroit Open Data/);
  ok('reopened window shows the saved notes', (await win.locator('#notes').inputValue()) === 'Typed then closed right away');
  ok('reopened notes are marked Saved', /Saved/.test(await win.locator('.notes-head .saved').innerText()));

  // ---- look panel ----
  await win.locator('#wlook').click();
  ok('look panel opens', await win.locator('.lookpanel').isVisible());
  ok('6 themes and 7 frames offered', (await win.locator('.lookpanel .swatch').count()) === 6 && (await win.locator('.lookpanel .mat').count()) === 7);
  await win.locator('.lookpanel .grid button', { hasText: 'Ocean' }).click();
  ok('panel stays open while choosing', await win.locator('.lookpanel').isVisible());
  await win.waitForTimeout(300);
  ok('theme applies to the task window', (await win.evaluate(() => document.documentElement.dataset.theme)) === 'ocean');
  ok('theme applies to the box too', (await box.evaluate(() => document.documentElement.dataset.theme)) === 'ocean');
  ok('theme is saved in settings', JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).look.theme === 'ocean');
  await win.screenshot({ path: path.join(SHOTS, 'look-panel.png') });

  const combos = [
    ['clay', 'paper', 'light'], ['ocean', 'glass', 'light'], ['sage', 'linen', 'light'], ['clay', 'wood', 'light'],
    ['honey', 'leather', 'dark'], ['graphite', 'metal', 'light'], ['plum', 'neon', 'dark'], ['clay', 'wood', 'dark'],
  ];
  await win.mouse.click(5, 300);
  for (const [theme, material, appearance] of combos) {
    await win.evaluate((p) => desk.setLook(p), { theme, material, appearance });
    await win.waitForTimeout(500);
    await win.screenshot({ path: path.join(SHOTS, `look-${material}-${theme}-${appearance}.png`) });
    await box.screenshot({ path: path.join(SHOTS, `look-box-${material}-${theme}-${appearance}.png`) });
  }
  ok('dark class follows the Dark setting', await win.evaluate(() => document.documentElement.classList.contains('dark')));
  await win.evaluate(() => desk.setLook({ size: 'l' }));
  await win.waitForTimeout(300);
  ok('text size changes zoom', Math.abs((await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getZoomFactor())[0])) - 1.1) < 0.01);
  await win.evaluate(() => desk.setLook({ size: 'm' }));

  // Looks survive a restart.
  await app.close();
  ({ app, box } = await launch());
  ok('look remembered after restart', (await box.evaluate(() => document.documentElement.dataset.material)) === 'wood');
  await box.locator('#look').click();
  ok('box has its own look button', await box.locator('.lookpanel').isVisible());
  await box.screenshot({ path: path.join(SHOTS, 'look-box-panel.png') });
  await app.close();

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
