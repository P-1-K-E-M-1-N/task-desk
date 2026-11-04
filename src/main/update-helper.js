// Installs a Task Desk update after the app has quit (Windows can't replace
// the app's files while it's running), then reopens the desk if asked.
// Run by updater.js with the system Node.js:
//   node update-helper.js <appFolder> <appPid> <relaunch 0|1> <electron.exe> <logFile>
// Steps: wait for the app to close, fast-forward to the newest version, and
// reinstall the packages if they changed. If that fails, it goes back to the
// version that was there before, so the desk still opens, and leaves a note the
// desk shows next time it starts (update-problem.txt next to the log).
//
// The packages are installed with `npm ci --ignore-scripts`: exactly the
// versions (and checksums) in package-lock.json, from the public npm registry,
// and no package gets to run its own install script. The one download the app
// needs afterwards, Electron itself, is fetched by Electron's own installer,
// which checks it against the checksums shipped in the package. git, node and
// npm are used by their full paths, never through a shell.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { where } = require('./sessions');

const [root, pid, relaunch, electron, logFile] = process.argv.slice(2);
const PROBLEM = path.join(path.dirname(logFile || '.'), 'update-problem.txt');
const log = (msg) => {
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
};
const NODE = process.execPath;
const NPM_CLI = path.join(path.dirname(NODE), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const GIT = where('git').find((h) => /\.exe$/i.test(h));
const run = (exe, args) =>
  execFileSync(exe, args, { cwd: root, timeout: 10 * 60 * 1000, windowsHide: true })
    .toString()
    .trim();
const git = (args) => {
  if (!GIT) throw new Error("git wasn't found");
  return run(GIT, args);
};
// A copy set up with only what the desk needs (no developer tools, e.g. on a
// work computer) stays that way.
const NPM_CI = [
  NPM_CLI,
  'ci',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--registry=https://registry.npmjs.org/',
  ...(fs.existsSync(path.join(root, 'node_modules', 'eslint')) ? [] : ['--omit=dev']),
];
function installPackages() {
  if (!fs.existsSync(NPM_CLI)) throw new Error(`npm wasn't found next to ${NODE}`);
  run(NODE, NPM_CI);
  // Electron's own download, checked against its checksums.
  const inst = path.join(root, 'node_modules', 'electron', 'install.js');
  if (fs.existsSync(inst)) run(NODE, [inst]);
}
const alive = (p) => {
  try {
    process.kill(Number(p), 0);
    return true;
  } catch {
    return false;
  }
};
const problem = (msg) => {
  log(msg);
  try {
    fs.writeFileSync(PROBLEM, msg);
  } catch {}
};

(async () => {
  for (let i = 0; i < 120 && alive(pid); i++) await new Promise((r) => setTimeout(r, 500));
  let before = '';
  try {
    before = git(['rev-parse', 'HEAD']);
    git(['pull', '--ff-only', '--quiet']);
    const after = git(['rev-parse', 'HEAD']);
    const changed = git(['diff', '--name-only', before, after]).split(/\r?\n/);
    log(`updated ${before.slice(0, 7)} -> ${after.slice(0, 7)}`);
    if (changed.some((f) => f === 'package.json' || f === 'package-lock.json')) {
      try {
        installPackages();
        log(`npm ${NPM_CI.slice(1).join(' ')} done`);
      } catch (e) {
        log(`installing the packages failed, going back to ${before.slice(0, 7)}: ${String(e.message).split('\n')[0]}`);
        try {
          git(['reset', '--hard', before]);
          installPackages();
          problem(`The update couldn't install its packages, so Task Desk went back to the version you had (${before.slice(0, 7)}).`);
        } catch (e2) {
          problem(
            `The update failed and going back didn't work either: ${String(e2.message).split('\n')[0]}. In the Task Desk folder, run "npm ci --omit=dev --ignore-scripts" to repair it.`
          );
        }
      }
    }
  } catch (e) {
    problem(`The update failed: ${String(e.message).split('\n')[0]}`);
  }
  if (relaunch === '1' && electron && fs.existsSync(electron)) {
    spawn(electron, [root], { cwd: root, detached: true, stdio: 'ignore', windowsHide: false }).unref();
  }
})();
