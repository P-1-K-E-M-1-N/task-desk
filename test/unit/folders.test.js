// src/main/config.js + projects.js: with the data shared through OneDrive,
// each computer keeps its own folder for a project and for the workspace, and
// the shared settings keep the other computer's. Plays "the second computer":
// the shared settings already point at the first computer's folders.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Its own setup (not ./setup): this computer's folder, plus a "OneDrive" data folder.
const LOCAL = fs.mkdtempSync(path.join(os.tmpdir(), 'taskdesk-unit-local-'));
const SHARED = fs.mkdtempSync(path.join(os.tmpdir(), 'taskdesk-unit-shared-'));
const HERE = fs.mkdtempSync(path.join(os.tmpdir(), 'taskdesk-unit-here-'));
fs.mkdirSync(path.join(HERE, 'shop'));
fs.mkdirSync(path.join(HERE, 'workspace', 'ops'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'workspace', 'ops', 'NEEDS_NICK.md'), '');
process.env.TASKDESK_LOCAL_DIR = LOCAL;
process.env.TASKDESK_NO_UPDATE = '1';
delete process.env.TASKDESK_LOCAL_DATA;
fs.writeFileSync(path.join(LOCAL, 'machine.json'), JSON.stringify({ dataDir: SHARED }));
const THERE = 'C:\\Elsewhere\\on-the-other-computer';
fs.writeFileSync(
  path.join(SHARED, 'settings.json'),
  JSON.stringify({
    factory: true,
    mode: 'live',
    livePath: path.join(THERE, 'workspace'),
    projects: [{ id: 'p111111', name: 'Shop', folder: path.join(THERE, 'shop'), source: 'list', results: 'app', color: '#c96442' }],
  })
);

const config = require('../../src/main/config');
const projects = require('../../src/main/projects');
const shared = () => JSON.parse(fs.readFileSync(path.join(SHARED, 'settings.json'), 'utf8'));
const mine = () => JSON.parse(fs.readFileSync(path.join(LOCAL, 'machine.json'), 'utf8'));

test("the data is shared, and the other computer's folders aren't here", () => {
  assert.equal(config.synced(), true);
  assert.equal(projects.missing(projects.get('p111111')), true);
  assert.equal(projects.summary().find((p) => p.id === 'factory').missing, true);
});

test("picking this computer's folder for a project keeps the other computer's", () => {
  const p = projects.get('p111111');
  const r = projects.save({ ...p, folder: path.join(HERE, 'shop') });
  assert.equal(r.ok, true);
  assert.equal(projects.get('p111111').folder, path.join(HERE, 'shop'));
  assert.equal(projects.missing(projects.get('p111111')), false);
  assert.equal(shared().projects[0].folder, path.join(THERE, 'shop'));
  assert.equal(mine().folders.p111111, path.join(HERE, 'shop'));
});

test('other changes to the project are still shared', () => {
  projects.save({ ...projects.get('p111111'), name: 'Corner Shop' });
  assert.equal(shared().projects[0].name, 'Corner Shop');
  assert.equal(shared().projects[0].folder, path.join(THERE, 'shop'));
  projects.setOwnLook('p111111', true);
  assert.equal(shared().projects[0].folder, path.join(THERE, 'shop'));
});

test("the workspace's folder works the same way", () => {
  config.set({ livePath: config.placeFolder('factory', path.join(HERE, 'workspace'), config.get().livePath) });
  assert.equal(config.livePath(), path.join(HERE, 'workspace'));
  assert.equal(config.root(), path.join(HERE, 'workspace'));
  assert.equal(shared().livePath, path.join(THERE, 'workspace'));
  assert.equal(projects.summary().find((p) => p.id === 'factory').missing, false);
  assert.equal(config.inFactory(path.join(HERE, 'workspace', 'ops', 'FROM_NICK.md')), true);
});

test('a new project needs no override', () => {
  const r = projects.save({ name: 'New one', folder: path.join(HERE, 'shop') });
  assert.equal(shared().projects.find((p) => p.id === r.project.id).folder, path.join(HERE, 'shop'));
  assert.equal(r.project.id in (mine().folders || {}), false);
});

test("emptying the folder here leaves the other computer's alone", () => {
  projects.save({ ...projects.get('p111111'), folder: '' });
  assert.equal(projects.get('p111111').folder, '');
  assert.equal(shared().projects[0].folder, path.join(THERE, 'shop'));
});

test('going back to the shared folder drops the override', () => {
  assert.equal(config.placeFolder('p111111', path.join(THERE, 'shop'), path.join(THERE, 'shop')), path.join(THERE, 'shop'));
  assert.equal('p111111' in mine().folders, false);
  assert.equal(projects.get('p111111').folder, path.join(THERE, 'shop'));
});

test('removing a project drops its folder here too', () => {
  projects.save({ ...projects.get('p111111'), folder: path.join(HERE, 'shop') });
  assert.equal(mine().folders.p111111, path.join(HERE, 'shop'));
  projects.remove('p111111');
  assert.equal('p111111' in mine().folders, false);
});
