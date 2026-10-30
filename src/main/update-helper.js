// Installs a Task Desk update after the app has quit (Windows can't replace
// the app's files while it's running), then reopens the desk if asked.
// Run by updater.js with the system Node.js:
//   node update-helper.js <appFolder> <appPid> <relaunch 0|1> <electron.exe> <logFile>
// Steps: wait for the app to close, fast-forward to the newest version, and
// run npm install if the packages changed. If npm install fails, it goes back
// to the version that was there before, so the desk still opens.
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');

const [root, pid, relaunch, electron, logFile] = process.argv.slice(2);
const log = (msg) => {
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
};
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, timeout: 10 * 60 * 1000, windowsHide: true, shell: cmd === 'npm' })
    .toString()
    .trim();
const alive = (p) => {
  try {
    process.kill(Number(p), 0);
    return true;
  } catch {
    return false;
  }
};

(async () => {
  for (let i = 0; i < 120 && alive(pid); i++) await new Promise((r) => setTimeout(r, 500));
  const before = run('git', ['rev-parse', 'HEAD']);
  try {
    run('git', ['pull', '--ff-only', '--quiet']);
    const after = run('git', ['rev-parse', 'HEAD']);
    const changed = run('git', ['diff', '--name-only', before, after]).split(/\r?\n/);
    log(`updated ${before.slice(0, 7)} -> ${after.slice(0, 7)}`);
    if (changed.some((f) => f === 'package.json' || f === 'package-lock.json')) {
      try {
        run('npm', ['install', '--no-audit', '--no-fund']);
        log('npm install done');
      } catch (e) {
        log(`npm install failed, going back to ${before.slice(0, 7)}: ${String(e.message).split('\n')[0]}`);
        run('git', ['reset', '--hard', before]);
        try {
          run('npm', ['install', '--no-audit', '--no-fund']);
        } catch {}
      }
    }
  } catch (e) {
    log(`update failed: ${String(e.message).split('\n')[0]}`);
  }
  if (relaunch === '1' && electron && fs.existsSync(electron)) {
    spawn(electron, [root], { cwd: root, detached: true, stdio: 'ignore', windowsHide: false }).unref();
  }
})();
