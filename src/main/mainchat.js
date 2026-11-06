// A project's main chat: the user's own Claude Code session that makes the
// project's tasks, as opposed to the one-task chats in task windows.
//
// Which session is it? The one that writes the project's tasks. Claude Code
// keeps every session on this computer
// (%USERPROFILE%\.claude\projects\<folder>\<id>.jsonl), with every tool it
// used, so the desk looks for sessions that:
//  - wrote the project's checklist file (with Edit or Write, or a shell command
//    that writes to it), or for the lanes workspace one of its needs_nick files;
//  - or were given Task Desk's instructions for the project (the box's "Copy
//    for another AI chat" text: that project's text, or the set-up text in a
//    session that ran in the project's folder or names it).
// The newest such session wins, and it's remembered per computer (machine.json
// mainChats), since sessions live on this computer only. The task windows' own
// chats copy the start of the session they came from, so they're skipped.
// A session can run anywhere (many start in C:\WINDOWS\system32 and work on
// several projects), so all of them are searched, not only the project folder's.
//
// The main chat runs as plain Claude Code (`--resume <id>` in the folder the
// session ran in): no task tools and none of the task chats' limits, like
// running `claude --resume` by hand.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const projects = require('./projects');
const { sessionFile } = require('./sessions');
const { safeId } = require('./safety');

const ROOT = () => path.join(os.homedir(), '.claude', 'projects');
const MAX_AGE = 180 * 24 * 60 * 60 * 1000; // sessions older than this aren't searched
const MAX_SIZE = 80 * 1024 * 1024;
const SETUP = 'I use Task Desk, a desktop app, for the hands-on tasks';
// Text as it appears inside a session file (JSON-escaped).
const inJson = (s) => JSON.stringify(String(s)).slice(1, -1);
const same = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// A project ('factory' for the lanes workspace): its name, its folder here, and
// which files hold its tasks (taskFile(path) says whether a path is one of them).
function target(key) {
  if (key === 'factory') {
    if (!config.factoryOn()) return null;
    const root = config.root();
    return {
      key,
      name: config.factoryName(),
      folder: root,
      workspace: true,
      hint: 'needs_nick',
      taskFile: (f) => inside(f, root) && /needs_nick(_global)?\.md$/i.test(f),
      paths: [root],
    };
  }
  const p = safeId(key) && projects.get(key);
  if (!p) return null;
  const file = projects.tasksFile(p);
  return {
    key,
    name: p.name,
    folder: p.folder,
    hint: file ? path.basename(file).toLowerCase() : null,
    taskFile: (f) => !!file && same(f, file),
    paths: file ? [file] : [],
  };
}
const inside = (f, dir) => {
  if (!f || !dir) return false;
  const rel = path.relative(path.resolve(dir).toLowerCase(), path.resolve(f).toLowerCase());
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};
// A path the way a shell command may spell it: C:\a\b, C:/a/b or /c/a/b.
const spellings = (p) => {
  const w = path.resolve(p).toLowerCase();
  const f = w.split(path.sep).join('/');
  return [w, f, f.replace(/^([a-z]):/, '/$1')];
};

// Did this tool call write one of the project's task files?
const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELLS = new Set(['Bash', 'PowerShell']);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A shell command writes a file when it sends output into it (> or >>, tee,
// Set-Content, Add-Content, Out-File) or edits it in place (sed -i). Merely
// naming the file (cat, grep, a 2>/dev/null elsewhere) doesn't count.
const INTO = String.raw`(?:>>?|\btee\b(?:\s+-a)?|\bsed\s+-i[^|;&\n]*|\b(?:set-content|add-content|out-file)\b[^|;&\n]*)\s*['"]?`;
function shellWrites(cmd, t, cwd) {
  // The task file by its full path; by name only in a session that ran in the project's folder.
  const names = t.workspace
    ? t.paths.flatMap(spellings).map((s) => reEsc(s) + String.raw`[^\s'"|;&>]*needs_nick(?:_global)?\.md`)
    : [...t.paths.flatMap(spellings), ...(same(cwd, t.folder) ? [t.hint] : [])].map(reEsc);
  return names.some((n) => new RegExp(INTO + n).test(cmd));
}
function wroteTasks(use, t, cwd) {
  const input = use.input || {};
  if (EDITS.has(use.name)) return t.taskFile(String(input.file_path || input.notebook_path || ''));
  if (!SHELLS.has(use.name) || !t.hint) return false;
  const cmd = String(input.command || '').toLowerCase();
  return cmd.includes(t.hint) && shellWrites(cmd, t, cwd);
}

// Whether any tool call in a session wrote the project's tasks (only lines that name the file are read).
function writes(text, t, cwd) {
  for (const line of text.split('\n')) {
    if (!line.includes('"tool_use"') || !line.toLowerCase().includes(t.hint)) continue;
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    const content = (j.message && Array.isArray(j.message.content) && j.message.content) || [];
    if (content.some((c) => c && c.type === 'tool_use' && wroteTasks(c, t, cwd))) return true;
  }
  return false;
}

// Whether the user typed or pasted Task Desk's instructions for this project
// (not text that only shows up in a tool's output, e.g. a file the AI read):
// that project's own text, or the set-up text in a session that ran in the
// project's folder or whose message names the folder.
const markOf = (t) =>
  t.workspace ? `I now finish NEEDS_NICK items for ${t.name}` : `I track the hands-on tasks for this project, "${t.name}"`;
function typed(text, t, here) {
  const mark = markOf(t);
  const folder = t.folder ? path.resolve(t.folder).toLowerCase() : '';
  for (const line of text.split('\n')) {
    if (!line.includes('"type":"user"') || !line.includes('Task Desk')) continue;
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    const c = j.message && j.message.content;
    const said =
      typeof c === 'string'
        ? c
        : Array.isArray(c)
          ? c
              .filter((x) => x && x.type === 'text')
              .map((x) => x.text)
              .join('\n')
          : '';
    if (said.includes(mark)) return true;
    if (said.includes(SETUP) && (here || (!!folder && said.toLowerCase().includes(folder)))) return true;
  }
  return false;
}

// What a session file says about itself: the folder it ran in and the first thing the user typed.
function about(text) {
  let cwd = '';
  let first = '';
  const lines = text.split('\n', 400);
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    if (!cwd && typeof j.cwd === 'string') cwd = j.cwd;
    if (!first && j.type === 'user' && j.message) {
      const c = j.message.content;
      const s = typeof c === 'string' ? c : Array.isArray(c) ? (c.find((x) => x && x.type === 'text') || {}).text || '' : '';
      // Pasted text is wrapped in <pasted_content> tags; other <…> messages are Claude Code's own.
      const plain = s.replace(/<\/?pasted_content[^>]*>/g, ' ').trim();
      if (plain && !plain.startsWith('<')) first = plain.replace(/\s+/g, ' ').slice(0, 140);
    }
    if (cwd && first) break;
  }
  return { cwd, first };
}

// Every session on this computer (newest first), with whether it set up this project.
// exclude: the task windows' own session ids. root: tests point it elsewhere.
async function scan(t, exclude = new Set(), root = ROOT()) {
  // Quick checks on the raw file before reading its messages (the text as stored, JSON-escaped).
  const named = [inJson(markOf(t))];
  const setup = inJson(SETUP);
  let dirs = [];
  try {
    dirs = fs.readdirSync(root);
  } catch {
    return [];
  }
  const files = [];
  for (const d of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(root, d)).filter((n) => n.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const n of names) {
      const id = n.slice(0, -6);
      if (!safeId(id) || exclude.has(id)) continue;
      try {
        const st = fs.statSync(path.join(root, d, n));
        if (Date.now() - st.mtimeMs < MAX_AGE && st.size < MAX_SIZE) files.push({ id, file: path.join(root, d, n), t: st.mtimeMs });
      } catch {}
    }
  }
  files.sort((a, b) => b.t - a.t);
  const out = [];
  for (const f of files) {
    let text = '';
    try {
      text = await fs.promises.readFile(f.file, 'utf8');
    } catch {
      continue;
    }
    const a = about(text);
    if (!a.cwd) continue;
    const here = same(a.cwd, t.folder);
    // Given Task Desk's instructions for this project (typed or pasted by the user)…
    const told = (named.some((m) => text.includes(m)) || text.includes(setup)) && typed(text, t, here);
    // …or wrote its tasks.
    const setUp = told || (!!t.hint && text.toLowerCase().includes(t.hint) && writes(text, t, a.cwd));
    out.push({ id: f.id, cwd: a.cwd, first: a.first, at: f.t, setUp, here });
  }
  return out;
}

// The project's main chat on this computer: the remembered one if its session
// is still there, else the newest session that set the project up (and it's remembered).
async function find(key, exclude, root) {
  const t = target(key);
  if (!t) return null;
  const linked = (config.get().mainChats || {})[key];
  if (linked && safeId(linked.id) && fs.existsSync(sessionFile(linked.cwd, linked.id))) return linked;
  const best = (await scan(t, exclude, root)).find((s) => s.setUp);
  if (!best) return null;
  return link(key, best);
}

// Sessions to choose from: the ones that set the project up, then others that ran in its folder.
async function choices(key, exclude, root) {
  const t = target(key);
  if (!t) return [];
  const all = await scan(t, exclude, root);
  return [...all.filter((s) => s.setUp), ...all.filter((s) => !s.setUp && s.here)].slice(0, 12);
}

function link(key, s) {
  const mine = { id: s.id, cwd: s.cwd, first: s.first || '', at: s.at || Date.now() };
  config.set({ mainChats: { ...(config.get().mainChats || {}), [key]: mine } });
  return mine;
}

// A brand-new main chat in the project's folder.
function fresh(key) {
  const t = target(key);
  if (!t || !t.folder || !fs.existsSync(t.folder)) return null;
  return { ...link(key, { id: crypto.randomUUID(), cwd: t.folder, first: '' }), isNew: true };
}

// The command to start it: resume the session, or start the new one under its id.
const argsFor = (s) => (s.isNew ? ['--session-id', s.id] : ['--resume', s.id]);

module.exports = { target, about, scan, find, choices, link, fresh, argsFor };
