// src/main/ai.js: Claude's model and effort for the desk, a project and one
// task, and the arguments a task's chat starts with. No AI app needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const config = require('../../src/main/config');
const state = require('../../src/main/state');
const ai = require('../../src/main/ai');

const t = { id: 'p1_abc', project: 'p1' };
state.task(t.id);

test('nothing picked: no extra arguments (Claude Code uses its own default)', () => {
  assert.deepEqual(ai.modelFor(t), { model: '', effort: '', modelFrom: '', effortFrom: '' });
  assert.deepEqual(ai.modelArgs(t), []);
});

test('the desk, then the project, each part on its own', () => {
  ai.setModel('desk', { model: 'sonnet', effort: 'medium' });
  assert.deepEqual(ai.modelArgs(t), ['--model', 'sonnet', '--effort', 'medium']);
  ai.setModel('p1', { model: 'opus' });
  const m = ai.modelFor(t);
  assert.equal(m.model, 'opus');
  assert.equal(m.modelFrom, 'project');
  assert.equal(m.effort, 'medium');
  assert.equal(m.effortFrom, 'desk');
  // Another project still gets the desk's.
  assert.deepEqual(ai.modelArgs({ id: 'p2_x', project: 'p2' }), ['--model', 'sonnet', '--effort', 'medium']);
});

test("a task's own choice only counts while per task is on", () => {
  ai.setModel(`task:${t.id}`, { model: 'haiku', effort: 'max' });
  assert.equal(state.task(t.id).model, 'haiku');
  assert.deepEqual(ai.modelArgs(t), ['--model', 'opus', '--effort', 'medium']);
  config.set({ perTaskModel: true });
  assert.deepEqual(ai.modelArgs(t), ['--model', 'haiku', '--effort', 'max']);
  assert.deepEqual(ai.modelFor(t, { withTask: false }).model, 'opus');
  config.set({ perTaskModel: false });
});

test('"" clears a choice, and unknown values are ignored', () => {
  ai.setModel('p1', { model: 'gpt-9', effort: 'turbo' });
  assert.deepEqual(ai.modelSetting('p1'), { model: 'opus', effort: '' });
  ai.setModel('p1', { model: '' });
  assert.deepEqual(ai.modelSetting('p1'), { model: '', effort: '' });
  assert.equal(ai.modelFor(t).model, 'sonnet');
});
