// Checks the flow from one task to the next: ticking the last step counts down
// to "Done & next", closing a started task asks "Did you finish it?", links go
// to Chrome and the chat hears about them, and the Chrome switch.
// Uses a pretend claude (test/fake-claude.js), so it's quick and needs no login.
// Run: node test/flow.js
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
  const app = await _electron.launch(launchOpts({ TASKDESK_FAKE_CLAUDE: FAKE }));
  const opened = [];
  await app.evaluate(({ shell }) => {
    global.__opened = [];
    shell.openExternal = async (u) => global.__opened.push(u);
    shell.openPath = async () => '';
  });
  const box = await app.firstWindow();
  await box.waitForSelector('.card', { timeout: 20000 });
  await box.locator('.chip').first().click();

  // A three-step plan for the task, so the test doesn't wait for (or depend on) the plan writer.
  const seedPlan = async (re) => {
    const all = (await box.evaluate(() => desk.listTasks())).tasks;
    const t = all.find((x) => re.test(x.title));
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
  };
  await seedPlan(/Open Recipes/);

  const openCard = async (re) => {
    const [w] = await Promise.all([app.waitForEvent('window'), box.locator('.card', { hasText: re }).first().click()]);
    await w.waitForSelector('.step', { timeout: 15000 });
    return w;
  };
  const taskWins = () => app.windows().filter((w) => /task\.html/.test(w.url()));
  const idOf = (w) => w.evaluate(() => new URLSearchParams(location.search).get('id'));
  const stOf = (w, id) => w.evaluate((i) => desk.getTask(i).then((r) => r.st), id);

  let win = await openCard(/Open Recipes/);
  const id = await idOf(win);
  const n = await win.locator('.step').count();
  ok('the task has a plan with steps', n >= 2, String(n));

  // ---- the chat starts with Chrome on ----
  const args = await until(async () => /args: .*--chrome/.test(await termText(win)) && (await termText(win)));
  ok('the Claude chat starts with Claude in Chrome on', !!args);

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
  const st1 = await stOf(win, id);
  ok(
    'the task remembers the page it opened',
    (st1.opened || []).some((o) => o.url === 'https://example.com/form')
  );

  // ---- the Chrome switch ----
  ok('the switch starts at look only', /look only/.test(await win.locator('#cchrome').innerText()));
  await win.locator('#cchrome').click();
  await wait(300);
  ok('it turns on "working"', /working/.test(await win.locator('#cchrome').innerText()) && (await stOf(win, id)).chromeDrive === true);
  ok('and the running chat is told', !!(await until(async () => /turned on "Let Claude work in Chrome"/.test(await termText(win)))));

  // ---- ticking the last step counts down to Done & next ----
  const checks = win.locator('.step:not(.done) .check');
  while ((await checks.count()) > 0) await checks.first().click();
  ok('ticking the last step starts the countdown', !!(await until(() => win.locator('#alldone').isVisible(), 3000)));
  await win.locator('#alldone button', { hasText: 'Not yet' }).click();
  ok('"Not yet" stops it', await win.locator('#alldone').isHidden());
  await win.locator('.step .check').last().click();
  await win.locator('.step .check').last().click();
  ok('unticking and ticking again brings it back', !!(await until(() => win.locator('#alldone').isVisible(), 3000)));
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
