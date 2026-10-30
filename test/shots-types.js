// Screenshots of the tile for each of the eight task types, light and dark.
// Saves test/shots/types-light.png and types-dark.png. Run: node test/shots-types.js
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { useTestSettings, launchOpts } = require('./env');

const SAMPLES = [
  ['outreach', 'Send the feedback email to 20 trade shops', 45],
  ['ask', 'Ask the city data office about commercial use', 10],
  ['info', 'Tell the AI your Play developer name', 3],
  ['decide', 'Pick an Android package prefix', 5],
  ['account', 'Create a RevenueCat account', 10],
  ['setup', 'Turn on the Play Developer API', 10],
  ['qa', 'Test the three prototype apps', 20],
  ['research', 'Pull search volumes from Keyword Planner', 15],
];

(async () => {
  useTestSettings();
  const app = await _electron.launch(launchOpts());
  const box = await app.firstWindow();
  await box.waitForSelector('.card', { timeout: 20000 });
  const out = path.join(__dirname, 'shots');
  fs.mkdirSync(out, { recursive: true });
  for (const mode of ['light', 'dark']) {
    await box.evaluate(
      ({ samples, dark }) => {
        document.documentElement.classList.toggle('dark', dark);
        document.querySelector('#typesheet')?.remove();
        const sheet = document.createElement('div');
        sheet.id = 'typesheet';
        sheet.style.cssText =
          'position:fixed;inset:0;z-index:99;background:var(--bg);padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px 8px;align-content:start;font:600 12px var(--sans);color:var(--ink)';
        for (const [type] of samples) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:8px';
          // eslint-disable-next-line no-undef
          row.innerHTML = `<div class="${tileClass(type)}" style="zoom:1.8">${icon(type)}</div><span>${TYPE_LABEL[type]}</span>`;
          sheet.append(row);
        }
        document.body.append(sheet);
      },
      { samples: SAMPLES, dark: mode === 'dark' }
    );
    await box.waitForTimeout(700);
    await box.screenshot({ path: path.join(out, `types-${mode}.png`) });
  }
  await app.close();
  console.log('saved test/shots/types-light.png and types-dark.png');
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
