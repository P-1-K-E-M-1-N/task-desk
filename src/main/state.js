// App memory: status, ticked steps, notes, pasted results, snoozes and the chat
// session each task uses. Keyed by task id (a hash of lane + title), so it
// survives the factory regenerating NEEDS_NICK.md.
// Each project keeps its own file:
//  - lanes workspace: state.json (live) or state.test.json (test mode)
//  - other projects: projects/<project id>/state.json
// Project task ids start with "<project id>_", which is how a task finds its file.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const log = require('./log');

const stores = new Map(); // 'factory' or project id -> { file, data, written }
const api = { state: null }; // the lanes workspace's memory

function load(file) {
  let data = { tasks: {}, everScanned: false };
  try {
    data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {}
  return { file, data, written: JSON.stringify(data, null, 2) };
}

function use(mode) {
  if (stores.has('factory')) flush();
  const s = load(path.join(config.DATA_DIR, mode === 'live' ? 'state.json' : 'state.test.json'));
  stores.set('factory', s);
  api.state = s.data;
}

const projectOf = (id) => (String(id).includes('_') ? String(id).split('_')[0] : 'factory');

function store(key) {
  if (!stores.has(key)) stores.set(key, load(path.join(config.PROJECTS_DIR, key, 'state.json')));
  return stores.get(key).data;
}

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
// Writes every file that changed (unchanged files are left alone, which keeps OneDrive quiet).
function flush() {
  clearTimeout(timer);
  for (const s of stores.values()) {
    const json = JSON.stringify(s.data, null, 2);
    if (json === s.written) continue;
    try {
      fs.mkdirSync(path.dirname(s.file), { recursive: true });
      fs.writeFileSync(s.file + '.tmp', json);
      fs.renameSync(s.file + '.tmp', s.file);
      s.written = json;
    } catch (err) {
      log.error(`couldn't save ${s.file}`, err);
    }
  }
}

function task(id) {
  const s = store(projectOf(id));
  if (!s.tasks[id]) s.tasks[id] = { status: 'open', ticks: {}, pastes: {}, notes: '', firstSeen: new Date().toISOString() };
  return s.tasks[id];
}
const has = (id) => !!store(projectOf(id)).tasks[id];
const allTasks = () => [...stores.values()].flatMap((s) => Object.values(s.data.tasks));

function update(id, patch) {
  Object.assign(task(id), patch);
  save();
  return task(id);
}

function isOpen(id) {
  const t = store(projectOf(id)).tasks[id];
  if (!t || t.status === 'open') return true;
  if (t.status === 'snoozed') {
    if (new Date(t.snoozeUntil) <= new Date()) {
      t.status = 'open';
      save();
      return true;
    }
    return false;
  }
  return false;
}

use(config.get().mode);
module.exports = Object.assign(api, {
  use,
  store,
  projectOf,
  task,
  has,
  allTasks,
  update,
  isOpen,
  save,
  flush,
  file: () => stores.get('factory').file,
});
