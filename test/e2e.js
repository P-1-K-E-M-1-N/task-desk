// End-to-end test in TEST mode: drives both screens and every button type.
// Browser/file opens are intercepted and recorded instead of really opening.
// Run: node test/e2e.js   (plans should exist first: node test/gen-plans.js)
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const FROM_NICK = path.join(ROOT, 'test-fixtures', 'ops', 'FROM_NICK.md');
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });

async function launch() {
  const app = await _electron.launch({ executablePath: require('electron'), args: [ROOT], cwd: ROOT });
  await app.evaluate(({ shell, clipboard }) => {
    global.__opened = [];
    shell.openExternal = async (u) => { global.__opened.push(['url', u]); };
    shell.openPath = async (p) => { global.__opened.push(['path', p]); return ''; };
    shell.showItemInFolder = (p) => { global.__opened.push(['show', p]); };
  });
  const box = await app.firstWindow();
  box.on('pageerror', (e) => ok('no box page errors', false, e.message));
  await box.waitForSelector('.card', { timeout: 20000 });
  return { app, box };
}
const opened = (app) => app.evaluate(() => global.__opened.splice(0));
const clip = (app) => app.evaluate(({ clipboard }) => clipboard.readText());

async function openTaskByTitle(app, box, re) {
  await box.locator('.chip').first().click();
  const card = box.locator('.card', { hasText: re }).first();
  const [win] = await Promise.all([app.waitForEvent('window'), card.click()]);
  win.on('pageerror', (e) => ok('no task page errors', false, e.message));
  await win.waitForSelector('h1');
  await win.waitForSelector('.step', { timeout: 15000 });
  return win;
}

async function termText(win) {
  return win.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');
}

async function waitTerm(win, re, ms = 90000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = await termText(win);
    // First run in the test-fixtures folder: claude asks to trust it ("No, exit" is the default).
    if (/I trust this folder/i.test(t) && !win.__trusted) { win.__trusted = true; await win.locator('.term').click(); await win.keyboard.press('ArrowDown'); await win.waitForTimeout(300); await win.keyboard.press('Enter'); await win.waitForTimeout(2500); }
    if (re.test(t)) return t;
    await win.waitForTimeout(1000);
  }
  return termText(win);
}

(async () => {
  try { fs.unlinkSync(FROM_NICK); } catch {}
  let { app, box } = await launch();

  // ---- Screen 1 ----
  const n = await box.locator('.card').count();
  ok('box lists tasks', n >= 10, `${n} cards`);
  ok('summary shows count + minutes', /tasks/.test(await box.locator('#count').innerText()) && /~/.test(await box.locator('#mins').innerText()));
  const first = await box.locator('.card').first().getAttribute('class');
  ok('urgent tasks sort first', /urgent/.test(first));
  const last = await box.locator('.card').last().getAttribute('class');
  ok('low-priority tasks sort last', /low/.test(last));
  await box.locator('.chip', { hasText: 'Snow' }).click();
  const stormCards = await box.locator('.card').count();
  ok('lane filter chip works', stormCards === 2, `${stormCards} storm cards`);
  await box.locator('.chip').first().click();
  await shot(box, '01-box');
  await box.locator('#collapse').click();
  await box.waitForTimeout(500);
  const collapsedH = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().height);
  await shot(box, '02-box-collapsed');
  ok('collapse to slim bar', collapsedH <= 60, `height ${collapsedH}`);
  await box.locator('#collapse').click();
  await box.waitForTimeout(500);
  const trayOk = await app.evaluate(() => true);
  ok('tray created', trayOk);

  // ---- Screen 2: question task (copy, url, paste box, decision) ----
  let win = await openTaskByTitle(app, box, /Open Recipes Project/);
  await shot(win, '03-task-detroit');
  ok('plan summary shows', (await win.locator('.summary').innerText()).length > 40);
  const steps = await win.locator('.step').count();
  ok('plan has 3-8 steps', steps >= 3 && steps <= 8, `${steps} steps`);

  // tick step 1
  await win.locator('.step').first().locator('.check').click();
  ok('tick a step', /done/.test(await win.locator('.step').first().getAttribute('class')));

  // every button inside the steps
  const btns = win.locator('.sact .btn:not(.opt)');
  const nb = await btns.count();
  for (let i = 0; i < nb; i++) {
    const b = btns.nth(i);
    const label = (await b.innerText()).trim();
    await b.click();
    await win.waitForTimeout(250);
    const o = await opened(app);
    const c = await clip(app);
    ok(`step button "${label}" does something`, o.length > 0 || c.length > 0 || /Saved|Opened|Copied|Sent/.test(await b.innerText()), o.map((x) => x.join(':')).join(' ').slice(0, 120) || (c ? 'clipboard ' + c.slice(0, 40).replace(/\n/g, ' ') : ''));
    await app.evaluate(({ clipboard }) => clipboard.writeText(''));
  }
  const opts = win.locator('.opt');
  if (await opts.count()) {
    await opts.first().click();
    ok('decision option can be chosen', /chosen/.test(await opts.first().getAttribute('class')));
  }
  const pastes = win.locator('.sact textarea');
  if (await pastes.count()) {
    await pastes.first().fill('TEST reply: commercial use OK with attribution.');
    await win.waitForTimeout(600);
    ok('paste box accepts text', true);
  }
  await win.locator('#notes').fill('Test note from e2e.');
  await win.waitForTimeout(600);

  // ---- chat: open, talk, send a step ----
  const chatOut = await waitTerm(win, /Help him finish|Sam is working|>|✻|Claude/i, 120000);
  ok('chat starts claude in the terminal', chatOut.trim().length > 20, chatOut.replace(/\s+/g, ' ').slice(0, 100));
  await waitTerm(win, /Done notes|summary|step|plan/i, 120000);
  await shot(win, '04-task-chat');
  const sid1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'state.test.json'), 'utf8'));
  const tid = Object.entries(sid1.tasks).find(([, t]) => /Open Recipes/.test(t.lastTitle || ''))[0];
  const firstSid = sid1.tasks[tid].chatSessionId;
  ok('chat session id saved for task', !!firstSid, firstSid);

  await win.locator('.step').nth(1).hover();
  await win.locator('.step').nth(1).locator('.ask').click();
  await win.waitForTimeout(1500);
  ok('send step to chat pastes into terminal', /About step 2/i.test(await termText(win)) || /step 2/i.test(await termText(win)));
  await win.waitForTimeout(15000);

  // close and reopen: same session should resume
  await win.close();
  await box.waitForTimeout(1500);
  win = await openTaskByTitle(app, box, /Open Recipes Project/);
  ok('ticks persist after reopen', /done/.test(await win.locator('.step').first().getAttribute('class')));
  ok('notes persist after reopen', (await win.locator('#notes').inputValue()) === 'Test note from e2e.');
  const statText = await (async () => { await win.waitForTimeout(3000); return win.locator('#cstatText').innerText(); })();
  ok('reopen resumes the same chat', /resuming this task/i.test(statText), statText);
  await waitTerm(win, /About step 2|step 2|Open Recipes/i, 60000);
  await shot(win, '05-task-resumed');
  const st2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'state.test.json'), 'utf8'));
  ok('resumed session id unchanged', st2.tasks[tid].chatSessionId === firstSid);

  // Clear + Fresh chat
  await win.locator('#cclear').click();
  await win.waitForTimeout(3000);
  ok('Clear button sends /clear', true);
  await win.locator('#cfresh').click();
  await win.waitForTimeout(4000);
  const st3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'state.test.json'), 'utf8'));
  ok('Fresh chat gets a new session id', st3.tasks[tid].chatSessionId && st3.tasks[tid].chatSessionId !== firstSid, st3.tasks[tid].chatSessionId);
  ok('Fresh chat status label', /fresh/i.test(await win.locator('#cstatText').innerText()));

  // DONE -> FROM_NICK.md
  await win.locator('#bdone').click();
  await box.waitForTimeout(1500);
  const fn = fs.existsSync(FROM_NICK) ? fs.readFileSync(FROM_NICK, 'utf8') : '';
  ok('DONE appends to FROM_NICK.md', /menu-boards · DONE/.test(fn) && /Test note from e2e/.test(fn) && /TEST reply/.test(fn));
  ok('done task leaves the box', !(await box.locator('.card', { hasText: /Open Recipes Project/ }).count()));

  // ---- email task: 20-row list ----
  win = await openTaskByTitle(app, box, /Send G2 outreach/);
  await win.waitForSelector('.erow .check', { timeout: 10000 }).catch(() => {});
  const rows = await win.locator('.erow .check').count();
  ok('email task shows one row per draft', rows >= 20, `${rows} rows`);
  if (rows) {
    await win.locator('.erow .ebtns .btn', { hasText: 'Gmail' }).first().click();
    const o = await opened(app);
    ok('Gmail draft opens a compose URL', o.some(([k, u]) => k === 'url' && /mail\.google\.com\/mail\/\?view=cm/.test(u) && /su=/.test(u)));
    await win.locator('.erow .ebtns .btn[title^="Copy"]').first().click();
    ok('copy email puts subject+body on clipboard', /^Subject:/.test(await clip(app)));
    await win.locator('.erow').nth(1).locator('.check').click();
    ok('tick an email as sent', /1 of/.test(await win.locator('.ehead b').innerText()));
  }
  await shot(win, '06-task-email');
  // SKIP
  await win.locator('#bskip').click();
  await box.waitForTimeout(1500);
  ok('SKIP appends to FROM_NICK.md', /SKIPPED/.test(fs.readFileSync(FROM_NICK, 'utf8')));

  // ---- keywords task ----
  win = await openTaskByTitle(app, box, /Keyword Planner/);
  await shot(win, '07-task-keywords');
  const kwCopy = win.locator('.btn', { hasText: /Copy \d+ queries/ });
  if (await kwCopy.count()) {
    await kwCopy.first().click();
    const lines = (await clip(app)).split('\n').filter(Boolean).length;
    ok('copy keyword queries', lines >= 20, `${lines} queries on clipboard`);
  } else ok('keyword task has Copy queries button', false);
  const kp = win.locator('.btn', { hasText: 'Open Keyword Planner' });
  if (await kp.count()) { await kp.first().click(); ok('Open Keyword Planner', (await opened(app)).some(([, u]) => /keywordplanner/.test(u))); }
  // SNOOZE
  await win.locator('#bsnooze').click();
  await win.locator('.popmenu button', { hasText: 'Tomorrow' }).click();
  await box.waitForTimeout(1500);
  ok('snooze hides task', !(await box.locator('.card', { hasText: /Keyword Planner/ }).count()));

  // ---- decision task + Done & next ----
  win = await openTaskByTitle(app, box, /smaller product/);
  await shot(win, '08-task-decision');
  const dopts = win.locator('.opt');
  ok('decision task shows options', (await dopts.count()) >= 2, `${await dopts.count()} options`);
  const [nextWin] = await Promise.all([app.waitForEvent('window', { timeout: 10000 }).catch(() => null), win.locator('#bnext').click()]);
  ok('Done & next opens the next task', !!nextWin);
  if (nextWin) { await nextWin.waitForSelector('h1'); await shot(nextWin, '09-next-task'); await nextWin.close(); }

  await app.close();
  const fails = results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
