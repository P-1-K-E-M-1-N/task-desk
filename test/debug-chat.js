// Runs the same chat launch the app does, outside Electron, and prints what claude shows.
const pty = require('@lydell/node-pty');
const { claudeExe, cleanEnv } = require('../src/main/sessions');
const args = process.argv.slice(3);
const p = pty.spawn(claudeExe(), args, {
  name: 'xterm-256color',
  cols: 110,
  rows: 40,
  cwd: process.argv[2],
  env: cleanEnv({ TERM: 'xterm-256color' }),
});
let out = '';
p.onData((d) => {
  out += d;
});
p.onExit(({ exitCode }) => {
  console.log('EXIT', exitCode);
  show();
  process.exit(0);
});
const show = () =>
  console.log(
    out
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\r/g, '')
      .split('\n')
      .filter((l) => l.trim())
      .slice(-40)
      .join('\n')
  );
setTimeout(() => {
  console.log('STILL RUNNING after 25s');
  show();
  p.kill();
  process.exit(0);
}, 25000);
