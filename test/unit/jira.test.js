// src/main/jira.js: a project's Jira settings, and the queue of changes it
// sends through Atlassian's CLI. A pretend acli records every command; nothing
// reaches a real Jira.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
require('./setup');
const config = require('../../src/main/config');
const state = require('../../src/main/state');
const projects = require('../../src/main/projects');
const jira = require('../../src/main/jira');

config.set({
  projects: [
    {
      id: 'pj',
      name: 'Rental houses',
      folder: '',
      source: 'list',
      results: 'app',
      color: '#c96442',
      jira: { on: true, key: 'OPS', type: 'Task', epic: 'AUTO', labels: ['houses'], doneStatus: 'Closed', pick: 'ask' },
    },
  ],
  jiraSite: 'acme.atlassian.net',
});

// The pretend acli: answers like Jira would, and can be told to fail.
const calls = [];
let next = 100;
let down = false;
jira._setRunner((args) => {
  const flat = args.join(' ');
  const text = args
    .filter((a) => a.startsWith('--body-file=') || a.startsWith('--description-file='))
    .map((a) => fs.readFileSync(a.split('=')[1], 'utf8'));
  calls.push({ args, text: text[0] || '' });
  if (down) return { ok: false, err: 'Not logged in' };
  if (flat.includes('workitem create')) return { ok: true, out: JSON.stringify({ key: `OPS-${next++}` }) };
  return { ok: true, out: 'ok' };
});

const TASKS = {
  pj_a: { id: 'pj_a', project: 'pj', projectName: 'Rental houses', title: 'Make the account', text: 'Make the account', lane: 'my-list' },
  pj_b: { id: 'pj_b', project: 'pj', projectName: 'Rental houses', title: '-Paste its key', text: 'Paste its key', lane: 'my-list' },
};
jira.use({
  findTask: (id) => TASKS[id] || null,
  needsFor: () => ({ pj_b: ['pj_a'] }),
  plan: (t) => (t.id === 'pj_a' ? { summary: 'Sign up.', steps: [{ text: 'Open the site' }, { text: 'Sign up' }] } : null),
  summary: async () => 'Made the account with the team email.',
});

const settle = async () => {
  for (let i = 0; i < 5; i++) await jira.pump();
};
const lastOf = (word) => [...calls].reverse().find((c) => c.args.join(' ').includes(word));

test('settings from the form are cleaned, and Jira stays off without a project key', () => {
  const s = jira.cleanSettings({ on: true, key: 'ops', epic: 'ops-12', labels: 'a b, c;d', pick: 'all' });
  assert.equal(s.key, 'OPS');
  assert.equal(s.epic, 'OPS-12');
  assert.deepEqual(s.labels, ['a', 'b', 'cd']);
  assert.equal(s.pick, 'all');
  assert.equal(jira.cleanSettings({ on: true, key: 'not a key' }).on, false);
  assert.equal(jira.cleanSettings({ on: true, key: 'OPS', epic: 'whatever' }).epic, 'AUTO');
  const r = projects.clean({ name: 'X', source: 'list', results: 'app', jira: { on: true, key: '' } });
  assert.equal(r.ok, false);
  assert.equal(r.field, 'jira');
});

test('the work item key is read from JSON or from text', () => {
  assert.equal(jira.keyFrom('{"key":"OPS-7"}', 'OPS'), 'OPS-7');
  assert.equal(jira.keyFrom('Work item OPS-12 created', 'OPS'), 'OPS-12');
  assert.equal(jira.keyFrom('Created ABC-1', 'OPS'), null);
});

test('new tasks wait for the user to pick, and picked ones are sent under the epic', async () => {
  state.task('pj_a');
  state.task('pj_b');
  assert.deepEqual(
    jira.undecided(Object.values(TASKS)).map((t) => t.id),
    ['pj_a', 'pj_b']
  );
  jira.choose({ pj_a: true, pj_b: true });
  await settle();
  const epic = calls.find((c) => c.args.includes('--type=Epic'));
  assert.ok(epic, 'an epic was made first');
  assert.ok(epic.args.includes('--summary=Rental houses'));
  const a = calls.find((c) => c.args.includes('--summary=Make the account'));
  assert.ok(a.args.includes('--parent=OPS-100'));
  assert.ok(a.args.includes('--label=task-desk,houses'));
  assert.match(a.text, /1\. Open the site\n2\. Sign up/);
  // A title that starts with "-" can't be taken for a flag.
  assert.ok(calls.some((c) => c.args.includes('--summary=-Paste its key')));
  assert.equal(state.task('pj_a').jira.key, 'OPS-101');
  assert.equal(state.task('pj_b').jira.key, 'OPS-102');
  assert.deepEqual(jira.undecided(Object.values(TASKS)), []);
  assert.equal(jira.cardInfo(TASKS.pj_a).url, 'https://acme.atlassian.net/browse/OPS-101');
});

test('a task that waits for another gets a Blocks link, once', async () => {
  const links = calls.filter((c) => c.args.join(' ').includes('link create'));
  assert.equal(links.length, 1);
  assert.deepEqual(links[0].args.slice(4), ['--out=OPS-101', '--in=OPS-102', '--type=Blocks', '--yes']);
  jira.relink('pj');
  await settle();
  assert.equal(calls.filter((c) => c.args.join(' ').includes('link create')).length, 1);
});

test('Done comments with the notes and what the chat did, then moves it to the Done status', async () => {
  jira.finished(TASKS.pj_a, 'done', {
    notes: 'Used the team email.',
    results: [{ label: 'Login', value: 'team@acme.com' }],
    ticked: '2/2',
  });
  await settle();
  const c = lastOf('comment create');
  assert.ok(c.args.includes('--key=OPS-101'));
  assert.match(c.text, /Used the team email\./);
  assert.match(c.text, /Login:\nteam@acme\.com/);
  assert.match(c.text, /What the chat did:\nMade the account/);
  assert.deepEqual(lastOf('transition').args.slice(3), ['--key=OPS-101', '--status=Closed', '--yes']);
});

test("changes wait while Jira can't be reached, and go in order once it can", async () => {
  down = true;
  jira.snoozed(TASKS.pj_b, new Date('2030-01-07T08:00:00'), 'Waiting for the bank.');
  await settle();
  assert.match(jira.statusOf('pj').error, /Not logged in/);
  assert.equal(jira.statusOf('pj').waiting, 1);
  down = false;
  await jira.retry();
  assert.equal(jira.statusOf('pj').waiting, 0);
  assert.equal(jira.statusOf('pj').error, '');
  const c = lastOf('comment create');
  assert.ok(c.args.includes('--key=OPS-102'));
  assert.match(c.text, /Snoozed in Task Desk until .*\n\nWaiting for the bank\./);
});

test('a task taken off Jira before it was sent never goes', async () => {
  TASKS.pj_c = { id: 'pj_c', project: 'pj', projectName: 'Rental houses', title: 'Call the plumber', text: 'Call the plumber' };
  state.task('pj_c');
  down = true;
  jira.choose({ pj_c: true });
  await settle();
  jira.choose({ pj_c: false });
  down = false;
  const before = calls.length;
  await jira.retry();
  assert.ok(!calls.slice(before).some((c) => c.args.includes('--summary=Call the plumber')));
  assert.equal(jira.statusOf('pj').waiting, 0);
  assert.equal(state.task('pj_c').jira.key, undefined);
});
