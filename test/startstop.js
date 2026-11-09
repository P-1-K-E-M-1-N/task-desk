// Checks that a task's chat waits for Start, the project's "start chats on
// their own" switch, the Stop button (one chat) and Stop all (every chat), and
// that the box says plans are only being written.
// Uses a pretend claude (test/fake-claude.js), so it's quick and needs no login.
// Run: node test/startstop.js
/* global ID, T, data, render */ // page names, used inside evaluate()
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { useTestSettings, launchOpts, SETTINGS, ROOT } = require('./env');

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(!!cond);
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const FAKE = `${process.execPath}|${path.join(__dirname, 'fake-claude.js')}`;
const settings = () => JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
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

(async () => {
  useTestSettings();
  const app = await _electron.launch(launchOpts({ TASKDESK_FAKE_CLAUDE: FAKE }));
  const box = await app.firstWindow();
  box.on('pageerror', (e) => ok('no box page errors', false, e.message));
  await box.waitForSelector('.card', { timeout: 20000 });
  await box.locator('.chip').first().click();
  const chatMod = (fn, ...a) =>
    app.evaluate((_, [root, fn, a]) => process.mainModule.require(`${root}/src/main/chat.js`)[fn](...a), [ROOT, fn, a]);

  const open = async (re) => {
    const [w] = await Promise.all([app.waitForEvent('window'), box.locator('.card', { hasText: re }).first().click()]);
    w.on('pageerror', (e) => ok('no task page errors', false, e.message));
    await w.waitForSelector('.step', { timeout: 15000 });
    return w;
  };
  const type = (w, s) => w.evaluate((s) => desk.chatWrite(ID, s), s);

  // ---- the chat waits for Start ----
  const win = await open(/Open Recipes Project/);
  const id = await win.evaluate(() => ID);
  await win.locator('#cstart').waitFor({ state: 'visible', timeout: 10000 });
  ok('opening a task shows Start', await win.locator('#cstart').isVisible());
  ok(
    'and says Claude does nothing until then',
    /does nothing on this task until you press Start/.test(await win.locator('#overlay').innerText())
  );
  ok('the status line says it is waiting', /Waiting for you to press Start/.test(await win.locator('#cstatText').innerText()));
  await win.waitForTimeout(1500);
  ok('no chat runs before Start', !(await chatMod('isLive', id)) && !/FAKE CLAUDE/.test(await termText(win)));
  ok('no Stop button before Start', await win.locator('#cstop').isHidden());
  ok('no stop-all in the box yet', await box.locator('#stopall').isHidden());
  await win.screenshot({ path: path.join(__dirname, 'shots', 'startstop-task.png') });

  // ---- the project's switch ----
  await win.locator('.overlay .autostart input').check();
  ok('the switch turns on starting by itself', !!(await until(async () => settings().factoryAutoStart === true)));

  // ---- Start ----
  await win.locator('#cstart').click();
  ok('Start starts the chat', !!(await until(async () => /FAKE CLAUDE pid=\d+/.test(await termText(win)))));
  ok('Stop shows once the chat runs', await win.locator('#cstop').isVisible());
  ok('the box shows stop-all', !!(await until(() => box.locator('#stopall').isVisible())));

  // ---- Stop (one chat) ----
  await type(win, 'long\r');
  ok('the chat is busy', !!(await until(async () => /Working on it/.test(await termText(win)))));
  await win.locator('#cstop').click();
  ok('Stop interrupts it', !!(await until(async () => /Interrupted/.test(await termText(win)))));
  ok('the chat stays open', await chatMod('isLive', id));
  ok('and is held for you', await chatMod('isHeld', id));
  await type(win, 'x');
  ok('typing in it lifts the hold', !(await chatMod('isHeld', id)));
  await type(win, '\r');

  // ---- a second task starts by itself (the switch is on) ----
  const win2 = await open(/Decide on the smaller product/);
  ok('with the switch on, the next task starts by itself', !!(await until(async () => /FAKE CLAUDE pid=\d+/.test(await termText(win2)))));
  ok('and shows no Start', (await win2.locator('#cstart').count()) === 0 || (await win2.locator('#overlay').isHidden()));
  const off = await win2.evaluate(() => desk.setAutoStart(ID, false));
  ok('the switch turns off again', off && off.on === false && !!(await until(async () => settings().factoryAutoStart === false)));

  // ---- Stop all ----
  await type(win, 'long\r');
  await type(win2, 'long\r');
  await until(async () => /Working on it/.test(await termText(win2)));
  const before = (await termText(win)).split('Interrupted').length;
  await box.locator('#stopall').click();
  ok('stop-all stops the first chat', !!(await until(async () => (await termText(win)).split('Interrupted').length > before)));
  ok('and the second', !!(await until(async () => /Interrupted/.test(await termText(win2)))));
  ok('both stay open', (await chatMod('liveIds')).length === 2);
  ok(
    'the box says how many stopped',
    /Stopped 2 chats/.test(
      await box
        .locator('.toast')
        .last()
        .innerText()
        .catch(() => '')
    )
  );

  // ---- right-click a card: stop its chat ----
  await type(win2, 'long\r');
  await until(async () => (await termText(win2)).split('Working on it').length > 2);
  const n2 = (await termText(win2)).split('Interrupted').length;
  const t2 = await win2.evaluate(() => T.title);
  await box.locator('.card', { hasText: t2 }).first().click({ button: 'right' });
  await box.locator('.popmenu button', { hasText: 'Stop its chat' }).click();
  ok("a card's menu stops its chat", !!(await until(async () => (await termText(win2)).split('Interrupted').length > n2)));

  // ---- the box says plans are only being written ----
  await box.evaluate(() => {
    data.tasks[0].planStatus = 'drafting';
    data.tasks[1].planStatus = 'queued';
    render();
  });
  const line = await box.locator('#planning').innerText();
  ok(
    'a line says plans are being written, reading only',
    /Writing plans for 2 tasks/.test(line) && /only reads the project/.test(line) && /press Start/.test(line),
    line
  );
  ok(
    'a queued card looks different from one being drafted',
    (await box.locator('.drafting.queued').count()) === 1 && (await box.locator('.drafting:not(.queued)').count()) === 1
  );
  await box.waitForTimeout(4000); // the toast fades
  await box.screenshot({ path: path.join(__dirname, 'shots', 'startstop-box.png') });

  await app.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error('ERR', e.stack || e.message);
  process.exit(1);
});
