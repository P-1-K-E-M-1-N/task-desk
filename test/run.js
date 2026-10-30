// Runs the test files one after another and fails if any of them fails.
//   npm test          unit tests + the tests that need no AI app (what CI runs)
//   npm run test:all  every test, including the ones that start a real Claude Code
// Each Playwright test gets a fresh temporary data folder (see test/env.js), so
// they have to run in sequence, not side by side.
const { spawnSync } = require('child_process');
const path = require('path');

const NO_AI = ['updater.js', 'standalone.js', 'ai.js', 'seamless.js'];
const NEEDS_AI = ['e2e.js', 'projects.js', 'chat-tools.js', 'look.js'];
const all = process.argv.includes('--all');
const only = process.argv.slice(2).filter((a) => a.endsWith('.js'));
const files = only.length ? only : all ? [...NO_AI, ...NEEDS_AI] : NO_AI;

const failed = [];
let ran = 0;
const run = (name, args, timeout) => {
  console.log(`\n=== ${name} ===`);
  ran++;
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', timeout });
  if (r.status !== 0) failed.push(`${name} (exit ${r.status === null ? r.signal : r.status})`);
};

// Unit tests first: pure functions, a few seconds, no Electron.
if (!only.length) run('unit tests (test/unit)', ['--test', path.join(__dirname, 'unit', '*.test.js')], 5 * 60 * 1000);
for (const f of files) run(f, [path.join(__dirname, f)], 15 * 60 * 1000);

console.log(`\n${ran - failed.length}/${ran} test files passed${failed.length ? ': FAILED ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
