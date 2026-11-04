// Finds Claude Code session files and the real claude.exe, and builds the
// environment the AI apps start with.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { aiEnv, safeId } = require('./safety');

const PROJECTS = path.join(os.homedir(), '.claude', 'projects');

// Claude Code stores sessions for C:\Projects\shop in projects\C--Projects-shop
function projectDir(folder) {
  return path.join(PROJECTS, path.resolve(folder).replace(/[^a-zA-Z0-9]/g, '-'));
}

// A session id that isn't a plain id never becomes part of a file name.
function sessionFile(folder, id) {
  return path.join(projectDir(folder), (safeId(id) ? id : 'not-a-session') + '.jsonl');
}

// Newest session for a folder, skipping the ones this app created itself.
function newestSession(folder, exclude = new Set()) {
  try {
    const dir = projectDir(folder);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl') && !exclude.has(f.slice(0, -6)) && safeId(f.slice(0, -6)))
      .map((f) => ({ id: f.slice(0, -6), t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files[0] ? files[0].id : null;
  } catch {
    return null;
  }
}

// Windows' own "where", by its full path, so a where.exe in some other folder is never used.
const WHERE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe');

// Every match for a program name on PATH, as full paths ([] when there's none).
// A match in the folder the desk was started from doesn't count.
function where(cmd) {
  let out = '';
  try {
    out = execFileSync(fs.existsSync(WHERE) ? WHERE : 'where', [cmd], { encoding: 'utf8', windowsHide: true });
  } catch {
    return [];
  }
  const here = path.resolve(process.cwd()).toLowerCase();
  return out
    .split(/\r?\n/)
    .map((h) => h.trim())
    .filter((h) => h && path.isAbsolute(h) && path.dirname(path.resolve(h)).toLowerCase() !== here);
}

// The program an npm .cmd shim starts ("%dp0%\node_modules\...\x.exe"), when
// it stays inside the shim's own folder and exists. ok: which kinds of file count.
function shimTarget(shim, ok = /\.exe$/i) {
  let text = '';
  try {
    text = fs.readFileSync(shim, 'utf8');
  } catch {
    return null;
  }
  const m = text.match(/"%dp0%\\([^"]+)"/i);
  if (!m || !ok.test(m[1])) return null;
  const dir = path.dirname(shim);
  const p = path.resolve(dir, m[1]);
  const rel = path.relative(dir, p);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return fs.existsSync(p) ? p : null;
}

// `claude` on this machine is an npm .cmd shim; launching through cmd.exe would
// mangle quotes in our arguments, so find the claude.exe it points at.
// null when Claude Code isn't installed: it's never started by its bare name.
let cached = null;
function claudeExe() {
  if (cached) return cached;
  const hits = where('claude');
  const exe = hits.find((h) => h.toLowerCase().endsWith('.exe'));
  if (exe) return (cached = exe);
  const cmd = hits.find((h) => h.toLowerCase().endsWith('.cmd'));
  return (cached = (cmd && shimTarget(cmd)) || null);
}

// The environment an AI app starts with: only what it needs to run (see
// safety.js) plus what the app adds on purpose. This also keeps out the markers
// of a Claude Code session the desk may itself have been started from, which
// would stop the child claude from saving its chat.
function cleanEnv(extra = {}) {
  const config = require('./config');
  return aiEnv(process.env, extra, config.get().passEnv);
}

module.exports = { projectDir, sessionFile, newestSession, claudeExe, cleanEnv, where, shimTarget };
