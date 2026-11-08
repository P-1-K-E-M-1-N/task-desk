// Which task's chat is editing which file, while chats run. Several task
// windows can work in one project at once; without this they could both change
// the same file and overwrite each other. Claude Code asks (through the hook in
// src/mcp/taskdesk-hook.js) before every edit, and the app says yes or no:
//
//   - a file nobody holds, or one this chat already holds: yes, and it's held;
//   - a file another chat holds while that chat is busy: no, with who has it;
//   - a file another chat holds while that chat is idle (finished its reply,
//     waiting for the user): it changes hands, since nobody is in it right now.
//
// Claims live in memory only: a chat that stops lets go of its files. One
// project at a time: chats in different projects never meet.
const path = require('path');
const attention = require('./attention');

const byProject = new Map(); // project -> Map(file key -> { task, file, since })
// Bumped on every change in a project (claims, statuses): chats are told
// "meanwhile…" with their next tool result when it moved.
const versions = new Map();
const bump = (project) => versions.set(project, (versions.get(project) || 0) + 1);
const version = (project) => versions.get(project) || 0;

const keyOf = (file) => path.resolve(String(file)).toLowerCase();

function claim(project, task, file) {
  if (!byProject.has(project)) byProject.set(project, new Map());
  const m = byProject.get(project);
  const k = keyOf(file);
  const h = m.get(k);
  if (h && h.task === task) return { ok: true };
  if (h && attention.needs(h.task) !== 'turn') return { ok: false, holder: h };
  m.set(k, { task, file: path.resolve(String(file)), since: Date.now() });
  bump(project);
  return { ok: true, tookOver: h ? h.task : null };
}

// The chat ended or the task was finished: its files are free.
function release(task) {
  for (const [project, m] of byProject) {
    let changed = false;
    for (const [k, h] of m)
      if (h.task === task) {
        m.delete(k);
        changed = true;
      }
    if (changed) bump(project);
  }
}

// Files held in a project, by chats other than `exceptTask`.
const held = (project, exceptTask) => [...(byProject.get(project) || new Map()).values()].filter((h) => h.task !== exceptTask);
// Files one chat holds.
const holdings = (task) => [...byProject.values()].flatMap((m) => [...m.values()]).filter((h) => h.task === task);

module.exports = { claim, release, held, holdings, version, bump };
