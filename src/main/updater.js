// Keeps Task Desk up to date with the template on GitHub.
//
// The app folder is a git clone. Every day at 7 AM (or soon after startup, if
// the computer was off at 7) it asks GitHub whether there's a newer version.
// When there is, it installs it as soon as the desk is idle (no task or
// project windows open) and reopens itself. If a window is open it waits, and
// "Restart to update" in the ⋯ menu installs it straight away. Quitting the
// desk also installs a waiting update.
//
// It only ever fast-forwards: if this copy has its own changes or commits
// (someone is working on the code here), it leaves it alone. Your data never
// changes: data/ is not part of the repo.
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');

const HOUR = 60 * 60 * 1000;
const RUN_AT = 7; // 7 AM, local time
const DEPS = ['package.json', 'package-lock.json'];

function git(root, args, timeout = 60000) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: root, timeout, windowsHide: true }, (err, out, errOut) => {
      resolve({ ok: !err, out: String(out || '').trim(), err: String(errOut || (err && err.message) || '').trim() });
    });
  });
}

// What GitHub has compared with this copy.
async function status(root, { fetch = true } = {}) {
  if (!fs.existsSync(path.join(root, '.git'))) return { ok: false, reason: 'This copy of Task Desk wasn\'t installed with git, so it can\'t update itself.' };
  if (fetch) {
    const f = await git(root, ['fetch', '--quiet', 'origin']);
    if (!f.ok) return { ok: false, reason: `Couldn't reach GitHub: ${f.err.split('\n')[0]}` };
  }
  const up = await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!up.ok) return { ok: false, reason: 'This copy isn\'t linked to a branch on GitHub.' };
  const count = async (range) => parseInt((await git(root, ['rev-list', '--count', range])).out, 10) || 0;
  const behind = await count('HEAD..@{u}');
  const ahead = await count('@{u}..HEAD');
  const dirty = (await git(root, ['status', '--porcelain', '--untracked-files=no'])).out !== '';
  const changes = behind ? (await git(root, ['log', '--format=%s', '-n', '8', 'HEAD..@{u}'])).out.split('\n').filter(Boolean) : [];
  const files = behind ? (await git(root, ['diff', '--name-only', 'HEAD', '@{u}'])).out.split('\n').filter(Boolean) : [];
  return {
    ok: true, upstream: up.out, behind, ahead, dirty, changes,
    deps: files.some((f) => DEPS.includes(f)),
    canInstall: behind > 0 && ahead === 0 && !dirty,
  };
}

// The most recent 7 AM that has passed.
function lastRunTime(now = new Date()) {
  const d = new Date(now);
  d.setHours(RUN_AT, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}
function msUntilNextRun(now = new Date()) {
  const d = new Date(now);
  d.setHours(RUN_AT, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d - now;
}

// Find the system Node.js (needed only when an update changes the app's packages).
function findNode() {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { windowsHide: true }).toString().split(/\r?\n/)[0].trim();
    return out && fs.existsSync(out) ? out : null;
  } catch { return null; }
}

// Start the helper that installs the update once this app has quit, then
// (optionally) reopens it. Returns false if it can't run here.
function startHelper({ root, relaunch, electron, log }) {
  const node = findNode();
  if (!node) return false;
  const child = spawn(node, [path.join(__dirname, 'update-helper.js'), root, String(process.pid), relaunch ? '1' : '0', electron, log], {
    cwd: root, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
  return true;
}

// Install while the app is running, when the packages didn't change: a plain
// fast-forward of the app's files. The caller restarts the app afterwards.
function pullNow(root) {
  try {
    execFileSync('git', ['pull', '--ff-only', '--quiet'], { cwd: root, timeout: 120000, windowsHide: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.stderr || e.message).split('\n')[0] };
  }
}

module.exports = { status, lastRunTime, msUntilNextRun, startHelper, pullNow, findNode, HOUR };
