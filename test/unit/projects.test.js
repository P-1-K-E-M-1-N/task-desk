// src/main/projects.js: what the Add-project form accepts, and the paths it allows.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scratch } = require('./setup');
const config = require('../../src/main/config');
const projects = require('../../src/main/projects');

const folder = scratch('shop');
fs.writeFileSync(path.join(folder, 'TODO.md'), '- [ ] Order the sign\n');

test('a project needs a name; the rest has safe defaults', () => {
  assert.equal(projects.clean({}).ok, false);
  assert.equal(projects.clean({}).field, 'name');
  const r = projects.clean({ name: '  Shop  ' });
  assert.equal(r.ok, true);
  assert.equal(r.project.name, 'Shop');
  assert.equal(r.project.source, 'list');
  assert.equal(r.project.results, 'app');
  assert.equal(r.project.allowEdits, false);
  assert.equal(r.project.ai, '');
  assert.match(r.project.id, /^p[0-9a-f]{6}$/);
});

test('the folder has to exist, and the checklist file is kept relative to it', () => {
  assert.equal(projects.clean({ name: 'X', folder: path.join(folder, 'nope') }).field, 'folder');
  assert.equal(projects.clean({ name: 'X', folder, source: 'file' }).field, 'tasksFile');
  assert.equal(projects.clean({ name: 'X', folder, source: 'file', tasksFile: 'missing.md' }).field, 'tasksFile');
  const r = projects.clean({ name: 'X', folder, source: 'file', tasksFile: path.join(folder, 'TODO.md') });
  assert.equal(r.ok, true);
  assert.equal(r.project.tasksFile, 'TODO.md');
});

test('the results file has to be a .md or .txt inside the project folder', () => {
  assert.equal(projects.clean({ name: 'X', results: 'file' }).field, 'results', 'no folder: keep notes in the app');
  assert.equal(projects.clean({ name: 'X', folder, results: 'file', resultsFile: '..\\outside.md' }).field, 'resultsFile');
  assert.equal(projects.clean({ name: 'X', folder, results: 'file', resultsFile: 'C:\\Windows\\x.md' }).field, 'resultsFile');
  assert.equal(projects.clean({ name: 'X', folder, results: 'file', resultsFile: 'notes.exe' }).field, 'resultsFile');
  const r = projects.clean({ name: 'X', folder, results: 'file', resultsFile: 'docs/RESULTS.md' });
  assert.equal(r.ok, true);
  assert.equal(r.project.resultsFile, path.join('docs', 'RESULTS.md'));
  assert.equal(projects.resultsFile(r.project), path.join(folder, 'docs', 'RESULTS.md'));
  const kept = projects.clean({ name: 'X', folder }).project;
  assert.equal(
    projects.resultsFile(kept),
    path.join(config.PROJECTS_DIR, kept.id, 'results.md'),
    'notes kept in the app live in the data folder'
  );
});

test('a project pointed at the lanes workspace cannot write a results file there', () => {
  const ws = scratch('workspace');
  fs.mkdirSync(path.join(ws, 'ops'), { recursive: true });
  config.set({ factory: true, mode: 'live', livePath: ws });
  const r = projects.clean({ name: 'X', folder: ws, results: 'file' });
  assert.equal(r.ok, false);
  assert.match(r.error, /read-only/);
  assert.equal(projects.clean({ name: 'X', folder: ws, results: 'app' }).ok, true);
});

test('save, read and quick-add round-trip through settings and state', () => {
  const r = projects.save({ name: 'Shop', folder, source: 'file', tasksFile: 'TODO.md' });
  assert.equal(r.created, true);
  assert.equal(projects.get(r.project.id).name, 'Shop');
  const id = projects.addTask(r.project.id, '  Pay   the invoice ');
  assert.ok(id.startsWith(r.project.id + '_q'));
  const tasks = projects.read(projects.get(r.project.id));
  assert.deepEqual(tasks.map((t) => t.text).sort(), ['Order the sign', 'Pay the invoice']);
  assert.ok(tasks.every((t) => t.project === r.project.id && t.workDir === folder));
  assert.equal(projects.save({ ...r.project, name: 'Shop 2' }).created, false);
  assert.equal(projects.list().length, 1);
});
