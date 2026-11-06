// Keeps Task Desk up to date with the template on GitHub.
//
// The app folder is a git clone of the release branch. Every day at 7 AM (or soon after startup, if
// the computer was off at 7) it asks GitHub whether there's a newer version.
// When there is, it installs it at a quiet moment (see update-flow.js): updates that
// only change the screens just refresh the open windows, and the chats keep
// running; others restart the desk and reopen the task windows you had open,
// with their chats picking up where they left off. "Restart to update" in the
// ⋯ menu installs it straight away. Quitting the desk also installs it.
//
// It only ever fast-forwards: if this copy has its own changes or commits
// (someone is working on the code here), it leaves it alone. Your data never
// changes: data/ is not part of the repo.
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');
const { where } = require('./sessions');

// git and node by their full paths (never a git.exe that happens to sit in the app's folder).
const gitExe = () => where('git').find((h) => /\.exe$/i.test(h)) || null;

const HOUR = 60 * 60 * 1000;
const RUN_AT = 7; // 7 AM, local time
const DEPS = ['package.json', 'package-lock.json'];
// Files the running app never reads (notes, tests): updating them needs nothing.
const NOTHING = (f) => /\.md$/i.test(f) || /^(test|test-fixtures|docs)\//.test(f) || f === '.gitignore';
// Screen files: open windows just refresh, and the chats keep running.
const SCREEN = (f) => f.startsWith('src/renderer/') || f === 'src/preload.js';

// How an update with these changed files goes in:
//  'none'    nothing to do once the files are there
//  'refresh' the windows refresh in place (a quick blink), chats keep running
//  'restart' the desk restarts and reopens your task windows, chats resume
//  'deps'    like 'restart', plus "npm install" by the helper after the desk closes
function kindOf(files) {
  if (files.some((f) => DEPS.includes(f))) return 'deps';
  if (files.every(NOTHING)) return 'none';
  if (files.every((f) => NOTHING(f) || SCREEN(f))) return 'refresh';
  return 'restart';
}

function git(root, args, timeout = 60000) {
  const exe = gitExe();
  if (!exe) return Promise.resolve({ ok: false, out: '', err: "git wasn't found" });
  return new Promise((resolve) => {
    execFile(exe, args, { cwd: root, timeout, windowsHide: true }, (err, out, errOut) => {
      resolve({ ok: !err, out: String(out || '').trim(), err: String(errOut || (err && err.message) || '').trim() });
    });
  });
}

// What GitHub has compared with this copy.
async function status(root, { fetch = true } = {}) {
  if (!fs.existsSync(path.join(root, '.git')))
    return { ok: false, reason: "This copy of Task Desk wasn't installed with git, so it can't update itself." };
  if (fetch) {
    const f = await git(root, ['fetch', '--quiet', 'origin']);
    if (!f.ok) return { ok: false, reason: `Couldn't reach GitHub: ${f.err.split('\n')[0]}` };
  }
  const up = await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!up.ok) return { ok: false, reason: "This copy isn't linked to a branch on GitHub." };
  const count = async (range) => parseInt((await git(root, ['rev-list', '--count', range])).out, 10) || 0;
  const behind = await count('HEAD..@{u}');
  const ahead = await count('@{u}..HEAD');
  const dirty = (await git(root, ['status', '--porcelain', '--untracked-files=no'])).out !== '';
  const changes = behind ? (await git(root, ['log', '--format=%s', '-n', '8', 'HEAD..@{u}'])).out.split('\n').filter(Boolean) : [];
  const files = behind ? (await git(root, ['diff', '--name-only', 'HEAD', '@{u}'])).out.split('\n').filter(Boolean) : [];
  // The exact version to install, and whether its signature is one this copy trusts.
  const target = (await git(root, ['rev-parse', '@{u}'])).out;
  const signed = behind ? await signedBy(root, target) : { required: false, ok: true };
  return {
    ok: true,
    upstream: up.out,
    target,
    behind,
    ahead,
    dirty,
    changes,
    signed,
    deps: files.some((f) => DEPS.includes(f)),
    kind: behind ? kindOf(files) : 'none',
    canInstall: behind > 0 && ahead === 0 && !dirty && signed.ok,
  };
}

// ---------- signed updates ----------
// tools/allowed_signers lists the keys whose signature an update needs (the
// maintainer's signing keys). The list is read from the copy that's installed
// now, never from the update being checked, so an update can't vouch for
// itself: someone who could push to GitHub but doesn't have the key on the
// maintainer's computer can't get code installed. The newest commit of the
// update must carry a good signature from one of those keys; it covers
// everything before it. A copy without the list installs nothing: a missing
// list never means "skip the check".
//
// Changing keys: a new key is added to the list in an update signed with the
// current key, and a key is retired (lost, leaked, or replaced) by an update,
// signed with a key that stays on the list, that removes it. See SECURITY.md.
const SIGNERS = (root) => path.join(root, 'tools', 'allowed_signers');
async function signedBy(root, sha) {
  const list = SIGNERS(root);
  if (!fs.existsSync(list))
    return {
      required: true,
      ok: false,
      why: "This copy has no list of trusted signing keys (tools/allowed_signers), so it can't check updates. Reinstall it from GitHub (see the README).",
    };
  const keygen = where('ssh-keygen').find((h) => /\.exe$/i.test(h));
  if (!keygen) return { required: true, ok: false, why: "ssh-keygen (part of Windows' OpenSSH, and of Git) wasn't found" };
  const r = await git(root, [
    '-c',
    'gpg.format=ssh',
    '-c',
    `gpg.ssh.allowedSignersFile=${list}`,
    '-c',
    `gpg.ssh.program=${keygen}`,
    'verify-commit',
    '--raw',
    sha,
  ]);
  const good = r.ok && /Good "git" signature/i.test(r.err) && !/No principal matched/i.test(r.err);
  const why = good
    ? ''
    : /No principal matched|Good "git" signature/i.test(r.err)
      ? `It's signed, but with a key that isn't on this copy's list (${sha.slice(0, 7)}).`
      : `The newest commit (${sha.slice(0, 7)}) has no valid signature.`;
  return { required: true, ok: good, why };
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
  return where('node').find((h) => /\.exe$/i.test(h) && fs.existsSync(h)) || null;
}

// Start the helper that installs the update once this app has quit, then
// (optionally) reopens it. Returns false if it can't run here.
// target: the exact version that was checked (status().target); only that one is installed.
function startHelper({ root, relaunch, electron, log, target }) {
  const node = findNode();
  if (!node) return false;
  const args = [path.join(__dirname, 'update-helper.js'), root, String(process.pid), relaunch ? '1' : '0', electron, log, target || ''];
  const child = spawn(node, args, {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return true;
}

// Install while the app is running, when the packages didn't change: a plain
// fast-forward of the app's files to the version that was checked (target), so
// nothing pushed after the check gets in. The caller restarts the app afterwards.
function pullNow(root, target) {
  const exe = gitExe();
  if (!exe) return { ok: false, error: "git wasn't found" };
  try {
    const args = /^[0-9a-f]{40,64}$/.test(target || '') ? ['merge', '--ff-only', '--quiet', target] : ['pull', '--ff-only', '--quiet'];
    execFileSync(exe, args, { cwd: root, timeout: 120000, windowsHide: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.stderr || e.message).split('\n')[0] };
  }
}

module.exports = { status, kindOf, lastRunTime, msUntilNextRun, startHelper, pullNow, findNode, HOUR };
