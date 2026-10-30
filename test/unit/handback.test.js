// src/main/handback.js: the only writes the app makes outside its own folder.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scratch } = require('./setup');
const config = require('../../src/main/config');
const { appendResults, appendFromNick, guard, writeEnv, projectHeader } = require('../../src/main/handback');

const entry = {
  lane: 'shop',
  text: 'Order the sign',
  status: 'done',
  notes: 'Ordered, arrives Friday',
  results: [{ label: 'Quote', value: '$120\nincl. tax' }],
  ticked: '2/3',
};

test('appendResults: creates the file with a header, then appends dated entries', () => {
  const file = path.join(scratch('results'), 'TASK_RESULTS.md');
  config.set({ userName: 'Alex' });
  appendResults(file, entry, projectHeader('Shop'));
  const once = fs.readFileSync(file, 'utf8');
  assert.ok(once.startsWith('# From Alex\n'));
  assert.match(once, /^## \d{4}-\d{2}-\d{2} \d{2}:\d{2} · shop · DONE$/m);
  assert.match(once, /\*\*Steps ticked:\*\* 2\/3/);
  assert.match(once, /\*\*Alex's notes:\*\* Ordered, arrives Friday/);
  assert.match(once, /- Quote:\n\n {4}\$120\n {4}incl\. tax/, 'pasted results are indented as a block');

  appendResults(file, { ...entry, status: 'skip', notes: '' }, projectHeader('Shop'));
  const twice = fs.readFileSync(file, 'utf8');
  assert.equal(twice.indexOf('# From Alex'), 0, 'the header is written once');
  assert.match(twice, /· SKIP\n\n\*\*Task:\*\* Order the sign\n/);
  assert.match(twice, /\*\*Alex's notes:\*\* \(none\)/);
});

test('guard: inside a lanes workspace only ops/FROM_NICK.md may be written', () => {
  const ws = scratch('workspace');
  fs.mkdirSync(path.join(ws, 'ops'), { recursive: true });
  config.set({ factory: true, mode: 'live', livePath: ws });
  assert.throws(() => guard(path.join(ws, 'lanes', 'storm', 'LANE.md')), /read-only/);
  assert.throws(() => appendResults(path.join(ws, 'ops', 'NEEDS_NICK.md'), entry), /read-only/);
  assert.doesNotThrow(() => guard(path.join(ws, 'ops', 'FROM_NICK.md')));
  assert.doesNotThrow(() => guard(path.join(scratch('elsewhere'), 'notes.md')), 'outside the workspace anything goes');
  const written = appendFromNick(ws, entry);
  assert.equal(written, path.join(ws, 'ops', 'FROM_NICK.md'));
  assert.ok(fs.existsSync(written));
});

test('writeEnv: only .env files, valid names, and an existing line is replaced', () => {
  const dir = scratch('env');
  const env = path.join(dir, '.env');
  assert.throws(() => writeEnv(path.join(dir, 'config.json'), 'KEY', 'x'), /not a \.env file/);
  assert.throws(() => writeEnv(env, 'bad name', 'x'), /Bad variable name/);
  writeEnv(env, 'API_KEY', 'first');
  writeEnv(env, 'OTHER', 'two\nlines');
  writeEnv(env, 'API_KEY', 'second');
  assert.equal(fs.readFileSync(env, 'utf8'), 'API_KEY=second\nOTHER=twolines\n');
  assert.doesNotThrow(() => writeEnv(path.join(dir, '.env.local'), 'A', '1'));
});
