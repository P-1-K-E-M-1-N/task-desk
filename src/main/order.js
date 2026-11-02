// The order the box lists a project's tasks in, and a rough "how far to the
// goal" line for it.
//
// One AI run per project reads its open tasks (and, briefly, the project's own
// files) and says which tasks have to wait for others ("make the account"
// before "paste its key"), plus a rough percent toward the project's end goal.
// The box lists tasks that are free to do first, A to Z (urgent ones on top), and each
// waiting task comes after the ones it needs. A task added later can slot in
// ahead of older ones. The run happens again only when the open tasks change,
// and it can be turned off in the ⋯ menu ("Put my tasks in order").
const { EventEmitter } = require('events');
const crypto = require('crypto');
const config = require('./config');
const state = require('./state');
const planner = require('./planner');
const log = require('./log');

const events = new EventEmitter();
const MAX_TASKS = 60;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['order', 'progress'],
  properties: {
    order: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'needs'],
        properties: { id: { type: 'string' }, needs: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } },
      },
    },
    progress: {
      type: 'object',
      additionalProperties: false,
      required: ['percent', 'goal'],
      properties: { percent: { type: 'integer' }, goal: { type: 'string' }, why: { type: 'string' } },
    },
  },
};

const on = () => config.get().orderTasks !== false;
const keyOf = (t) => t.project || 'factory';
// Urgent ones (bold in the to-do file) first and low-priority ones last, else A to Z.
const tier = (t) => (t.important ? 0 : t.low ? 2 : 1);
const byTitle = (a, b) => tier(a) - tier(b) || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
// Changes when a project's open tasks (or their wording) change.
const stampOf = (open) =>
  crypto
    .createHash('sha1')
    .update(
      open
        .map((t) => `${t.id}:${t.textHash}`)
        .sort()
        .join('|')
    )
    .digest('hex')
    .slice(0, 16);

// Tasks in the order to do them: a task comes after every task it needs, and
// among the ones free to do at the same time, urgent first, then A to Z, then low-priority. needs = { id: [ids] };
// ids that aren't open any more are ignored, and a loop (A needs B needs A) is
// broken A to Z rather than hiding either task.
function sortTasks(list, needs = {}) {
  const ids = new Set(list.map((t) => t.id));
  const waits = new Map(list.map((t) => [t.id, new Set((needs[t.id] || []).filter((n) => n !== t.id && ids.has(n)))]));
  const left = [...list].sort(byTitle);
  const out = [];
  const placed = new Set();
  while (left.length) {
    let i = left.findIndex((t) => [...waits.get(t.id)].every((n) => placed.has(n)));
    if (i < 0) i = 0; // a loop: take the first one A to Z
    const [t] = left.splice(i, 1);
    out.push(t);
    placed.add(t.id);
  }
  return out;
}

// What the AI said for a project, kept in its state file.
const saved = (key) => state.store(key).order || null;

// The needs of every open task, from each project's last run.
function needsFor(open) {
  const needs = {};
  if (!on()) return needs;
  for (const key of new Set(open.map(keyOf))) Object.assign(needs, (saved(key) || {}).needs || {});
  return needs;
}

// For a card: the open tasks it waits for (titles) and why.
function waitsOn(t, open) {
  const o = on() && saved(keyOf(t));
  if (!o || !o.needs || !o.needs[t.id]) return null;
  const titles = o.needs[t.id].map((id) => (open.find((x) => x.id === id) || {}).title).filter(Boolean);
  return titles.length ? { titles, why: (o.why && o.why[t.id]) || '' } : null;
}

// The goal line for one project: the AI's rough percent when there is one,
// otherwise the share of its tasks that are done.
function progress(key, counts) {
  const o = saved(key);
  if (on() && o && o.progress) return { ...o.progress, from: 'ai', at: o.at, stale: o.stamp !== stamp.get(key) };
  const total = counts.open + counts.done;
  return { percent: total ? Math.round((counts.done / total) * 100) : 0, goal: '', from: 'tasks' };
}

function prompt(open, done) {
  const who = config.who();
  const list = open
    .slice(0, MAX_TASKS)
    .map((t) => {
      const c = planner.cached(t);
      return `- id: ${t.id}\n  task: ${t.text.slice(0, 300)}${c && c.plan ? `\n  plan: ${c.plan.summary}` : ''}`;
    })
    .join('\n');
  const finished = done.length ? `\nALREADY DONE (most recent last):\n${done.map((d) => `- ${d}`).join('\n')}\n` : '';
  const p = open[0];
  const notes = p.planNotes ? `\nNOTES ABOUT THE PROJECT: ${p.planNotes.slice(0, 1500)}\n` : '';
  return `These are the open tasks ${who} has for the project "${p.projectName || config.factoryName()}". You may skim the project's own files in this folder (README, plans, TODO) to understand where it is headed. Read only; don't run anything.
${notes}
OPEN TASKS:
${list}
${finished}
1) order: for each open task, "needs" lists the ids of the other open tasks that must be finished before it can be done (an account before using it, a decision before acting on it, a draft before sending it). Leave "needs" empty when the task can be done any time. Only real dependencies, not "nice to do first". why: one short sentence to ${who} as "you", only when "needs" isn't empty, e.g. "You need the account before you can copy its key."
2) progress: a rough guess of how far the whole project is toward its end goal, 0 to 100. Count the work the AI and others do too, not only these tasks. goal: the end goal in a few words. why: one short sentence. A rough guess is fine; it gets better as the project goes.`;
}

// ---------- running it ----------
const stamp = new Map(); // project -> stamp of its open tasks now
const queue = [];
let busy = false;
let timer = null;

// Called after every re-read. Projects whose open tasks changed since their
// last run get a new one, a few seconds later (so a burst of changes is one run).
function ensure(tasks) {
  const groups = new Map();
  for (const t of tasks) if (state.isOpen(t.id)) groups.set(keyOf(t), [...(groups.get(keyOf(t)) || []), t]);
  stamp.clear();
  for (const [key, open] of groups) stamp.set(key, stampOf(open));
  if (!on()) return;
  for (const [key, open] of groups) {
    const o = saved(key);
    if (o && o.stamp === stamp.get(key)) continue;
    const i = queue.findIndex((q) => q.key === key);
    if (i >= 0) queue.splice(i, 1);
    queue.push({ key, open });
  }
  clearTimeout(timer);
  timer = setTimeout(pump, 4000);
}

async function pump() {
  if (busy || !queue.length) return;
  busy = true;
  const { key, open } = queue.shift();
  try {
    if (stamp.get(key) === stampOf(open)) await run(key, open);
  } catch (err) {
    log.warn(`couldn't put ${key}'s tasks in order: ${err.message}`);
  } finally {
    busy = false;
    if (queue.length) setImmediate(pump);
  }
}

// run is the AI runner (tests pass a pretend one).
async function run(key, open, runAI = planner.runAI) {
  const mem = state.store(key);
  const done = Object.values(mem.tasks || {})
    .filter((t) => t.status === 'done' && t.lastTitle)
    .sort((a, b) => String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')))
    .slice(-20)
    .map((t) => t.lastTitle);
  const r = await runAI(open[0], prompt(open, done), SCHEMA);
  if (!r.plan) {
    log.warn(`ordering ${key}: ${r.error || 'no answer'}`);
    return null;
  }
  mem.order = { stamp: stampOf(open), at: new Date().toISOString(), ...clean(r.plan, open) };
  state.save();
  events.emit('ready', key);
  return mem.order;
}

// Keeps only real open ids, and a percent from 0 to 100.
function clean(plan, open) {
  const ids = new Set(open.map((t) => t.id));
  const needs = {};
  const why = {};
  for (const o of Array.isArray(plan.order) ? plan.order : []) {
    if (!o || !ids.has(o.id) || !Array.isArray(o.needs)) continue;
    const n = [...new Set(o.needs.filter((x) => ids.has(x) && x !== o.id))];
    if (!n.length) continue;
    needs[o.id] = n;
    if (typeof o.why === 'string' && o.why.trim()) why[o.id] = o.why.trim().slice(0, 300);
  }
  const p = plan.progress || {};
  const percent = Math.max(0, Math.min(100, Math.round(Number(p.percent) || 0)));
  return {
    needs,
    why,
    progress: { percent, goal: String(p.goal || '').slice(0, 120), why: String(p.why || '').slice(0, 300) },
  };
}

module.exports = { events, sortTasks, needsFor, waitsOn, progress, ensure, run, prompt, clean, stampOf, SCHEMA };
