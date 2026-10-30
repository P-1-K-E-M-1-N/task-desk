// Checks that updates go in without getting in the way: refreshed windows keep
// their running chat, the desk waits for a quiet moment, and after a restart
// it reopens the task windows that were open, where they were.
// Uses a pretend claude (test/fake-claude.js), so it's quick and needs no login.
// Run: node test/seamless.js
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { useTestSettings, launchOpts, DATA } = require('./env');

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(!!cond);
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const FAKE = `${process.execPath}|${path.join(__dirname, 'fake-claude.js')}`;
const machine = () => JSON.parse(fs.readFileSync(path.join(DATA, 'machine.json'), 'utf8'));

async function launch() {
  const app = await _electron.launch(launchOpts({ TASKDESK_FAKE_CLAUDE: FAKE }));
  // The box, not a task window the desk reopened after a restart.
  await app.firstWindow();
  let box = null;
  for (let i = 0; i < 80 && !box; i++) {
    box = app.windows().find((w) => w.url().endsWith('box.html'));
    if (!box) await new Promise((r) => setTimeout(r, 250));
  }
  await box.waitForSelector('.card', { timeout: 20000 });
  return { app, box };
}
const termText = (win) => win.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');
async function waitTerm(win, re, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = await termText(win).catch(() => '');
    if (re.test(t)) return t;
    await win.waitForTimeout(250);
  }
  return termText(win).catch(() => '');
}
const say = async (win, text) => {
  await win.locator('#term').click();
  await win.keyboard.type(text);
  await win.keyboard.press('Enter');
};
const pids = (t) => [...t.matchAll(/FAKE CLAUDE pid=(\d+)/g)].map((m) => m[1]);

(async () => {
  try {
    fs.unlinkSync(path.join(DATA, 'state.test.json'));
  } catch {}
  useTestSettings();
  let { app, box } = await launch();

  // ---- a task window with a running chat ----
  await box.locator('.chip').first().click();
  const [win] = await Promise.all([
    app.waitForEvent('window'),
    box
      .locator('.card', { hasText: /Open Recipes Project/ })
      .first()
      .click(),
  ]);
  let t = await waitTerm(win, /FAKE CLAUDE pid=\d+/);
  const pid = pids(t)[0];
  ok('the chat starts', !!pid, pid);
  await say(win, 'hello');
  ok('the chat answers', /you said: hello/.test(await waitTerm(win, /you said: hello/)));

  // ---- a screen-only update: windows refresh, the chat keeps running ----
  await app.evaluate(() => global.__update.refreshWindows());
  await win.waitForTimeout(800);
  await win.waitForSelector('.step', { timeout: 15000 });
  t = await waitTerm(win, /you said: hello/);
  ok('after a refresh the chat is still on screen', /you said: hello/.test(t));
  ok('it is the same chat, not a new one', pids(t).length >= 1 && pids(t).every((p) => p === pid), pids(t).join(','));
  await say(win, 'again');
  ok('and it still answers', /you said: again/.test(await waitTerm(win, /you said: again/)));
  ok('the box refreshed too', (await box.locator('.card').count()) > 0);

  // ---- the X puts the box away but keeps its taskbar button ----
  await box.locator('#hide').click();
  await box.waitForTimeout(500);
  const boxWin = (fn) =>
    app.evaluate(({ BrowserWindow }, f) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('box.html'));
      return { min: w.isMinimized(), visible: w.isVisible() };
    }, fn);
  const st = await boxWin();
  ok('the X minimizes the box to its taskbar button', st.min, JSON.stringify(st));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('box.html'));
    w.restore();
    w.show();
  });

  // ---- waiting for a quiet moment ----
  const quiet = (kind) => app.evaluate((_, k) => global.__update.quietNow(k), kind);
  await app.evaluate(() => global.__update.setLastInput(Date.now()));
  ok('not while you are typing', !(await quiet('refresh')) && !(await quiet('restart')));
  await app.evaluate(() => global.__update.setLastInput(0));
  ok('a refresh can go in while a chat just printed something', await quiet('refresh'));
  ok('a restart waits until the chat has been quiet a while', !(await quiet('restart')));

  // ---- a restart reopens the task windows where they were ----
  const want = { x: 140, y: 90, width: 1000, height: 700 };
  await app.evaluate(
    ({ BrowserWindow }, b) =>
      BrowserWindow.getAllWindows()
        .find((w) => /task\.html/.test(w.webContents.getURL()))
        .setBounds(b),
    want
  );
  await app.evaluate(() => global.__update.rememberWindows());
  ok('the open windows are remembered', (machine().reopenAfterUpdate?.wins || []).length === 1);
  await app.close();
  ({ app, box } = await launch());
  let back = null;
  for (let i = 0; i < 60 && !back; i++) {
    back = app.windows().find((w) => /task\.html/.test(w.url()));
    if (!back) await box.waitForTimeout(250);
  }
  await back.waitForSelector('.step', { timeout: 15000 });
  ok('after restarting, the task window is back', /Open Recipes/i.test(await back.title()));
  const got = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => /task\.html/.test(w.webContents.getURL()))
      .getBounds()
  );
  ok(
    'in the same place and size',
    Math.abs(got.x - want.x) < 4 &&
      Math.abs(got.y - want.y) < 4 &&
      Math.abs(got.width - want.width) < 4 &&
      Math.abs(got.height - want.height) < 4,
    JSON.stringify(got)
  );
  t = await waitTerm(back, /FAKE CLAUDE pid=\d+/);
  ok('and its chat starts again by itself', pids(t).length > 0);
  ok('the reopen note is used up', !machine().reopenAfterUpdate);
  await app.close();

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
