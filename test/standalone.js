// A brand-new desk, as someone else would first see it: no lanes workspace, no
// name yet. Checks the welcome, the "what should Task Desk call you?" card, and
// that nothing personal or workspace-specific shows up.
// Run: node test/standalone.js
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { useTestSettings, launchOpts, SETTINGS } = require('./env');

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(!!cond);
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const settings = () => JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));

(async () => {
  // What a fresh install has: none of the test desk's extras.
  useTestSettings();
  const fresh = settings();
  for (const k of ['factory', 'factoryName', 'livePath', 'userName', 'userNameAsked']) delete fresh[k];
  fs.writeFileSync(SETTINGS, JSON.stringify(fresh, null, 2));

  const app = await _electron.launch(launchOpts());
  const box = await app.firstWindow();
  await box.waitForSelector('.welcome', { timeout: 20000 });
  ok('a new desk shows a welcome with "Add your first project"', /Add your first project/.test(await box.locator('.welcome').innerText()));
  ok('no workspace tasks are shown', (await box.locator('.card').count()) === 0);
  ok('the switcher just says Task Desk', (await box.locator('#pname').innerText()) === 'Task Desk');
  ok('it asks your name once', await box.locator('#me').isVisible());
  ok('the greeting has no name yet', !/,/.test(await box.locator('#hello').innerText()));
  await box.screenshot({ path: path.join(__dirname, 'shots', 'standalone-first-run.png') });

  await box.locator('#meName').fill('Alex');
  await box.locator('#meAbout').fill('a designer who runs a small studio');
  await box.locator('#me button[type=submit]').click();
  await box.waitForTimeout(400);
  ok(
    'your name is saved',
    settings().userName === 'Alex' && settings().userAbout === 'a designer who runs a small studio' && settings().userNameAsked === true
  );
  ok('the greeting uses it', /, Alex$/.test(await box.locator('#hello').innerText()));
  ok('the card goes away', !(await box.locator('#me').count()));

  const menu = await app.evaluate(() => true);
  ok('the app starts', menu);
  const all = await box.evaluate(() => document.body.innerText);
  ok(
    'nothing on screen names the original owner or workspace',
    !/Nick|Idea Factory|factory/i.test(all),
    all.match(/Nick|Idea Factory|factory/i)?.[0]
  );
  const title = await app.evaluate(({ app: a }) => a.getName());
  ok('the app is called Task Desk', title === 'Task Desk', title);

  // The planner and the chat call you by your name.
  const intro = await app
    .evaluate(() => {
      return global.__update
        .planPrompt({
          id: 'x',
          project: 'p1',
          projectName: 'Studio',
          projectFolder: '',
          rawText: 'Send the invoice',
          lane: 'my-list',
          text: 'Send the invoice',
        })
        .split('\n')[0];
    })
    .catch((e) => String(e));
  ok('plans are written for you by name', /for Alex, a designer who runs a small studio\./.test(intro), intro);

  await app.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
