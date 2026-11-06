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
const ok = (name, cond, extra = '') => {
  results.push(!!cond);
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const BASE = path.join(os.tmpdir(), 'taskdesk-update-test');
const ORIGIN = path.join(BASE, 'origin.git');
const MINE = path.join(BASE, 'installed');
const AUTHOR = path.join(BASE, 'author');
const LOG = path.join(BASE, 'update.log');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, windowsHide: true }).toString().trim();
const write = (dir, f, text) => fs.writeFileSync(path.join(dir, f), text);
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const ident = (dir) => {
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.com');
};
// A signing key for the pretend maintainer (updates only install when signed with a listed key).
const KEYS = path.join(BASE, 'keys');
const newKey = (name) => {
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', name, '-f', path.join(KEYS, name)]);
  return path.join(KEYS, `${name}.pub`);
};
const listed = (pubFile) =>
  `test@example.com namespaces="git" ${fs.readFileSync(pubFile, 'utf8').trim().split(' ').slice(0, 2).join(' ')}\n`;
const signsWith = (dir, pubFile) => {
  git(dir, 'config', 'gpg.format', 'ssh');
  git(dir, 'config', 'user.signingkey', pubFile);
  git(dir, 'config', 'commit.gpgsign', 'true');
};
const push = (msg) => {
  git(AUTHOR, 'add', '-A');
  git(AUTHOR, 'commit', '-q', '-m', msg);
  git(AUTHOR, 'push', '-q');
};
const helper = () => {
  const gone = spawnSync(process.execPath, ['-e', '0']).pid; // a process that has already exited
  return spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'main', 'update-helper.js'), MINE, String(gone), '0', '', LOG], {
    timeout: 180000,
  });
};

(async () => {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(KEYS, { recursive: true });
  const maintainer = newKey('maintainer');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', ORIGIN]);
  execFileSync('git', ['clone', '-q', ORIGIN, AUTHOR]);
  ident(AUTHOR);
  signsWith(AUTHOR, maintainer);
  git(AUTHOR, 'checkout', '-q', '-b', 'main');
  fs.mkdirSync(path.join(AUTHOR, 'tools'));
  write(AUTHOR, path.join('tools', 'allowed_signers'), listed(maintainer));
  write(AUTHOR, 'package.json', JSON.stringify({ name: 'pretend-desk', version: '1.0.0', private: true }, null, 2));
  write(AUTHOR, 'app.txt', 'version 1\n');
  // The lockfile is part of the app, as in the real repo: updates install exactly what it says.
  write(AUTHOR, '.gitignore', 'data/\nnode_modules/\n');
  git(AUTHOR, 'add', '-A');
  git(AUTHOR, 'commit', '-q', '-m', 'First version');
  git(AUTHOR, 'push', '-q', '-u', 'origin', 'main');
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
  git(MINE, 'add', 'mine.txt');
  git(MINE, 'commit', '-q', '-m', 'local work');
  s = await updater.status(MINE);
  ok('own commits: not installed', s.ok && s.ahead === 1 && !s.canInstall);
  git(MINE, 'reset', '-q', '--hard', 'HEAD~1');

  // ---- an update that changes the packages goes through the helper ----
  write(AUTHOR, 'package.json', JSON.stringify({ name: 'pretend-desk', version: '2.0.0', private: true }, null, 2));
  // The helper installs exactly what the lockfile says (npm ci), so the pretend app has one too.
  write(
    AUTHOR,
    'package-lock.json',
    JSON.stringify(
      {
        name: 'pretend-desk',
        version: '2.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'pretend-desk', version: '2.0.0' } },
      },
      null,
      2
    )
  );
  push('New packages');
  s = await updater.status(MINE);
  ok('package change is spotted', s.canInstall && s.deps);
  helper();
  ok(
    'helper installs it',
    JSON.parse(read(MINE, 'package.json')).version === '2.0.0' && git(MINE, 'rev-parse', 'HEAD') === git(AUTHOR, 'rev-parse', 'HEAD')
  );
  ok(
    'helper ran npm ci without install scripts',
    /npm ci --ignore-scripts .*done/.test(fs.readFileSync(LOG, 'utf8')),
    fs.readFileSync(LOG, 'utf8')
  );

  // ---- a broken update rolls back ----
  const good = git(MINE, 'rev-parse', 'HEAD');
  write(AUTHOR, 'package.json', '{ this is not json');
  push('Broken packages');
  helper();
  ok(
    'broken update goes back to the working version',
    git(MINE, 'rev-parse', 'HEAD') === good && /going back/.test(fs.readFileSync(LOG, 'utf8'))
  );

  // ---- signed updates: with tools/allowed_signers, only a commit signed by a listed key installs ----
  {
    const SIG = path.join(BASE, 'signed');
    fs.mkdirSync(SIG, { recursive: true });
    const mine = maintainer;
    const other = newKey('someone-else');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', path.join(SIG, 'origin.git')]);
    execFileSync('git', ['clone', '-q', path.join(SIG, 'origin.git'), path.join(SIG, 'author')]);
    const A = path.join(SIG, 'author');
    ident(A);
    fs.mkdirSync(path.join(A, 'tools'));
    write(A, path.join('tools', 'allowed_signers'), listed(mine));
    write(A, 'app.txt', 'one\n');
    git(A, 'add', '-A');
    git(A, 'commit', '-q', '-m', 'first');
    git(A, 'push', '-q', 'origin', 'main');
    execFileSync('git', ['clone', '-q', path.join(SIG, 'origin.git'), path.join(SIG, 'installed')]);
    const I = path.join(SIG, 'installed');
    const commit = (text, signWith) => {
      write(A, 'app.txt', text);
      git(
        A,
        ...(signWith ? ['-c', 'gpg.format=ssh', '-c', `user.signingkey=${signWith}`] : []),
        'commit',
        '-q',
        ...(signWith ? ['-S'] : []),
        '-am',
        text
      );
      git(A, 'push', '-q');
    };
    commit('unsigned\n');
    s = await updater.status(I);
    ok('an unsigned update is not installed', s.ok && s.behind === 1 && !s.canInstall && s.signed.required && !s.signed.ok, s.signed.why);
    commit('wrong key\n', other);
    s = await updater.status(I);
    ok("one signed with a key that isn't listed is not installed", !s.canInstall && !s.signed.ok, s.signed.why);
    commit('signed\n', mine);
    s = await updater.status(I);
    ok('one signed with a listed key is installed', s.canInstall && s.signed.ok, JSON.stringify(s.signed));
    commit('pushed after the check\n');
    ok('only the checked version goes in', updater.pullNow(I, s.target).ok && read(I, 'app.txt').trim() === 'signed');
    // A copy without the list of keys never skips the check: it installs nothing.
    commit('newer, signed\n', mine);
    fs.rmSync(path.join(I, 'tools', 'allowed_signers'));
    s = await updater.status(I);
    ok('a copy without the list of keys installs nothing', !s.canInstall && !s.signed.ok && /no list/.test(s.signed.why), s.signed.why);
  }

  // ---- not a git copy ----
  const plain = path.join(BASE, 'plain');
  fs.mkdirSync(plain);
  s = await updater.status(plain);
  ok("a copy without git says why it can't update", !s.ok && /git/.test(s.reason));

  // ---- how each update goes in ----
  ok('notes or tests only: nothing to do', updater.kindOf(['README.md', 'test/look.js']) === 'none');
  ok(
    'screens only: windows refresh, chats keep running',
    updater.kindOf(['src/renderer/box.html', 'src/preload.js', 'README.md']) === 'refresh'
  );
  ok('the engine changed: restart and reopen', updater.kindOf(['src/main/main.js', 'src/renderer/box.js']) === 'restart');
  ok('packages changed: the helper installs them', updater.kindOf(['package.json', 'src/renderer/box.js']) === 'deps');

  // ---- the 7 AM schedule ----
  const at = (h, m = 0) => {
    const d = new Date(2026, 9, 28, h, m);
    return d;
  };
  ok('at 6 AM the last run was yesterday 7 AM', updater.lastRunTime(at(6)) === new Date(2026, 9, 27, 7).getTime());
  ok('at 8 AM the last run was today 7 AM', updater.lastRunTime(at(8)) === new Date(2026, 9, 28, 7).getTime());
  ok('at 6 AM the next run is in 1 hour', updater.msUntilNextRun(at(6)) === 60 * 60 * 1000);
  ok('at 8 AM the next run is tomorrow', updater.msUntilNextRun(at(8)) === 23 * 60 * 60 * 1000);

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
