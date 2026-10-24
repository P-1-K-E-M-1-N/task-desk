// App memory: status, ticked steps, notes, pasted results, snoozes and the chat
// session each task uses. Keyed by task id (a hash of lane + title), so it
// survives the factory regenerating NEEDS_NICK.md.
// Live mode uses data/state.json; test mode keeps its own data/state.test.json.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const fileFor = (mode) => path.join(config.DATA_DIR, mode === 'live' ? 'state.json' : 'state.test.json');
let FILE = null;
const api = { state: null };

function use(mode) {
  if (FILE && api.state) flush();
  FILE = fileFor(mode);
  api.state = { tasks: {}, everScanned: false };
  try { api.state = { ...api.state, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
}

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
function flush() {
  clearTimeout(timer);
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(api.state, null, 2));
  fs.renameSync(tmp, FILE);
}

function task(id) {
  const s = api.state;
  if (!s.tasks[id]) s.tasks[id] = { status: 'open', ticks: {}, pastes: {}, notes: '', firstSeen: new Date().toISOString() };
  return s.tasks[id];
}
const has = (id) => !!api.state.tasks[id];

function update(id, patch) {
  Object.assign(task(id), patch);
  save();
  return task(id);
}

function isOpen(id) {
  const t = api.state.tasks[id];
  if (!t || t.status === 'open') return true;
  if (t.status === 'snoozed') {
    if (new Date(t.snoozeUntil) <= new Date()) { t.status = 'open'; save(); return true; }
    return false;
  }
  return false;
}

use(config.get().mode);
module.exports = Object.assign(api, { use, task, has, update, isOpen, save, flush, file: () => FILE });
