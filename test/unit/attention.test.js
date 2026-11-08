// attention: reading what a chat is waiting for from its screen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify, step, strip, userTyped } = require('../../src/main/attention');

const E = '\x1b[';
const claudeQuestion = `${E}1mDo you want to make this edit to notes.md?${E}0m\r\n${E}36m❯ 1. Yes${E}0m\r\n  2. Yes, and don't ask again this session\r\n  3. No\r\n${E}2mEsc to cancel${E}0m`;
const claudeBusy = `${E}2K${E}G✻ Thinking… ${E}2m(esc to interrupt)${E}0m`;
const claudeIdle = `${E}2K> ${E}0m\r\n${E}2m? for shortcuts${E}0m`;
const fakeIdle = 'you said: hello\r\n> ';

test('strip: colours, cursor moves and titles go, text stays', () => {
  assert.equal(strip(`\x1b]0;claude\x07${E}1;32mhi${E}0m ${E}2K${E}Gthere\x1b(B`), 'hi there');
});

test('classify: a question, busy, idle, nothing', () => {
  assert.equal(classify(claudeQuestion), 'question');
  assert.equal(classify('Allow command? [y/N]'), 'question');
  assert.equal(classify('Do you trust the files in this folder?\r\n ❯ 1. Yes, proceed'), 'question');
  assert.equal(classify(claudeBusy), 'busy');
  assert.equal(classify(claudeIdle), 'idle');
  assert.equal(classify(fakeIdle), 'idle');
  assert.equal(classify(`${E}2K${E}G⠋`), 'nothing');
  assert.equal(classify(''), 'nothing');
  // Only the newest screen counts: an answered question followed by work is busy.
  assert.equal(classify(claudeQuestion + '\r\n' + claudeBusy), 'question', 'a question still on screen counts');
  assert.equal(classify(claudeBusy + '\r\n' + 'x'.repeat(1600)), 'nothing', 'old output scrolled away no longer counts');
});

test('step: your turn only after the AI has been busy since you typed', () => {
  const e = { state: null, armed: false };
  assert.equal(step(e, claudeIdle), null, 'the first empty prompt is not a turn');
  assert.equal(step(e, claudeBusy), null);
  assert.equal(step(e, `${E}2K${E}G⠋`), null, 'a spinner tick changes nothing');
  assert.equal(step(e, claudeIdle), 'turn');
  assert.equal(step(e, claudeIdle), 'turn', 'stays until the user acts');
  // The user types: the desk clears the state and disarms (attention.input), then the
  // input line redraws, which must not count as the AI waiting.
  e.armed = false;
  e.state = null;
  assert.equal(step(e, claudeIdle), null);
  assert.equal(step(e, claudeBusy), null);
  assert.equal(step(e, claudeQuestion), 'question');
  assert.equal(step(e, `${E}2K${E}G⠋`), 'question', 'a question stays through spinner ticks');
  assert.equal(step(e, claudeIdle), 'turn', 'dismissed with Esc after the AI had worked: your turn');
});

test('step: a question shows even before the AI was busy, and goes when the prompt comes back unarmed', () => {
  const e = { state: null, armed: false };
  assert.equal(step(e, claudeQuestion), 'question');
  assert.equal(step(e, claudeIdle), null, 'dismissed with Esc: the plain prompt is back, nothing to do');
});

test('userTyped: keys yes, terminal answers no', () => {
  for (const k of ['y', '1', '\r', '\x1b[A', '\x1b[B', '\x1b', 'hello', '\x1b[H']) assert.ok(userTyped(k), JSON.stringify(k));
  for (const r of ['\x1b[12;1R', '\x1b[?1;2c', '\x1b[<0;10;5M', '\x1b[5~']) assert.ok(!userTyped(r), JSON.stringify(r));
});
