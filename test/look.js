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
  ok('6 themes and 14 frames offered', (await win.locator('.lookpanel .swatch').count()) === 6 && (await win.locator('.lookpanel .mat').count()) === 14);
  await win.locator('.lookpanel .grid button', { hasText: 'Ocean' }).click();
  ok('panel stays open while choosing', await win.locator('.lookpanel').isVisible());
  await win.waitForTimeout(300);
  ok('theme applies to the task window', (await win.evaluate(() => document.documentElement.dataset.theme)) === 'ocean');
  ok('theme applies to the box too', (await box.evaluate(() => document.documentElement.dataset.theme)) === 'ocean');
  ok('theme is saved in settings', JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).look.theme === 'ocean');
  await win.screenshot({ path: path.join(SHOTS, 'look-panel.png') });

  const combos = [
    ['clay', 'paper', 'light'], ['ocean', 'glass', 'light'], ['sage', 'linen', 'light'], ['clay', 'wood', 'light'],
    ['honey', 'leather', 'dark'], ['graphite', 'metal', 'light'], ['plum', 'neon', 'dark'],
    ['ocean', 'aurora', 'dark'], ['clay', 'lava', 'dark'], ['plum', 'stars', 'dark'], ['clay', 'rainbow', 'light'], ['clay', 'wood', 'dark'],
  ];
  await win.mouse.click(5, 300);
  for (const [theme, material, appearance] of combos) {
    await win.evaluate((p) => desk.setLook(p), { theme, material, appearance });
    await win.waitForTimeout(500);
    await win.screenshot({ path: path.join(SHOTS, `look-${material}-${theme}-${appearance}.png`) });
    await box.screenshot({ path: path.join(SHOTS, `look-box-${material}-${theme}-${appearance}.png`) });
  }
  ok('dark class follows the Dark setting', await win.evaluate(() => document.documentElement.classList.contains('dark')));

  // Moving frames move, and "Keep still" stops them.
  const anim = (page, sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).animationName, sel);
  ok('aurora frame moves', (await win.evaluate(() => desk.setLook({ material: 'aurora' })).then(() => win.waitForTimeout(300)).then(() => anim(box, '.panel'))) === 'frameFlow');
  await win.evaluate(() => desk.setLook({ material: 'bubbler', theme: 'ocean', appearance: 'light' }));
  await win.waitForTimeout(1500);
  const frames = (page) => page.evaluate(() => (window.liveFrame ? window.liveFrame.frames : -1));
  const f1 = await frames(box);
  await box.waitForTimeout(600);
  ok('bubbler is drawn live in the box', (await frames(box)) > f1 && await box.locator('canvas.liveframe').count() === 1, `${f1}`);
  ok('bubbler is drawn live in the task window', (await frames(win)) > 0 && await win.locator('canvas.liveframe').count() === 1);
  ok('bubbler has drops falling', (await box.evaluate(() => window.liveFrame.drops)) > 0);
  await box.screenshot({ path: path.join(SHOTS, 'look-box-bubbler-light.png') });
  await win.screenshot({ path: path.join(SHOTS, 'look-bubbler-light.png') });
  await win.evaluate(() => desk.setLook({ appearance: 'dark' }));
  await win.waitForTimeout(1500);
  await box.screenshot({ path: path.join(SHOTS, 'look-box-bubbler-dark.png') });
  await win.evaluate(() => desk.setLook({ motion: 'off' }));
  await win.waitForTimeout(400);
  const s1 = await frames(box);
  await box.waitForTimeout(500);
  ok('"Keep still" stops the bubbler', (await frames(box)) === s1);
  await win.evaluate(() => desk.setLook({ material: 'aurora' }));
  await win.waitForTimeout(300);
  ok('"Keep still" stops CSS frames too', (await anim(box, '.panel')) === 'none');
  await win.evaluate(() => desk.setLook({ motion: 'on' }));
  await win.evaluate(() => desk.setLook({ material: 'wood' }));
  await win.waitForTimeout(300);
  ok('bubbler canvas goes away for other frames', await box.locator('canvas.liveframe').count() === 0);
  await win.evaluate(() => desk.setLook({ material: 'lavalamp', appearance: 'dark' }));
  await win.waitForTimeout(1200);
  const l1 = await frames(box);
  await box.waitForTimeout(500);
  ok('lava lamp is drawn live', (await frames(box)) > l1 && await box.locator('canvas.liveframe').count() === 1);
  await box.screenshot({ path: path.join(SHOTS, 'look-box-lavalamp-dark.png') });
  await win.screenshot({ path: path.join(SHOTS, 'look-lavalamp-dark.png') });

  // Your own colors: pink task cards, an accent, a background tint, round corners.
  await win.evaluate(() => desk.setLook({ material: 'wood', appearance: 'light', card: '#ff5fa8', cardMix: 45, accent: '#8f74ff', bg: '#ffc94d', bgMix: 20, round: 'extra' }));
  await win.waitForTimeout(400);
  const cardBg = await box.evaluate(() => getComputedStyle(document.querySelector('.card')).backgroundColor);
  ok('task cards turn pink', /color\(srgb|rgb/.test(cardBg) && cardBg !== 'rgb(255, 255, 255)', cardBg);
  ok('accent color is used for buttons', (await win.evaluate(() => getComputedStyle(document.body).getPropertyValue('--clay').trim())) === '#8f74ff');
  ok('corners get rounder', (await box.evaluate(() => getComputedStyle(document.querySelector('.card')).borderTopLeftRadius)) === '26px');
  await box.screenshot({ path: path.join(SHOTS, 'look-box-pink-cards.png') });
  await win.screenshot({ path: path.join(SHOTS, 'look-pink-cards.png') });
  const saved = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).look;
  ok('your colors are saved', saved.card === '#ff5fa8' && saved.accent === '#8f74ff' && saved.round === 'extra');
  await box.locator('#look').click();
  ok('look panel has your colors', await box.locator('.lookpanel .colorrow').count() === 3 && await box.locator('.lookpanel input[type=range]').count() === 2);
  await box.screenshot({ path: path.join(SHOTS, 'look-box-panel-colors.png') });
  await box.locator('.lookpanel .colorrow').nth(1).locator('.cnone').click();
  await box.waitForTimeout(300);
  ok('"Theme" puts the cards back', (await box.evaluate(() => document.body.style.getPropertyValue('--surface'))) === '');
  await box.mouse.click(5, 5);
  await win.evaluate(() => desk.setLook({ accent: '', bg: '', round: '' }));

  // A picture frame (the picker copies the file into data/look/; here we put one there).
  fs.mkdirSync(path.join(DATA, 'look'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'assets', 'icon.png'), path.join(DATA, 'look', 'frame-test.png'));
  await win.evaluate(() => desk.setLook({ material: 'picture', picture: 'frame-test.png' }));
  await win.waitForTimeout(400);
  ok('picture frame shows the picture', /frame-test\.png/.test(await box.evaluate(() => getComputedStyle(document.querySelector('.panel')).backgroundImage)));
  await box.screenshot({ path: path.join(SHOTS, 'look-box-picture.png') });

  // Size lock: rest the mouse in the corner for 3 seconds, unlock, drag the grip.
  await win.evaluate(() => desk.setLook({ material: 'wood', theme: 'clay', appearance: 'dark' }));
  await box.bringToFront();
  const boxSize = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('box.html')).getBounds());
  const before = await boxSize();
  ok('box starts locked', await box.evaluate(() => !document.body.classList.contains('unlocked')));
  await box.hover('#corner');
  await box.waitForTimeout(1000);
  ok('lock stays hidden for the first seconds', (await box.evaluate(() => getComputedStyle(document.querySelector('#lockbtn')).pointerEvents)) === 'none');
  await box.waitForTimeout(2400);
  ok('lock appears after 3 seconds', await box.evaluate(() => document.querySelector('#corner').classList.contains('show')));
  await box.locator('#lockbtn').click();
  await box.waitForTimeout(300);
  ok('click unlocks the size', await box.evaluate(() => document.body.classList.contains('unlocked')));
  ok('unlocked window can be resized', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('box.html')).isResizable()));
  await box.screenshot({ path: path.join(SHOTS, 'look-box-unlocked.png') });
  // Drag the grip 200px right and 60px down (the main process reads the real mouse position).
  await box.evaluate(() => desk.resizeBox('start'));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('box.html'));
    const b = w.getBounds();
    w.setBounds({ ...b, width: b.width + 200, height: b.height + 60 });
    w.emit('resized');
  });
  await box.waitForTimeout(300);
  const after = await boxSize();
  ok('box got wider', after.width >= before.width + 150, `${before.width} -> ${after.width}`);
  const machine = () => JSON.parse(fs.readFileSync(path.join(DATA, 'machine.json'), 'utf8'));
  ok('new width is remembered on this computer', machine().boxBounds.width === after.width && machine().boxLocked === false);
  await box.locator('#lockbtn').click();
  await box.waitForTimeout(300);
  ok('click locks it again', await box.evaluate(() => !document.body.classList.contains('unlocked')) && machine().boxLocked === true);
  ok('locked window can\'t be resized', !(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('box.html')).isResizable())));
  // Over remote desktop: three quick right-clicks in the corner show the lock without hovering.
  await box.mouse.move(150, 150);
  await box.waitForTimeout(1800);
  ok('lock hides again after the mouse leaves', await box.evaluate(() => !document.querySelector('#corner').classList.contains('show')));
  for (let i = 0; i < 3; i++) await box.locator('#corner').click({ button: 'right', position: { x: 10, y: 20 } });
  await box.waitForTimeout(250);
  ok('three right-clicks show the lock', await box.evaluate(() => document.querySelector('#corner').classList.contains('show')));
  await box.mouse.move(150, 150);
  await box.waitForTimeout(2000);
  ok('lock stays up a while after right-clicks', await box.evaluate(() => document.querySelector('#corner').classList.contains('show')));
  await win.evaluate(() => desk.setLook({ size: 'l' }));
  await win.waitForTimeout(300);
  ok('text size changes zoom', Math.abs((await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getZoomFactor())[0])) - 1.1) < 0.01);
  await win.evaluate(() => desk.setLook({ size: 'm' }));

  // Looks survive a restart.
  await app.close();
  ({ app, box } = await launch());
  ok('look remembered after restart', (await box.evaluate(() => document.documentElement.dataset.material)) === 'wood');
  const reopened = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('box.html')).getBounds());
  ok('stretched width kept after restart', reopened.width === JSON.parse(fs.readFileSync(path.join(DATA, 'machine.json'), 'utf8')).boxBounds.width && reopened.width > 340, String(reopened.width));
  await box.locator('#look').click();
  ok('box has its own look button', await box.locator('.lookpanel').isVisible());
  await box.screenshot({ path: path.join(SHOTS, 'look-box-panel.png') });
  await app.close();

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
