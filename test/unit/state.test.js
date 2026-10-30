// src/main/state.js: ticks, notes and statuses per task, saved atomically per project.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DATA } = require('./setup');
const config = require('../../src/main/config');
const state = require('../../src/main/state');
const log = require('../../src/main/log');

test('projectOf: project task ids carry their project, the rest belong to the workspace', () => {
  assert.equal(state.projectOf('p1abc_0123456789ab'), 'p1abc');
  assert.equal(state.projectOf('0123456789ab'), 'factory');
});

test('a task starts open with empty ticks and notes, and update() merges', () => {
  const t = state.task('p1_a');
  assert.equal(t.status, 'open');
  assert.deepEqual(t.ticks, {});
  assert.ok(t.firstSeen);
  state.update('p1_a', { notes: 'hi', ticks: { s0: true } });
  assert.equal(state.task('p1_a').notes, 'hi');
  assert.equal(state.has('p1_a'), true);
  assert.equal(state.has('p1_b'), false, 'asking has() must not create the task');
});

test('isOpen: done and skipped are closed, a snooze ends when its time has passed', () => {
  assert.equal(state.isOpen('p1_new'), true, 'unknown tasks are open');
  state.update('p1_done', { status: 'done' });
  assert.equal(state.isOpen('p1_done'), false);
  state.update('p1_later', { status: 'snoozed', snoozeUntil: new Date(Date.now() + 60000).toISOString() });
  assert.equal(state.isOpen('p1_later'), false);
  state.update('p1_past', { status: 'snoozed', snoozeUntil: new Date(Date.now() - 1000).toISOString() });
  assert.equal(state.isOpen('p1_past'), true);
  assert.equal(state.task('p1_past').status, 'open', 'an expired snooze reopens the task');
});

test('flush writes one file per project, atomically, and only when something changed', () => {
  state.update('p1_a', { notes: 'saved' });
  state.flush();
  const file = path.join(config.PROJECTS_DIR, 'p1', 'state.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.tasks.p1_a.notes, 'saved');
  assert.ok(!fs.existsSync(file + '.tmp'), 'the temp file is renamed into place');
  const before = fs.statSync(file).mtimeMs;
  state.flush();
  assert.equal(fs.statSync(file).mtimeMs, before, 'nothing changed, nothing written');
  assert.equal(path.dirname(log.file), DATA, 'the log lives in the local data folder');
});
