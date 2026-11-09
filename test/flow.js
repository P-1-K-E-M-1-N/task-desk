// Checks the flow from one task to the next: ticking the last step counts down
// to "Done & next", closing a started task asks "Did you finish it?", links go
// to Chrome and the chat hears about them, and the Chrome switch.
// Uses a pretend claude (test/fake-claude.js), so it's quick and needs no login.
// Run: node test/flow.js
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { useTestSettings, launchOpts, DATA, pressStart } = require('./env');

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(!!cond);
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const FAKE = `${process.execPath}|${path.join(__dirname, 'fake-claude.js')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await wait(200);
  }
  return null;
}
const termText = (win) => win.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');

(async () => {
  try {
    fs.unlinkSync(path.join(DATA, 'state.test.json'));
  } catch {}
  useTestSettings();
  const start = async () => {
    const a = await _electron.launch(launchOpts({ TASKDESK_FAKE_CLAUDE: FAKE }));
    await a.evaluate(({ shell, dialog }) => {
      global.__opened = [];
      global.__asked = [];
      shell.openExternal = async (u) => global.__opened.push(u);
      shell.openPath = async () => '';
      // "Open this link from the plan?": the test says yes, and keeps what was asked.
      dialog.showMessageBox = async (...a) => {
        global.__asked.push((a.find((x) => x && x.message) || {}).detail || '');
        return { response: 0 };
      };
    });
    const b = await a.firstWindow();
    await b.waitForSelector('.card', { timeout: 20000 });
    await b.locator('.chip').first().click();
    return [a, b];
  };

  // A three-step plan for the task, so the test doesn't wait for (or depend on) the plan writer.
  // It is written while the desk is closed, so the plan writer can't overwrite it.
  let [app, box] = await start();
  const t = (await box.evaluate(() => desk.listTasks())).tasks.find((x) => /Open Recipes/.test(x.title));
  await app.close();
  const dir = path.join(DATA, 'plans', 'test');
  fs.mkdirSync(dir, { recursive: true });
  const plan = {
    summary: 'A short test plan.',
    type: 'ask',
    est_minutes: 5,
    steps: ['Open the form', 'Fill it in', 'Send it'].map((text) => ({ text, action: 'none', data: {} })),
    files: [],
  };
  const rec = { id: t.id, textHash: t.textHash, generatedAt: new Date().toISOString(), ok: true, plan };
  fs.writeFileSync(path.join(dir, t.id + '.json'), JSON.stringify(rec));
  [app, box] = await start();
  const opened = [];

  const openCard = async (re) => {
    const [w] = await Promise.all([app.waitForEvent('window'), box.locator('.card', { hasText: re }).first().click()]);
    await w.waitForSelector('.step', { timeout: 15000 });
    await pressStart(w);
    return w;
  };
  const taskWins = () => app.windows().filter((w) => /task\.html/.test(w.url()));
  const idOf = (w) => w.evaluate(() => new URLSearchParams(location.search).get('id'));
  const stOf = (w, id) => w.evaluate((i) => desk.getTask(i).then((r) => r.st), id);

  let win = await openCard(/Open Recipes/);
  const id = await idOf(win);
  const n = await win.locator('.step').count();
  ok('the task has a plan with steps', n >= 2, String(n));

  // ---- the chat starts without Chrome, and can't change files in the workspace ----
  // The pretend AI prints its options ("--x") on one line, which the terminal may wrap.
  // Joining the rows back up mends a word the wrap split; the last launch's line counts.
  const argsLine = (t) => ((t || '').replace(/\r?\n/g, '').match(/args: .*?handover:/g) || []).pop() || '';
  const args = await until(async () => /--append-system-prompt/.test(argsLine(await termText(win))) && argsLine(await termText(win)));
  ok('the Claude chat starts without Chrome', !!args && !/--chrome/.test(args), args);
  ok('and with its edit tools turned off', /--disallowedTools/.test(args || ''), args);

  // ---- closing a started task asks first ----
  await win.locator('.step .check').first().click();
  await win.locator('#wclose').click();
  ok('closing after ticking a step asks "Did you finish it?"', !!(await until(() => win.locator('.askfinish').isVisible())));
  await win.locator('.askfinish button', { hasText: 'Keep working' }).click();
  await wait(300);
  ok('"Keep working" keeps the window open', !win.isClosed() && (await win.locator('.askfinish').count()) === 0);
  await win.locator('#wclose').click();
  await until(() => win.locator('.askfinish').isVisible());
  await win.locator('.askfinish button', { hasText: 'Close anyway' }).click();
  ok('"Close anyway" closes it', !!(await until(async () => win.isClosed())));
  win = await openCard(/Open Recipes/);
  ok('and the task is still open with its tick', (await win.locator('.step.done').count()) === 1);

  // ---- links go to Chrome, and the chat can find them ----
  await win.evaluate(() => desk.openUrl('https://example.com/form'));
  await wait(400);
  opened.push(...(await app.evaluate(() => global.__opened)));
  ok('the link opens (tests stand in for Chrome)', opened.includes('https://example.com/form'), opened.join(','));
  const asked = await app.evaluate(() => global.__asked);
  ok(
    'after showing the whole link first',
    asked.some((d) => d.startsWith('https://example.com/form')),
    asked.join(' | ')
  );
  await win.evaluate(() => desk.openUrl('https://example.com/form'));
  await wait(300);
  ok('the same link only asks once', (await app.evaluate(() => global.__asked)).length === asked.length);
  ok('a non-web link is refused', (await win.evaluate(() => desk.openUrl('file:///C:/Windows/notepad.exe'))).ok === false);
  const st1 = await stOf(win, id);
  ok(
    'the task remembers the page it opened',
    (st1.opened || []).some((o) => o.url === 'https://example.com/form')
  );

  // ---- the Chrome switch ----
  ok('the switch starts at off', /Chrome: off/.test(await win.locator('#cchrome').innerText()));
  await win.locator('#cchrome').click();
  ok('one click: look only', !!(await until(async () => /look only/.test(await win.locator('#cchrome').innerText()))));
  ok('and the chat restarts with Chrome', !!(await until(async () => /--chrome/.test(argsLine(await termText(win))))));
  ok('the task remembers it', (await stOf(win, id)).chrome === 'look');
  await win.locator('#cchrome').click();
  await wait(300);
  ok('another click: working', /working/.test(await win.locator('#cchrome').innerText()) && (await stOf(win, id)).chrome === 'work');
  ok('and the running chat is told', !!(await until(async () => /turned on "Let Claude work in Chrome"/.test(await termText(win)))));

  // ---- ticking the last step counts down to Done & next ----
  // One step at a time, waiting for each tick to be saved (CI machines are slow).
  const checks = win.locator('.step:not(.done) .check');
  for (let left = await checks.count(); left > 0; left--) {
    await checks.first().click();
    await until(async () => (await win.locator('.progress span').innerText()) === `${n - left + 1} of ${n} steps`);
  }
  ok(
    'ticking the last step starts the countdown',
    !!(await until(() => win.locator('#alldone').isVisible(), 8000)),
    await win.locator('.progress span').innerText()
  );
  await win.locator('#alldone button', { hasText: 'Not yet' }).click();
  ok('"Not yet" stops it', await win.locator('#alldone').isHidden());
  await win.locator('.step .check').last().click();
  await win.locator('.step .check').last().click();
  ok('unticking and ticking again brings it back', !!(await until(() => win.locator('#alldone').isVisible(), 8000)));
  const before = taskWins().length;
  const next = await until(async () => {
    const w = taskWins().find((x) => !x.isClosed() && x !== win);
    return w && (await idOf(w)) !== id ? w : null;
  }, 12000);
  ok('after the countdown the task is finished', (await box.evaluate((i) => desk.getTask(i).then((r) => r.st.status), id)) === 'done');
  ok('its window closes and the next task opens', win.isClosed() && !!next, `${before} windows before`);
  if (next) {
    await next.waitForSelector('.step, .drafting-note', { timeout: 15000 });
    ok('the next task is a different one', (await idOf(next)) !== id);
  }

  await app.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
