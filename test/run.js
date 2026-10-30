// Runs the test files one after another and fails if any of them fails.
//   npm test          the tests that need no AI app (what CI runs)
//   npm run test:all  every test, including the ones that start a real Claude Code
// Each test gets a fresh temporary data folder (see test/env.js), so they have
// to run in sequence, not side by side.
const { spawnSync } = require('child_process');
const path = require('path');

const NO_AI = ['updater.js', 'standalone.js', 'ai.js', 'seamless.js'];
const NEEDS_AI = ['e2e.js', 'projects.js', 'chat-tools.js', 'look.js'];
const all = process.argv.includes('--all');
const only = process.argv.slice(2).filter((a) => a.endsWith('.js'));
const files = only.length ? only : all ? [...NO_AI, ...NEEDS_AI] : NO_AI;

const failed = [];
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', timeout: 15 * 60 * 1000 });
  if (r.status !== 0) failed.push(`${f} (exit ${r.status === null ? r.signal : r.status})`);
}
console.log(`\n${files.length - failed.length}/${files.length} test files passed${failed.length ? ': FAILED ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
