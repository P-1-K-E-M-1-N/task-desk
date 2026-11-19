// Jira Cloud, for projects that turn it on (box 10 of the project form).
//
// Task Desk never holds a Jira password, token or key. It runs Atlassian's own
// command-line program, acli, which the user installs and signs in to once in
// their browser (acli jira auth login --web), the same way the chats use the
// user's own Claude Code.
//
// What it does for a project with Jira on:
//  - new tasks wait for the user to choose which ones go to Jira (or all of them
//    go, if the project says so); each chosen task becomes one work item, under
//    the project's epic, with its plan's steps in the description,
//  - a task that waits for another (see order.js) gets a "Blocks" link,
//  - Done adds the notes, pasted results and a short summary of the chat as a
//    comment and moves the work item to the project's Done status; Skip and
//    Snooze add a comment.
// Every change goes through a queue kept in the project's state file, so a
// change made while offline (or signed out) goes through later, in order.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('./config');
const state = require('./state');
const log = require('./log');
const { where, cleanEnv } = require('./sessions');

const KEY = /^[A-Z][A-Z0-9_]{1,19}$/; // a Jira project key
const ITEM = /^[A-Z][A-Z0-9_]{1,19}-\d{1,9}$/; // a work item key
const RETRY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 90 * 1000;
const INSTALL =
  'Invoke-WebRequest -Uri https://acli.atlassian.com/windows/latest/acli_windows_amd64/acli.exe -OutFile "$env:LOCALAPPDATA\\Programs\\acli\\acli.exe"';

// ---------- a project's Jira settings ----------
const clip = (s, n) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
// From the project form (or a synced settings file): only sane values survive.
function cleanSettings(d) {
  d = d && typeof d === 'object' ? d : {};
  const key = clip(d.key, 20).toUpperCase();
  const epic = clip(d.epic, 30).toUpperCase();
  return {
    on: !!d.on && KEY.test(key),
    key: KEY.test(key) ? key : '',
    type: clip(d.type, 40) || 'Task',
    // 'AUTO' = one epic for the project, made the first time; 'NONE'; or an existing epic's key.
    epic: epic === 'NONE' || ITEM.test(epic) ? epic : 'AUTO',
    labels: clip(d.labels, 200)
      .split(/[,\s]+/)
      .map((l) => l.replace(/[^\w.-]/g, ''))
      .filter(Boolean)
      .slice(0, 10),
    doneStatus: clip(d.doneStatus, 40) || 'Done',
    // 'ask': new tasks wait for the user to pick; 'all': every new task goes.
    pick: d.pick === 'all' ? 'all' : 'ask',
  };
}
// The settings of a project (a project object or id), or null when Jira is off for it.
function settingsOf(p) {
  if (typeof p === 'string') p = require('./projects').get(p);
  if (!p || !p.jira) return null;
  const s = cleanSettings(p.jira);
  return s.on ? s : null;
}

// ---------- the program ----------
// Tests swap in a pretend acli: TASKDESK_FAKE_ACLI = "<node.exe>|<script.js in test/>", test runs only.
function fake() {
  const f = process.env.TASKDESK_FAKE_ACLI;
  if (!f || !(process.env.TASKDESK_TEST || process.env.TASKDESK_LOCAL_DATA)) return null;
  const [exe, script] = f.split('|');
  const rel = path.relative(path.join(config.APP_ROOT, 'test'), path.resolve(String(script || '')));
  const ok = !!rel && !rel.startsWith('..') && !path.isAbsolute(rel) && /\.js$/i.test(rel);
  return ok && path.isAbsolute(String(exe)) && /^(node|electron)\.exe$/i.test(path.basename(exe)) ? { exe, pre: [script] } : null;
}
// Where acli.exe is: the one picked in the menu, else on PATH, else where the
// README's install line puts it. Only ever a full path to an acli.exe.
function locate() {
  const f = fake();
  if (f) return f;
  const own = config.get().acliPath;
  const spots = [
    own,
    ...where('acli').filter((h) => /\.exe$/i.test(h)),
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'acli', 'acli.exe'),
  ];
  for (const s of spots)
    if (s && path.isAbsolute(s) && /^acli\.exe$/i.test(path.basename(s)) && fs.existsSync(s)) return { exe: s, pre: [] };
  return null;
}

// Runs acli with these arguments (never through a shell). Resolves { ok, out, err }.
let runner = null; // tests replace this
function run(args) {
  if (runner) return Promise.resolve(runner(args));
  const loc = locate();
  if (!loc) return Promise.resolve({ ok: false, err: "Atlassian's CLI (acli) isn't installed on this computer.", missing: true });
  return new Promise((resolve) => {
    let out = '',
      err = '';
    let p;
    try {
      p = spawn(loc.exe, [...loc.pre, ...args], { windowsHide: true, env: cleanEnv(), cwd: os.homedir() });
    } catch (e) {
      resolve({ ok: false, err: e.message });
      return;
    }
    const kill = setTimeout(() => p.kill(), TIMEOUT_MS);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      clearTimeout(kill);
      resolve({ ok: false, err: e.message });
    });
    p.on('close', (code) => {
      clearTimeout(kill);
      resolve({ ok: code === 0, out, err: (err || (code ? out : '')).trim().slice(0, 600) });
    });
  });
}

// Text for a description or comment goes in a file (acli reads it), never on the command line.
function withFile(text, fn) {
  const dir = path.join(config.LOCAL_DIR, 'jira');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `text-${crypto.randomBytes(6).toString('hex')}.txt`);
  fs.writeFileSync(f, text);
  return Promise.resolve(fn(f)).finally(() => {
    try {
      fs.unlinkSync(f);
    } catch {}
  });
}

// The work item key acli printed (JSON or text), for this Jira project.
function keyFrom(out, project) {
  try {
    const j = JSON.parse(out);
    const k = j && (j.key || (j.data && j.data.key) || (Array.isArray(j) && j[0] && j[0].key));
    if (ITEM.test(String(k || ''))) return k;
  } catch {}
  const re = new RegExp(`\\b(${project}-\\d{1,9})\\b`);
  const m = String(out || '').match(re);
  return m ? m[1] : null;
}

// ---------- the queue ----------
const memOf = (pid) => {
  const s = state.store(pid);
  s.jira = s.jira || { epic: '', links: [], queue: [] };
  return s.jira;
};
const jiraOf = (id) => {
  const st = state.task(id);
  st.jira = st.jira || {};
  return st.jira;
};

function enqueue(pid, op) {
  const m = memOf(pid);
  // One create per task, however often it's asked for.
  if (op.op === 'create' && m.queue.some((q) => q.op === 'create' && q.id === op.id)) return;
  m.queue.push({ ...op, at: new Date().toISOString() });
  state.save();
  setImmediate(pump);
}

let busy = false;
let changed = () => {};
const onChange = (fn) => (changed = fn);
let ctx = { findTask: () => null, needsFor: () => ({}), summary: null };
// desk.js tells it how to find tasks, what they wait for, and how to sum up a chat.
const use = (c) => (ctx = { ...ctx, ...c });

async function pump() {
  if (busy) return;
  busy = true;
  try {
    for (const p of require('./projects').list()) {
      const s = settingsOf(p);
      if (!s) continue;
      const m = memOf(p.id);
      while (m.queue.length) {
        const op = m.queue[0];
        if (op.failedAt && Date.now() - Date.parse(op.failedAt) < RETRY_MS && !op.retryNow) break;
        const r = await doOp(p, s, m, op);
        if (r.ok) {
          m.queue.shift();
          m.error = '';
        } else {
          op.failedAt = new Date().toISOString();
          op.retryNow = false;
          op.tries = (op.tries || 0) + 1;
          m.error = r.err || 'Jira said no.';
          log.warn(`jira ${op.op} for ${p.name}: ${m.error}`);
          // A work item Jira refuses for good (after a day of tries) is dropped, so the rest can go.
          if (op.tries > 300) m.queue.shift();
          state.save();
          changed();
          break;
        }
        state.save();
        changed();
      }
    }
  } finally {
    busy = false;
  }
}
setInterval(() => pump().catch((e) => log.warn(`jira: ${e.message}`)), RETRY_MS).unref?.();

// Try the waiting changes again now (the box's Retry button).
function retry() {
  for (const p of require('./projects').list()) for (const q of memOf(p.id).queue) q.retryNow = true;
  return pump();
}

async function doOp(p, s, m, op) {
  if (op.op === 'create') return create(p, s, m, op.id);
  if (op.op === 'links') return linkAll(p, m);
  const key = jiraOf(op.id).key;
  if (!key) return { ok: true }; // never made it to Jira (or was taken off): nothing to do
  if (op.op === 'comment')
    return withFile(op.text, (f) => run(['jira', 'workitem', 'comment', 'create', `--key=${key}`, `--body-file=${f}`]));
  if (op.op === 'done') {
    const text = await doneText(op);
    const c = await withFile(text, (f) => run(['jira', 'workitem', 'comment', 'create', `--key=${key}`, `--body-file=${f}`]));
    if (!c.ok) return c;
    op.op = 'close'; // the comment is in: only the move is left, if it has to be tried again
    return close(key, s);
  }
  if (op.op === 'close') return close(key, s);
  return { ok: true };
}

const close = (key, s) => run(['jira', 'workitem', 'transition', `--key=${key}`, `--status=${s.doneStatus}`, '--yes']);

async function ensureEpic(p, s, m) {
  if (s.epic === 'NONE') return { ok: true, key: '' };
  if (s.epic !== 'AUTO') return { ok: true, key: s.epic };
  if (m.epic && m.epicFor === s.key) return { ok: true, key: m.epic };
  const r = await withFile(`Hands-on tasks for "${p.name}", tracked in Task Desk.`, (f) =>
    run([
      'jira',
      'workitem',
      'create',
      `--project=${s.key}`,
      '--type=Epic',
      `--summary=${p.name}`,
      `--description-file=${f}`,
      ...(s.labels.length ? [`--label=${s.labels.join(',')}`] : []),
      '--json',
    ])
  );
  const key = r.ok && keyFrom(r.out, s.key);
  if (!key) return { ok: false, err: r.err || "Jira didn't say which epic it made." };
  m.epic = key;
  m.epicFor = s.key;
  return { ok: true, key };
}

// What goes in a work item's description: the task, its plan's steps, where it came from.
function description(t) {
  const plan = ctx.plan ? ctx.plan(t) : null;
  const lines = [String(t.text || t.title)];
  if (plan && plan.summary) lines.push('', plan.summary);
  if (plan && plan.steps && plan.steps.length) lines.push('', 'Steps:', ...plan.steps.map((x, i) => `${i + 1}. ${x.text}`));
  lines.push('', `From Task Desk${t.lane && t.lane !== 'my-list' ? ` (${t.lane})` : ''}.`);
  return lines.join('\n').slice(0, 30000);
}

async function create(p, s, m, id) {
  const j = jiraOf(id);
  if (j.key || j.want === false) return { ok: true };
  const t = ctx.findTask(id);
  if (!t) return { ok: true }; // gone from the checklist before it was sent
  const epic = await ensureEpic(p, s, m);
  if (!epic.ok) return epic;
  const r = await withFile(description(t), (f) =>
    run([
      'jira',
      'workitem',
      'create',
      `--project=${s.key}`,
      `--type=${s.type}`,
      `--summary=${clip(t.title, 250)}`,
      `--description-file=${f}`,
      `--label=${['task-desk', ...s.labels].join(',')}`,
      ...(epic.key ? [`--parent=${epic.key}`] : []),
      '--json',
    ])
  );
  const key = r.ok && keyFrom(r.out, s.key);
  if (!key) return { ok: false, err: r.err || "Jira didn't say which work item it made." };
  j.key = key;
  j.at = new Date().toISOString();
  // (A Done or Skip while it waited is already queued behind it: see finished().)
  m.queue.push({ op: 'links' });
  return { ok: true };
}

// "Blocks" links between work items, from what the tasks wait for (order.js).
async function linkAll(p, m) {
  const needs = ctx.needsFor(p.id) || {};
  for (const [id, list] of Object.entries(needs)) {
    const to = jiraOf(id).key;
    if (!to) continue;
    for (const other of list) {
      const from = jiraOf(other).key;
      const pair = `${from}>${to}`;
      if (!from || m.links.includes(pair)) continue;
      const r = await run(['jira', 'workitem', 'link', 'create', `--out=${from}`, `--in=${to}`, '--type=Blocks', '--yes']);
      if (!r.ok) return r;
      m.links.push(pair);
    }
  }
  return { ok: true };
}

// The Done comment: notes, what was pasted, the steps, and what the chat did.
async function doneText(op) {
  const e = op.entry || {};
  const lines = ['Done in Task Desk.'];
  if (e.ticked) lines.push(`Steps done: ${e.ticked}.`);
  if (e.notes) lines.push('', 'Notes:', String(e.notes).slice(0, 4000));
  for (const r of e.results || []) lines.push('', `${r.label}:`, String(r.value).slice(0, 2000));
  if (ctx.summary) {
    try {
      const s = await ctx.summary(op.id);
      if (s) lines.push('', 'What the chat did:', s);
    } catch (err) {
      log.warn(`jira: no chat summary for ${op.id}: ${err.message}`);
    }
  }
  return lines.join('\n').slice(0, 30000);
}

// ---------- what the rest of the app calls ----------

// After every re-read: new tasks of a project that sends everything go to Jira.
function ensure(tasks) {
  for (const t of tasks) {
    const s = settingsOf(t.project);
    if (!s || s.pick !== 'all' || !state.isOpen(t.id)) continue;
    const j = jiraOf(t.id);
    if (j.want === undefined) {
      j.want = true;
      enqueue(t.project, { op: 'create', id: t.id });
    }
  }
}

// Open tasks the user hasn't decided about yet ('ask' projects), for the box's picker.
const undecided = (tasks) =>
  tasks.filter((t) => {
    const s = settingsOf(t.project);
    return s && s.pick === 'ask' && state.isOpen(t.id) && !jiraOf(t.id).key && jiraOf(t.id).want === undefined;
  });

// The user's choice for each task: true = to Jira, false = not.
function choose(choices) {
  for (const [id, want] of Object.entries(choices || {})) {
    const t = ctx.findTask(id);
    if (!t || !settingsOf(t.project)) continue;
    const j = jiraOf(id);
    j.want = !!want;
    if (want && !j.key) enqueue(t.project, { op: 'create', id });
  }
  state.save();
  changed();
}

function finished(t, status, entry) {
  if (!settingsOf(t.project)) return;
  const j = jiraOf(t.id);
  if (!j.key && !(j.want && memOf(t.project).queue.some((q) => q.op === 'create' && q.id === t.id))) return;
  if (status === 'done')
    enqueue(t.project, { op: 'done', id: t.id, entry: { notes: entry.notes, results: entry.results, ticked: entry.ticked } });
  else enqueue(t.project, { op: 'comment', id: t.id, text: `Skipped in Task Desk.${entry.notes ? `\n\nNotes:\n${entry.notes}` : ''}` });
}

function snoozed(t, until, reason) {
  if (!settingsOf(t.project) || !jiraOf(t.id).key) return;
  const day = new Date(until).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  enqueue(t.project, { op: 'comment', id: t.id, text: `Snoozed in Task Desk until ${day}.${reason ? `\n\n${reason}` : ''}` });
}

// The tasks' order changed: new "Blocks" links, if any.
function relink(pid) {
  if (settingsOf(pid) && Object.values(state.store(pid).tasks || {}).some((x) => x.jira && x.jira.key)) enqueue(pid, { op: 'links' });
}

// For a card: its work item (or that it's on its way).
function cardInfo(t) {
  const s = settingsOf(t.project);
  if (!s) return null;
  const j = jiraOf(t.id);
  const site = siteOf();
  return {
    key: j.key || '',
    want: j.want === undefined ? null : j.want,
    url: j.key && site ? `https://${site}/browse/${j.key}` : '',
  };
}

// For the box: how a project's Jira is doing.
function statusOf(pid) {
  const s = settingsOf(pid);
  if (!s) return null;
  const m = memOf(pid);
  return { key: s.key, waiting: m.queue.length, error: m.error || '', installed: !!locate() };
}

// The Jira site (yourcompany.atlassian.net), from this computer's settings.
const siteOf = () => {
  const s = String(config.get().jiraSite || '')
    .trim()
    .toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$/.test(s) ? s : '';
};

// "Check my Jira connection": is acli there, is it signed in, which site.
async function check() {
  if (!locate())
    return {
      ok: false,
      installed: false,
      text: `Atlassian's CLI (acli) isn't on this computer yet. Install it in PowerShell:\n\n  New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\\Programs\\acli"\n  ${INSTALL}\n\nthen sign in once:\n\n  & "$env:LOCALAPPDATA\\Programs\\acli\\acli.exe" jira auth login --web`,
    };
  const r = await run(['jira', 'auth', 'status']);
  const text = `${r.out || ''}\n${r.err || ''}`.trim();
  const m = text.match(/([a-z0-9][a-z0-9-]{0,62}\.atlassian\.net)/i);
  if (r.ok && m) config.set({ jiraSite: m[1].toLowerCase() });
  return { ok: r.ok, installed: true, site: siteOf(), text: text.slice(0, 600) || (r.ok ? 'Signed in.' : 'Not signed in.') };
}

module.exports = {
  KEY,
  ITEM,
  INSTALL,
  cleanSettings,
  settingsOf,
  locate,
  run,
  keyFrom,
  description,
  use,
  onChange,
  pump,
  retry,
  ensure,
  undecided,
  choose,
  finished,
  snoozed,
  relink,
  cardInfo,
  statusOf,
  siteOf,
  check,
  _setRunner: (fn) => (runner = fn),
};
