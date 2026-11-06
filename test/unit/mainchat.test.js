// src/main/mainchat.js: finding a project's main chat among Claude Code's saved
// sessions. Uses pretend session files in a scratch folder, never the real ones.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scratch } = require('./setup');
const config = require('../../src/main/config');
const mainchat = require('../../src/main/mainchat');

const ROOT = scratch('claude-projects');
const SHOP = scratch('shop');
const OTHER = scratch('other');
config.set({
  projects: [
    { id: 'p1', name: 'Shop', folder: SHOP, source: 'app', results: 'app', color: '#c96442' },
    { id: 'p2', name: 'Garden', folder: OTHER, source: 'app', results: 'app', color: '#c96442' },
  ],
});

// A pretend session: the folder it ran in, then what the user typed.
let clock = Date.now() - 60 * 60 * 1000;
function session(dir, id, cwd, ...said) {
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  const lines = said.map((text) => JSON.stringify({ type: 'user', cwd, sessionId: id, message: { role: 'user', content: text } }));
  const f = path.join(ROOT, dir, `${id}.jsonl`);
  fs.writeFileSync(f, lines.join('\n') + '\n');
  clock += 60 * 1000;
  fs.utimesSync(f, new Date(clock), new Date(clock));
}

const SETUP =
  'I use Task Desk, a desktop app, for the hands-on tasks my projects need from me. Please set this project up for it:\n\n1. Keep a checklist…';
session('C--shop', 'aaa', SHOP, 'Build me a shop website', SETUP);
session(
  'C--WINDOWS',
  'bbb',
  'C:\\WINDOWS\\system32',
  'Lots of things',
  `I track the hands-on tasks for this project, "Shop" (folder: ${SHOP}), in Task Desk, a desktop app.`
);
session('C--shop', 'own', SHOP, 'Build me a shop website', SETUP, 'a task chat forked from it');
session('C--shop', 'plain', SHOP, 'Just a question about the shop');
session('C--other', 'ccc', OTHER, 'Garden plans', SETUP);

test('the newest session with the project text is the main chat, skipping task chats', async () => {
  const s = await mainchat.find('p1', new Set(['own']), ROOT);
  assert.equal(s.id, 'bbb');
  assert.equal(s.cwd, 'C:\\WINDOWS\\system32');
  assert.equal(config.get().mainChats.p1.id, 'bbb');
});

test("the set-up text counts only in the project's own folder", async () => {
  const all = await mainchat.scan(mainchat.target('p1'), new Set(['own']), ROOT);
  const by = Object.fromEntries(all.map((s) => [s.id, s.setUp]));
  assert.equal(by.aaa, true);
  assert.equal(by.ccc, false);
  assert.equal(by.plain, false);
  assert.equal(by.own, undefined);
});

test('the list puts set-up sessions first, then others in the folder', async () => {
  const ids = (await mainchat.choices('p1', new Set(['own']), ROOT)).map((s) => s.id);
  assert.deepEqual(ids, ['bbb', 'aaa', 'plain']);
});

test('the first thing typed is shown, and resuming uses the session id', async () => {
  const [s] = await mainchat.choices('p2', new Set(), ROOT);
  assert.equal(s.first, 'Garden plans');
  assert.deepEqual(mainchat.argsFor(s), ['--resume', 'ccc']);
});

test('a new main chat starts in the project folder under a new id', () => {
  const s = mainchat.fresh('p2');
  assert.equal(s.cwd, OTHER);
  assert.deepEqual(mainchat.argsFor(s), ['--session-id', s.id]);
  assert.equal(config.get().mainChats.p2.id, s.id);
});

test('unknown projects get nothing', async () => {
  assert.equal(mainchat.target('nope'), null);
  assert.equal(await mainchat.find('nope', new Set(), ROOT), null);
});

// ---- the session that writes the project's checklist is its main chat ----
const BAKERY = scratch('bakery');
const TASKS = path.join(BAKERY, 'TASKS.md');
config.set({
  projects: [
    ...config.get().projects,
    { id: 'p3', name: 'Bakery', folder: BAKERY, source: 'file', tasksFile: 'TASKS.md', results: 'app', color: '#c96442' },
  ],
});
// A pretend session in which the AI used one tool (or the user's message came back as a tool result).
function used(id, tool, input) {
  const dir = path.join(ROOT, 'C--WINDOWS-system32');
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    { type: 'user', cwd: 'C:\\WINDOWS\\system32', message: { role: 'user', content: `Work on ${id}` } },
    {
      type: 'assistant',
      cwd: 'C:\\WINDOWS\\system32',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: tool, input }] },
    },
  ];
  const f = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  clock += 60 * 1000;
  fs.utimesSync(f, new Date(clock), new Date(clock));
}
const posix = TASKS.split(path.sep)
  .join('/')
  .replace(/^([A-Za-z]):/, (m, d) => `/${d.toLowerCase()}`);
used('wrote-edit', 'Edit', { file_path: TASKS, old_string: 'a', new_string: 'b' });
used('wrote-cat', 'Bash', { command: `mkdir -p x && cat > ${posix} <<'EOF'\n- [ ] Call the flour supplier\nEOF` });
used('only-read', 'Bash', { command: `grep -n flour "${TASKS}" 2>/dev/null` });
used('only-read2', 'Read', { file_path: TASKS });

test('a session that wrote the checklist (Edit, or a shell command into it) is a main chat', async () => {
  const by = Object.fromEntries((await mainchat.scan(mainchat.target('p3'), new Set(), ROOT)).map((s) => [s.id, s.setUp]));
  assert.equal(by['wrote-edit'], true);
  assert.equal(by['wrote-cat'], true);
  assert.equal(by['only-read'], false);
  assert.equal(by['only-read2'], false);
  assert.equal((await mainchat.find('p3', new Set(), ROOT)).id, 'wrote-cat');
});

test("Task Desk's text that only shows up in a tool's output doesn't count", async () => {
  const dir = path.join(ROOT, 'C--shop');
  const lines = [
    { type: 'user', cwd: SHOP, message: { role: 'user', content: 'Read the box code' } },
    { type: 'user', cwd: SHOP, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: SETUP }] } },
  ];
  fs.writeFileSync(path.join(dir, 'echoed.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const s = (await mainchat.scan(mainchat.target('p1'), new Set(), ROOT)).find((x) => x.id === 'echoed');
  assert.equal(s.setUp, false);
});

test('pasted text is shown without its paste markers', () => {
  const a = mainchat.about(
    JSON.stringify({ type: 'user', cwd: 'C:\\x', message: { content: '<pasted_content id="1">\nPROJECT: Bakery\n</pasted_content>' } })
  );
  assert.equal(a.first, 'PROJECT: Bakery');
});
