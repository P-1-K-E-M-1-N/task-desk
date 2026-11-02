// src/main/order.js: the order the box lists tasks in (what waits on what,
// then A to Z) and the rough goal line. No AI app needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const config = require('../../src/main/config');
const state = require('../../src/main/state');
const order = require('../../src/main/order');

config.set({ userName: 'Alex' });
const task = (id, title) => ({ id, title, text: title, textHash: 'h' + id, project: 'p1', projectName: 'Apps', laneDir: '.' });
const titles = (list) => list.map((t) => t.title);

test('sortTasks: A to Z when nothing waits on anything', () => {
  const list = [
    task('p1_c', 'Call the bank'),
    task('p1_a', 'Apply for the permit'),
    task('p1_b', 'buy stamps'),
    task('p1_d', 'Step 10'),
    task('p1_e', 'Step 9'),
  ];
  assert.deepEqual(titles(order.sortTasks(list)), ['Apply for the permit', 'buy stamps', 'Call the bank', 'Step 9', 'Step 10']);
});

test('sortTasks: urgent tasks lead and low-priority ones trail, but never ahead of what they wait on', () => {
  const list = [
    task('p1_a', 'Apply'),
    { ...task('p1_z', 'Zip it'), important: true },
    { ...task('p1_b', 'Browse'), low: true },
    task('p1_m', 'Make the account'),
  ];
  assert.deepEqual(titles(order.sortTasks(list)), ['Zip it', 'Apply', 'Make the account', 'Browse']);
  assert.deepEqual(titles(order.sortTasks(list, { p1_z: ['p1_m'] })), ['Apply', 'Make the account', 'Zip it', 'Browse']);
});

test('sortTasks: a task comes after the ones it needs, even a newer one', () => {
  const list = [
    task('p1_a', 'Add the key to the app'),
    task('p1_b', 'Make the account'),
    task('p1_c', 'Ask Sam'),
    task('p1_n', 'Pick a username'),
  ];
  // "Pick a username" was added later, and "Make the account" now needs it.
  const needs = { p1_a: ['p1_b'], p1_b: ['p1_n'] };
  assert.deepEqual(titles(order.sortTasks(list, needs)), ['Ask Sam', 'Pick a username', 'Make the account', 'Add the key to the app']);
});

test('sortTasks: finished tasks, unknown ids and loops never hide a task', () => {
  const list = [task('p1_a', 'Alpha'), task('p1_b', 'Beta'), task('p1_c', 'Gamma')];
  const needs = { p1_a: ['p1_b', 'p1_gone'], p1_b: ['p1_a'], p1_c: ['p1_c'] };
  const out = titles(order.sortTasks(list, needs));
  assert.equal(out.length, 3);
  // Gamma is free to do; Alpha and Beta wait on each other, so they follow A to Z.
  assert.deepEqual(out, ['Gamma', 'Alpha', 'Beta']);
});

test('clean: keeps only open ids, drops self-needs and empty ones, and clamps the percent', () => {
  const open = [task('p1_a', 'A'), task('p1_b', 'B')];
  const r = order.clean(
    {
      order: [
        { id: 'p1_a', needs: ['p1_b', 'p1_b', 'p1_a', 'p1_zzz'], why: '  You need B first.  ' },
        { id: 'p1_b', needs: [] },
        { id: 'p1_zzz', needs: ['p1_a'] },
      ],
      progress: { percent: 140, goal: 'Launch the app', why: 'Most of the build is done.' },
    },
    open
  );
  assert.deepEqual(r.needs, { p1_a: ['p1_b'] });
  assert.deepEqual(r.why, { p1_a: 'You need B first.' });
  assert.equal(r.progress.percent, 100);
  assert.equal(r.progress.goal, 'Launch the app');
});

test('run: saves the order and the goal, and the box reads them back', async () => {
  const open = [task('p1_a', 'Add the key'), task('p1_b', 'Make the account')];
  const seen = [];
  const fake = async (t, input, schema) => {
    seen.push({ t, input, schema });
    return {
      plan: {
        order: [{ id: 'p1_a', needs: ['p1_b'], why: 'You need the account first.' }],
        progress: { percent: 35, goal: 'Ship it', why: 'Halfway.' },
      },
    };
  };
  const saved = await order.run('p1', open, fake);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].schema, order.SCHEMA);
  assert.match(seen[0].input, /- id: p1_a\n {2}task: Add the key/);
  assert.match(seen[0].input, /project "Apps"/);
  assert.equal(saved.stamp, order.stampOf(open));
  assert.deepEqual(order.needsFor(open), { p1_a: ['p1_b'] });
  assert.deepEqual(order.waitsOn(open[0], open), { titles: ['Make the account'], why: 'You need the account first.' });
  assert.equal(order.waitsOn(open[1], open), null);
  const g = order.progress('p1', { open: 2, done: 1 });
  assert.equal(g.from, 'ai');
  assert.equal(g.percent, 35);
  assert.equal(g.goal, 'Ship it');
});

test('progress: the share of tasks done until the AI has looked, and nothing from the AI when ordering is off', async () => {
  assert.deepEqual(order.progress('p9', { open: 3, done: 1 }), { percent: 25, goal: '', from: 'tasks' });
  config.set({ orderTasks: false });
  assert.equal(order.progress('p1', { open: 1, done: 3 }).from, 'tasks');
  assert.deepEqual(order.needsFor([task('p1_a', 'A')]), {});
  config.set({ orderTasks: true });
});

test('run: a failed AI run keeps what was there', async () => {
  const before = state.store('p1').order;
  assert.equal(await order.run('p1', [task('p1_a', 'A')], async () => ({ error: 'not installed' })), null);
  assert.equal(state.store('p1').order, before);
});

test('stampOf: changes when a task is added or reworded, not when the list is reordered', () => {
  const a = task('p1_a', 'A'),
    b = task('p1_b', 'B');
  assert.equal(order.stampOf([a, b]), order.stampOf([b, a]));
  assert.notEqual(order.stampOf([a, b]), order.stampOf([a]));
  assert.notEqual(order.stampOf([a, b]), order.stampOf([a, { ...b, textHash: 'other' }]));
});
