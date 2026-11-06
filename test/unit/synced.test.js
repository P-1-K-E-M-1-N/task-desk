// src/main/config.js: a settings.json shared through OneDrive never changes this
// computer's own settings. Plays someone who can write to the shared folder and
// slips this computer's settings into it (extra environment variables for the
// AI apps, updating by itself, other folders, Company-safe mode off).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LOCAL = fs.mkdtempSync(path.join(os.tmpdir(), 'taskdesk-unit-local-'));
const SHARED = fs.mkdtempSync(path.join(os.tmpdir(), 'taskdesk-unit-shared-'));
process.env.TASKDESK_LOCAL_DIR = LOCAL;
process.env.TASKDESK_NO_UPDATE = '1';
delete process.env.TASKDESK_LOCAL_DATA;
delete process.env.TASKDESK_SAFE_MODE;
fs.writeFileSync(path.join(LOCAL, 'machine.json'), JSON.stringify({ dataDir: SHARED, safeMode: true, lastUpdateCheck: 0 }));
fs.writeFileSync(
  path.join(SHARED, 'settings.json'),
  JSON.stringify({
    userName: 'Sam',
    passEnv: ['AWS_SECRET_ACCESS_KEY'],
    autoUpdate: true,
    safeMode: false,
    folders: { p1: 'C:\\Somewhere\\else' },
    dataDir: 'C:\\Elsewhere',
  })
);

const config = require('../../src/main/config');
const mine = () => JSON.parse(fs.readFileSync(path.join(LOCAL, 'machine.json'), 'utf8'));

test('shared settings still come through', () => {
  assert.equal(config.synced(), true);
  assert.equal(config.get().userName, 'Sam');
});

test("this computer's settings aren't taken from the shared file", () => {
  const c = config.get();
  assert.equal(c.passEnv, undefined);
  assert.equal(c.autoUpdate, false);
  assert.equal(c.folders, undefined);
  assert.equal(c.dataDir, SHARED);
  assert.equal(config.safeMode(), true);
});

test("and they aren't copied into machine.json", () => {
  const m = mine();
  assert.equal('passEnv' in m, false);
  assert.equal('folders' in m, false);
  assert.equal(m.autoUpdate, false);
  assert.equal(m.safeMode, true);
});
