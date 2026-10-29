// Projects besides the Idea Factory. A project is a folder plus a few choices:
//  - where its tasks come from: a checklist file (read only) and/or tasks Nick
//    types into the box ("My list")
//  - where Done notes go: a file in the project folder, or kept in Task Desk
//  - whether the chat may change files in the folder, and notes for the planner
// Task ids are "<project id>_<hash>", so each project's ticks and notes live in
// its own state file (see state.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const state = require('./state');
const { readChecklist, toTasks } = require('./tasks');

const COLORS = ['#c96442', '#2f6fae', '#4f7a5a', '#8a4a87', '#a87414', '#2f8580', '#b0587a', '#6a68b0'];
const FACTORY_COLOR = '#9a9184';
// Files that usually hold a to-do list, checked in this order when Nick picks a folder.
const CANDIDATES = ['NEEDS_NICK.md', 'ops/NEEDS_NICK.md', 'TODO.md', 'todo.md', 'TASKS.md', 'tasks.md', 'CHECKLIST.md', 'docs/TODO.md', 'README.md'];

const list = () => config.get().projects || [];
const get = (id) => list().find((p) => p.id === id) || null;

const inside = (file, folder) => {
  const rel = path.relative(path.resolve(folder), path.resolve(file));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};
const isFactoryPath = (p) => {
  const live = path.resolve(config.get().livePath);
  return path.resolve(p).toLowerCase() === live.toLowerCase() || inside(p, live);
};

const folderOk = (p) => !!p.folder && fs.existsSync(p.folder);
const missing = (p) => !!p.folder && !fs.existsSync(p.folder);

// The folder the planner and the chat work in.
function workDir(p) {
  if (folderOk(p)) return p.folder;
  const d = path.join(config.PROJECTS_DIR, p.id, 'work');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function tasksFile(p) {
  if (p.source !== 'file' || !p.tasksFile) return null;
  return path.isAbsolute(p.tasksFile) ? p.tasksFile : path.join(p.folder || '', p.tasksFile);
}

function resultsFile(p) {
  if (p.results === 'file' && p.folder) return path.resolve(p.folder, p.resultsFile || 'FROM_NICK.md');
  return path.join(config.PROJECTS_DIR, p.id, 'results.md');
}

function read(p) {
  const dir = workDir(p);
  const raw = [];
  const f = tasksFile(p);
  if (f) raw.push(...readChecklist(f, p.onlyMine));
  for (const a of state.store(p.id).added || []) raw.push({ id: a.id, lane: 'my-list', text: a.text });
  const extra = {
    project: p.id, projectName: p.name, planNotes: p.notes || '', allowEdits: !!p.allowEdits, ai: p.ai || '',
    sourceFile: f, projectFolder: p.folder || '',
  };
  return toTasks(raw, () => ({ laneDir: dir, workDir: dir }), p.id + '_').map((t) => ({ ...t, ...extra }));
}

// "Quick add": a task typed into the box, kept in the project's own state file.
function addTask(pid, text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!clean || !get(pid)) return null;
  const st = state.store(pid);
  const id = `${pid}_q${crypto.randomBytes(4).toString('hex')}`;
  st.added = [...(st.added || []), { id, text: clean, at: new Date().toISOString() }];
  state.flush();
  return id;
}

// Checks a project from the editor and fills in defaults. Returns {ok, project} or {ok:false, error}.
function clean(d) {
  const p = {
    id: d.id && get(d.id) ? d.id : 'p' + crypto.randomBytes(3).toString('hex'),
    name: String(d.name || '').trim().slice(0, 40),
    folder: d.folder ? path.resolve(String(d.folder).trim()) : '',
    source: d.source === 'file' ? 'file' : 'list',
    tasksFile: String(d.tasksFile || '').trim(),
    onlyMine: !!d.onlyMine,
    results: d.results === 'file' ? 'file' : 'app',
    resultsFile: String(d.resultsFile || 'FROM_NICK.md').trim() || 'FROM_NICK.md',
    allowEdits: !!d.allowEdits,
    // Which AI runs its chats and plans ('' = the desk's choice). See ai.js.
    ai: ['claude', 'codex', 'gemini'].includes(d.ai) ? d.ai : '',
    notes: String(d.notes || '').slice(0, 4000),
    color: COLORS.includes(d.color) ? d.color : COLORS[list().length % COLORS.length],
    // Its own look (colors, frame…) instead of the desk's. Only the changed settings are kept.
    ownLook: !!d.ownLook,
    look: (d.id && get(d.id) && get(d.id).look) || null,
  };
  if (p.ownLook && !p.look) p.look = { accent: p.color };
  if (!p.name) return { ok: false, error: 'Give the project a name.', field: 'name' };
  if (p.folder && !(fs.existsSync(p.folder) && fs.statSync(p.folder).isDirectory())) return { ok: false, error: 'That folder doesn\'t exist on this computer.', field: 'folder' };
  if (p.source === 'file') {
    if (!p.tasksFile) return { ok: false, error: 'Pick the checklist file, or choose "Only tasks I add here".', field: 'tasksFile' };
    const f = path.isAbsolute(p.tasksFile) ? p.tasksFile : path.join(p.folder, p.tasksFile);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return { ok: false, error: 'Can\'t find that checklist file.', field: 'tasksFile' };
    // Keep it relative to the folder when it lives there, so the folder can move.
    if (p.folder && inside(f, p.folder)) p.tasksFile = path.relative(p.folder, f);
  }
  if (p.results === 'file') {
    if (!p.folder) return { ok: false, error: 'Pick the project folder first, or keep the notes in Task Desk.', field: 'results' };
    if (isFactoryPath(p.folder)) return { ok: false, error: 'The Idea Factory folder is read-only. Keep the notes in Task Desk instead.', field: 'results' };
    const f = path.resolve(p.folder, p.resultsFile);
    if (!inside(f, p.folder)) return { ok: false, error: 'The results file has to be inside the project folder.', field: 'resultsFile' };
    if (!/\.(md|txt)$/i.test(f)) return { ok: false, error: 'The results file should be a .md or .txt file.', field: 'resultsFile' };
    p.resultsFile = path.relative(p.folder, f);
  }
  return { ok: true, project: p };
}

function save(draft) {
  const r = clean(draft);
  if (!r.ok) return r;
  const all = list();
  const i = all.findIndex((x) => x.id === r.project.id);
  const next = i >= 0 ? all.map((x, j) => (j === i ? r.project : x)) : [...all, r.project];
  config.set({ projects: next });
  return { ...r, created: i < 0 };
}

// A change made in the look panel while this project is showing.
function setLook(id, patch) {
  const all = list();
  const p = all.find((x) => x.id === id);
  if (!p) return null;
  p.look = { ...(p.look || {}), ...patch };
  config.set({ projects: all });
  return p.look;
}

function setOwnLook(id, on) {
  const all = list();
  const p = all.find((x) => x.id === id);
  if (!p) return;
  p.ownLook = on;
  if (on && !p.look) p.look = { accent: p.color };
  config.set({ projects: all });
}

function remove(id) {
  const patch = { projects: list().filter((p) => p.id !== id) };
  if (config.get().view === id) patch.view = 'all';
  config.set(patch);
}

// What the editor shows under the checklist field: how many tasks it found.
function preview(d) {
  const r = clean({ ...d, results: 'app' });
  if (!r.ok) return r;
  const p = r.project;
  if (p.source !== 'file') return { ok: true, count: 0, titles: [] };
  const tasks = toTasks(readChecklist(tasksFile(p), p.onlyMine), () => ({}));
  return { ok: true, count: tasks.length, titles: tasks.slice(0, 3).map((t) => t.title) };
}

// After Nick picks a folder: a name and the likeliest checklist file.
function suggest(folder) {
  const out = { name: path.basename(folder || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), tasksFile: '', factory: !!folder && isFactoryPath(folder) };
  for (const c of CANDIDATES) {
    const f = path.join(folder, c);
    try { if (fs.statSync(f).isFile() && /^\s*[-*]\s+\[ \]/m.test(fs.readFileSync(f, 'utf8'))) { out.tasksFile = c; break; } } catch {}
  }
  return out;
}

// The box's project list (Idea Factory first), with open-task counts filled in by main.js.
function summary() {
  return [
    { id: 'factory', name: 'Idea Factory', color: FACTORY_COLOR, kind: 'factory' },
    ...list().map((p) => ({ id: p.id, name: p.name, color: p.color, kind: p.source, missing: missing(p) })),
  ];
}

const colorOf = (id) => (id === 'factory' ? FACTORY_COLOR : (get(id) || {}).color || FACTORY_COLOR);

module.exports = { COLORS, list, get, read, addTask, save, setLook, setOwnLook, remove, preview, suggest, summary, colorOf, tasksFile, resultsFile, missing, isFactoryPath };
