// Checks scrolling: Claude Code is started in its classic view (so the chat
// panel scrolls its own history), a touchpad scrolls the chat 1:1, a mouse wheel
// and an app that reads the mouse keep xterm's own handling, the moving frames
// hold still while you scroll, and the ⋯ menu's choice of Claude Code's
// full-screen view reaches new chats.
// Uses a pretend claude (test/fake-claude.js), so it's quick and needs no login.
// Run: node test/scroll.js
/* global ID, term */ // page names, used inside evaluate()
const { _electron } = require('playwright-core');
const path = require('path');
const { useTestSettings, launchOpts, pressStart, ROOT } = require('./env');

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(!!cond);
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const FAKE = `${process.execPath}|${path.join(__dirname, 'fake-claude.js')}`;
const termText = (win) => win.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

// Wheel steps sent to the middle of the chat panel. A touchpad's are small
// pixel steps; a mouse notch is 100 px with wheelDeltaY 120. Returns how many
// lines the chat moved and how many steps got past the touchpad handler.
const wheel = (win, n, dy, notch) =>
  win.evaluate(
    async ([n, dy, notch]) => {
      const t = document.querySelector('#term');
      const b = t.getBoundingClientRect();
      const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      let passed = 0;
      const count = () => passed++;
      el.addEventListener('wheel', count);
      const y0 = term.buffer.active.viewportY;
      for (let i = 0; i < n; i++) {
        const ev = new WheelEvent('wheel', {
          deltaY: -dy,
          deltaMode: 0,
          bubbles: true,
          cancelable: true,
          clientX: b.x + 50,
          clientY: b.y + 50,
        });
        Object.defineProperty(ev, 'wheelDeltaY', { value: notch ? 120 : Math.round(dy * 1.2) });
        el.dispatchEvent(ev);
        await new Promise((r) => setTimeout(r, 8));
      }
      await new Promise((r) => setTimeout(r, 300));
      el.removeEventListener('wheel', count);
      const lineH = document.querySelector('.xterm-screen').getBoundingClientRect().height / term.rows;
      return { lines: y0 - term.buffer.active.viewportY, passed, want: (n * dy) / lineH };
    },
    [n, dy, notch]
  );

(async () => {
  useTestSettings({
    look: { theme: 'ocean', material: 'aurora', appearance: 'dark', size: 'm', motion: 'on', picture: '', round: 'extra' },
  });
  const app = await _electron.launch(launchOpts({ TASKDESK_FAKE_CLAUDE: FAKE }));
  const box = await app.firstWindow();
  box.on('pageerror', (e) => ok('no box page errors', false, e.message));
  await box.waitForSelector('.card', { timeout: 20000 });
  await box.locator('.chip').first().click();

  // ---- the box: frames hold still while you scroll ----
  const during = await box.evaluate(() => {
    document.querySelector('.list').dispatchEvent(new WheelEvent('wheel', { deltaY: 20, bubbles: true }));
    return {
      scrolling: document.documentElement.classList.contains('scrolling'),
      play: getComputedStyle(document.querySelector('.panel')).animationPlayState,
    };
  });
  ok('scrolling the box holds the moving frame still', during.scrolling && during.play === 'paused', JSON.stringify(during));
  await box.waitForTimeout(600);
  const after = await box.evaluate(() => getComputedStyle(document.querySelector('.panel')).animationPlayState);
  ok('and it moves again after', after === 'running', after);

  // ---- the chat: classic view, touchpad 1:1 ----
  const [win] = await Promise.all([app.waitForEvent('window'), box.locator('.card').nth(2).click()]);
  win.on('pageerror', (e) => ok('no task page errors', false, e.message));
  await win.waitForSelector('.step', { timeout: 15000 });
  await pressStart(win);
  ok('Claude Code is started in its classic view', !!(await until(async () => /screen: classic/.test(await termText(win)))));
  await win.evaluate(() => {
    let s = '';
    for (let i = 0; i < 400; i++) s += `line ${i}\r\n`;
    term.write(s);
  });
  await win.waitForTimeout(500);
  for (const [n, dy] of [
    [60, 2],
    [60, 6],
    [40, 15],
  ]) {
    await win.evaluate(() => term.scrollToBottom());
    const r = await wheel(win, n, dy, false);
    ok(
      `a touchpad moves the chat as far as the fingers (${n} x ${dy}px)`,
      Math.abs(r.lines - r.want) <= 1.01 && r.passed === 0,
      JSON.stringify(r)
    );
  }
  await win.evaluate(() => term.scrollToBottom());
  const m = await wheel(win, 6, 100, true);
  ok("a mouse wheel's notches are left to the terminal", m.passed === 6 && m.lines > 0, JSON.stringify(m));

  // ---- an app that reads the mouse gets the wheel itself ----
  await win.evaluate(() => desk.chatWrite(ID, 'mouse\r'));
  await until(async () => /mouse on/.test(await termText(win)));
  const r2 = await wheel(win, 20, 6, false);
  ok('an app that reads the mouse gets touchpad steps itself', r2.passed === 20, JSON.stringify(r2));

  // ---- the ⋯ menu's other choice: Claude Code's full-screen view ----
  await app.evaluate((_, root) => process.mainModule.require(`${root}/src/main/config.js`).set({ chatScroll: 'claude' }), ROOT);
  await win.locator('#cfresh').click();
  ok(
    "with Claude Code's full-screen view picked, a new chat gets it",
    !!(await until(async () => /screen: full/.test(await termText(win))))
  );
  await app.evaluate((_, root) => process.mainModule.require(`${root}/src/main/config.js`).set({ chatScroll: 'smooth' }), ROOT);

  await app.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error('ERR', e.stack || e.message);
  process.exit(1);
});
