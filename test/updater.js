// Checks the daily updater against a pretend GitHub: a bare git repo in a temp
// folder, an "installed" copy that should update, and an "author" copy that
// pushes new versions. Never touches the real app folder or GitHub.
// Run: node test/updater.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const updater = require('../src/main/updater');

const results = [];
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const BASE = path.join(os.tmpdir(), 'taskdesk-update-test');
const ORIGIN = path.join(BASE, 'origin.git');
const MINE = path.join(BASE, 'installed');
const AUTHOR = path.join(BASE, 'author');
const LOG = path.join(BASE, 'update.log');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, windowsHide: true }).toString().trim();
const write = (dir, f, text) => fs.writeFileSync(path.join(dir, f), text);
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const ident = (dir) => { git(dir, 'config', 'user.name', 'Test'); git(dir, 'config', 'user.email', 'test@example.com'); };
const push = (msg) => { git(AUTHOR, 'add', '-A'); git(AUTHOR, 'commit', '-q', '-m', msg); git(AUTHOR, 'push', '-q'); };
const helper = () => {
  const gone = spawnSync(process.execPath, ['-e', '0']).pid; // a process that has already exited
  return spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'main', 'update-helper.js'), MINE, String(gone), '0', '', LOG], { timeout: 180000 });
};

(async () => {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(BASE, { recursive: true });
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', ORIGIN]);
  execFileSync('git', ['clone', '-q', ORIGIN, AUTHOR]);
  ident(AUTHOR);
  git(AUTHOR, 'checkout', '-q', '-b', 'main');
  write(AUTHOR, 'package.json', JSON.stringify({ name: 'pretend-desk', version: '1.0.0', private: true }, null, 2));
  write(AUTHOR, 'app.txt', 'version 1\n');
  write(AUTHOR, '.gitignore', 'data/\nnode_modules/\npackage-lock.json\n');
  git(AUTHOR, 'add', '-A'); git(AUTHOR, 'commit', '-q', '-m', 'First version'); git(AUTHOR, 'push', '-q', '-u', 'origin', 'main');
  execFileSync('git', ['clone', '-q', ORIGIN, MINE]);
  ident(MINE);
  fs.mkdirSync(path.join(MINE, 'data'));
  write(path.join(MINE, 'data'), 'settings.json', '{"mine":true}');

  // ---- nothing new ----
  let s = await updater.status(MINE);
  ok('up to date at first', s.ok && s.behind === 0 && !s.canInstall);

  // ---- a new version on GitHub ----
  write(AUTHOR, 'app.txt', 'version 2\n');
  push('Pink task cards');
  s = await updater.status(MINE);
  ok('sees the new version', s.ok && s.behind === 1 && s.canInstall && !s.deps, JSON.stringify(s));
  ok('knows what changed', s.changes[0] === 'Pink task cards');
  const r = updater.pullNow(MINE);
  ok('installs it', r.ok && read(MINE, 'app.txt').trim() === 'version 2');
  ok('your data is untouched', read(path.join(MINE, 'data'), 'settings.json') === '{"mine":true}');
  ok('up to date afterwards', (await updater.status(MINE, { fetch: false })).behind === 0);
  write(AUTHOR, 'notes.md', 'just notes\n');
  push('Notes only');
  s = await updater.status(MINE);
  ok('status says how an update goes in', s.kind === 'none', s.kind);
  updater.pullNow(MINE);

  // ---- a copy with its own changes is left alone ----
  write(AUTHOR, 'app.txt', 'version 3\n');
  push('Version 3');
  write(MINE, 'app.txt', 'my own edit\n');
  s = await updater.status(MINE);
  ok('own changes: not installed', s.ok && s.behind === 1 && s.dirty && !s.canInstall);
  git(MINE, 'checkout', '--', 'app.txt');
  write(MINE, 'mine.txt', 'x');
  git(MINE, 'add', 'mine.txt'); git(MINE, 'commit', '-q', '-m', 'local work');
  s = await updater.status(MINE);
  ok('own commits: not installed', s.ok && s.ahead === 1 && !s.canInstall);
  git(MINE, 'reset', '-q', '--hard', 'HEAD~1');

  // ---- an update that changes the packages goes through the helper ----
  write(AUTHOR, 'package.json', JSON.stringify({ name: 'pretend-desk', version: '2.0.0', private: true }, null, 2));
  push('New packages');
  s = await updater.status(MINE);
  ok('package change is spotted', s.canInstall && s.deps);
  helper();
  ok('helper installs it', JSON.parse(read(MINE, 'package.json')).version === '2.0.0' && git(MINE, 'rev-parse', 'HEAD') === git(AUTHOR, 'rev-parse', 'HEAD'));
  ok('helper ran npm install', /npm install done/.test(fs.readFileSync(LOG, 'utf8')));

  // ---- a broken update rolls back ----
  const good = git(MINE, 'rev-parse', 'HEAD');
  write(AUTHOR, 'package.json', '{ this is not json');
  push('Broken packages');
  helper();
  ok('broken update goes back to the working version', git(MINE, 'rev-parse', 'HEAD') === good && /going back/.test(fs.readFileSync(LOG, 'utf8')));

  // ---- not a git copy ----
  const plain = path.join(BASE, 'plain');
  fs.mkdirSync(plain);
  s = await updater.status(plain);
  ok('a copy without git says why it can\'t update', !s.ok && /git/.test(s.reason));

  // ---- how each update goes in ----
  ok('notes or tests only: nothing to do', updater.kindOf(['README.md', 'test/look.js']) === 'none');
  ok('screens only: windows refresh, chats keep running', updater.kindOf(['src/renderer/box.html', 'src/preload.js', 'README.md']) === 'refresh');
  ok('the engine changed: restart and reopen', updater.kindOf(['src/main/main.js', 'src/renderer/box.js']) === 'restart');
  ok('packages changed: the helper installs them', updater.kindOf(['package.json', 'src/renderer/box.js']) === 'deps');

  // ---- the 7 AM schedule ----
  const at = (h, m = 0) => { const d = new Date(2026, 9, 28, h, m); return d; };
  ok('at 6 AM the last run was yesterday 7 AM', updater.lastRunTime(at(6)) === new Date(2026, 9, 27, 7).getTime());
  ok('at 8 AM the last run was today 7 AM', updater.lastRunTime(at(8)) === new Date(2026, 9, 28, 7).getTime());
  ok('at 6 AM the next run is in 1 hour', updater.msUntilNextRun(at(6)) === 60 * 60 * 1000);
  ok('at 8 AM the next run is tomorrow', updater.msUntilNextRun(at(8)) === 23 * 60 * 60 * 1000);

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
