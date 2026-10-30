// Launches the app in test mode and screenshots the task box.
const { _electron } = require('playwright-core');
const path = require('path');
(async () => {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, '..')],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, TASKDESK_TEST: '1' },
  });
  app.process().stdout.on('data', (d) => process.stdout.write('[main] ' + d));
  app.process().stderr.on('data', (d) => process.stdout.write('[main!] ' + d));
  const box = await app.firstWindow();
  box.on('console', (m) => console.log('[box]', m.type(), m.text()));
  box.on('pageerror', (e) => console.log('[box error]', e.message));
  await box.waitForSelector('.card', { timeout: 20000 });
  await box.waitForTimeout(1500);
  await box.screenshot({ path: path.join(__dirname, 'shots', 'box.png') });
  console.log('cards:', await box.locator('.card').count());
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
