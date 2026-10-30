// Checks that the chat's Claude can update its own task's plan through the
// taskdesk tools: tick a step, comment on it, add to the notes. TEST mode.
// Run: node test/chat-tools.js
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { useTestSettings, launchOpts, DATA } = require('./env');

const ROOT = path.join(__dirname, '..');
const STATE = path.join(DATA, 'state.test.json');
const FROM_NICK = path.join(ROOT, 'test-fixtures', 'ops', 'FROM_NICK.md');
const results = [];
const ok = (name, cond, extra = '') => {
  results.push(cond);
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

(async () => {
  useTestSettings();
  try {
    fs.unlinkSync(STATE);
  } catch {}
  try {
    fs.unlinkSync(FROM_NICK);
  } catch {}

  const app = await _electron.launch(launchOpts());
  await app.evaluate(({ shell }) => {
    shell.openExternal = async () => {};
    shell.openPath = async () => '';
  });
  const box = await app.firstWindow();
  await box.waitForSelector('.card', { timeout: 20000 });
  const [win] = await Promise.all([
    app.waitForEvent('window'),
    box
      .locator('.card', { hasText: /Detroit Open Data/ })
      .first()
      .click(),
  ]);
  win.on('pageerror', (e) => ok('no page errors', false, e.message));
  await win.waitForSelector('.step', { timeout: 15000 });
  const tid = await win.evaluate(() => new URLSearchParams(location.search).get('id'));

  const term = () => win.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');
  const until = async (fn, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await fn();
      if (v) return v;
      await win.waitForTimeout(1500);
    }
    return null;
  };
  let trusted = false;
  // Wait for Claude's prompt (answer the folder-trust question if it appears).
  await until(async () => {
    const t = await term();
    if (/trust this folder/i.test(t) && !trusted) {
      trusted = true;
      await win.locator('.term').click();
      await win.keyboard.press('ArrowDown');
      await win.keyboard.press('Enter');
    }
    return /accept edits|shift\+tab|\? for shortcuts|❯|>/.test(t) && t.length > 200;
  }, 120000);
  await win.waitForTimeout(20000); // let the brief's first answer finish

  await win.evaluate(
    (id) =>
      desk.chatSend(
        id,
        'Test of the Task Desk tools, no other work please: call get_task, then mark step 1 done with the comment "E2E: form sent 10/24", then add_note "E2E note from chat". Reply OK when finished.'
      ),
    tid
  );
  const ticked = await until(() => win.evaluate(() => document.querySelector('.step[data-key="s0"]').classList.contains('done')), 180000);
  ok('chat ticked step 1 in the plan', !!ticked);
  const comment = await until(async () => {
    const c = win.locator('.step[data-key="s0"] .scomment');
    return (await c.isVisible()) && /E2E: form sent/.test(await c.innerText());
  }, 60000);
  ok("step 1 shows the chat's comment", !!comment);
  const note = await until(async () => /E2E note from chat/.test(await win.locator('#notes').inputValue()), 90000);
  ok('chat added a line to the notes box', !!note);
  await win.waitForTimeout(1500);
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8')).tasks[tid];
  ok(
    'tick, comment and note saved to disk',
    st.ticks.s0 === true && /E2E: form sent/.test(st.stepNotes.s0) && /E2E note from chat/.test(st.notes)
  );
  ok(
    'box progress ring updated',
    (await box
      .locator('.card', { hasText: /Detroit Open Data/ })
      .locator('.ring, .live')
      .count()) > 0
  );
  await win.screenshot({ path: path.join(ROOT, 'test', 'shots', 'chat-tools.png') });

  await win.locator('#bdone').click();
  await box.waitForTimeout(1500);
  const fn = fs.existsSync(FROM_NICK) ? fs.readFileSync(FROM_NICK, 'utf8') : '';
  ok('step comment goes to FROM_NICK.md on Done', /Step 1 comment/.test(fn) && /E2E: form sent/.test(fn) && /E2E note from chat/.test(fn));

  await app.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
