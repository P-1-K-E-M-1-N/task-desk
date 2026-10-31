// src/main/planner.js: which open tasks a finished one changes, and the
// "just finished" news a redrafted plan is written with. No AI app needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const config = require('../../src/main/config');
const planner = require('../../src/main/planner');

config.set({ userName: 'Alex' });
const done = {
  id: 'p1_done',
  project: 'p1',
  lane: 'general',
  title: 'Create a RevenueCat account',
  text: 'Create a RevenueCat account',
  notes: 'Made it, project is "App Factory".',
  results: [{ label: 'API key', value: 'rc_123' }],
  laneDir: '.',
};
const other = (id, text) => ({ id, project: 'p1', lane: 'general', title: text, text, rawText: text, laneDir: '.' });
const others = [other('p1_a', 'Give RevenueCat the Play key'), other('p1_b', 'Pick a privacy page host')];

test('affectedPrompt: lists the finished task, its notes and results, and every open task by id', () => {
  const p = planner.affectedPrompt(done, others);
  assert.match(p, /FINISHED TASK: Create a RevenueCat account/);
  assert.match(p, /THEIR NOTES: Made it/);
  assert.match(p, /- API key: rc_123/);
  assert.match(p, /- id: p1_a\n {2}task: Give RevenueCat the Play key/);
  assert.match(p, /- id: p1_b/);
  assert.match(p, /to Alex as "you"/);
});

test('affected: keeps only real open task ids, once each, with a trimmed reason', async () => {
  const run = async () => ({
    plan: {
      affected: [
        { id: 'p1_a', why: '  You made the account, so step 1 is gone.  ' },
        { id: 'p1_a', why: 'duplicate' },
        { id: 'p1_zzz', why: 'not an open task' },
        { id: 'p1_b' },
      ],
    },
  });
  assert.deepEqual(await planner.affected(done, others, run), [{ id: 'p1_a', why: 'You made the account, so step 1 is gone.' }]);
});

test('affected: nothing to check, or the AI failed, means nothing changes', async () => {
  let ran = false;
  assert.deepEqual(
    await planner.affected(done, [], async () => {
      ran = true;
      return {};
    }),
    []
  );
  assert.equal(ran, false, 'no AI run when there are no other open tasks');
  assert.deepEqual(await planner.affected(done, others, async () => ({ error: 'not installed' })), []);
});

test('a redraft is planned with the news from the finished task', () => {
  const t = {
    ...other('p1_a', 'Give RevenueCat the Play key'),
    projectName: 'Apps',
    sourceFile: 'TODO.md',
    recentChange: { title: 'Create a RevenueCat account', notes: 'Made it.', why: 'You made the account, so step 1 is gone.' },
  };
  const p = planner.prompt(t);
  assert.match(p, /JUST FINISHED: Alex just finished the task "Create a RevenueCat account"\. Their notes: Made it\./);
  assert.match(p, /Why this task changes: You made the account, so step 1 is gone\./);
  assert.doesNotMatch(planner.prompt({ ...t, recentChange: null }), /JUST FINISHED/);
});
