// Finds Claude Code session files and the real claude.exe.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECTS = path.join(os.homedir(), '.claude', 'projects');

// Claude Code stores sessions for C:\MrC\idea-factory in projects\C--MrC-idea-factory
function projectDir(folder) {
  return path.join(PROJECTS, path.resolve(folder).replace(/[^a-zA-Z0-9]/g, '-'));
}

function sessionFile(folder, id) {
  return path.join(projectDir(folder), id + '.jsonl');
}

// Newest session for a folder, skipping the ones this app created itself.
function newestSession(folder, exclude = new Set()) {
  try {
    const dir = projectDir(folder);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl') && !exclude.has(f.slice(0, -6)))
      .map((f) => ({ id: f.slice(0, -6), t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files[0] ? files[0].id : null;
  } catch {
    return null;
  }
}

// `claude` on this machine is an npm .cmd shim; launching through cmd.exe would
// mangle quotes in our arguments, so find the claude.exe it points at.
let cached = null;
function claudeExe() {
  if (cached) return cached;
  try {
    const hits = execFileSync('where', ['claude'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
    const exe = hits.find((h) => h.toLowerCase().endsWith('.exe'));
    if (exe) return (cached = exe);
    const cmd = hits.find((h) => h.toLowerCase().endsWith('.cmd'));
    if (cmd) {
      const m = fs.readFileSync(cmd, 'utf8').match(/"%dp0%\\([^"]+\.exe)"/i);
      if (m) {
        const p = path.join(path.dirname(cmd), m[1]);
        if (fs.existsSync(p)) return (cached = p);
      }
    }
  } catch {}
  return (cached = 'claude.exe');
}

// If the app itself was started from inside a Claude Code session, the child
// claude would inherit that session's markers and refuse to save transcripts.
const KEEP = new Set(['CLAUDE_CODE_GIT_BASH_PATH']);
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if ((k === 'CLAUDECODE' || /^CLAUDE_(CODE_|PID$|EFFORT$)/.test(k)) && !KEEP.has(k)) delete env[k];
  }
  return { ...env, ...extra };
}

module.exports = { projectDir, sessionFile, newestSession, claudeExe, cleanEnv };
