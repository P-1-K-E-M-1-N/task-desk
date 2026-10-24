// Read-only live check: opens the app against the real factory, opens one task,
// lets the chat fork the factory session, and confirms nothing was written to the factory.
const { _electron } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PROJ = path.join(os.homedir(), '.claude', 'projects', 'C--MrC-idea-factory');
(async () => {
  const before = new Set(fs.readdirSync(PROJ));
  const app = await _electron.launch({ executablePath: require('electron'), args: [ROOT], cwd: ROOT });
  await app.evaluate(({ shell }) => { shell.openExternal = async () => {}; shell.openPath = async () => ''; });
  const box = await app.firstWindow();
  await box.waitForSelector('.card', { timeout: 20000 });
  await box.waitForTimeout(1200);
  console.log('mode pill hidden (live):', await box.locator('#mode').isHidden(), '| cards:', await box.locator('.card').count());
  await box.screenshot({ path: path.join(__dirname, 'shots', 'live-box.png') });
  const [win] = await Promise.all([app.waitForEvent('window'), box.locator('.card', { hasText: /Open Recipes Project/ }).click()]);
  await win.waitForSelector('.step', { timeout: 15000 });
  let text = '';
  for (let i = 0; i < 150; i++) {
    text = await win.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');
    if (/Done notes|summary|Contact Us|Open Recipes/i.test(text) && /❯/.test(text) && i > 20) break;
    await win.waitForTimeout(1000);
  }
  console.log('chat status:', await win.locator('#cstatText').innerText());
  console.log('chat tail:', text.replace(/\s+/g, ' ').slice(-300));
  await win.screenshot({ path: path.join(__dirname, 'shots', 'live-task.png') });
  const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'state.json'), 'utf8'));
  const sid = Object.values(st.tasks).find((t) => /Open Recipes/.test(t.lastTitle || '')).chatSessionId;
  const added = fs.readdirSync(PROJ).filter((f) => !before.has(f));
  console.log('task session:', sid, '| new files in factory project dir:', added.join(', '));
  await win.close();
  await box.waitForTimeout(800);
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
