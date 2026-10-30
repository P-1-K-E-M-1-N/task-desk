// Generates (or refreshes) plans for every task without opening the app.
const planner = require('../src/main/planner');
const config = require('../src/main/config');
const { readTasks } = require('../src/main/tasks');
const tasks = readTasks(config.root());
let left = tasks.filter((t) => planner.status(t) === 'missing').length;
console.log(`mode=${config.get().mode} tasks=${tasks.length} to-generate=${left}`);
planner.events.on('ready', (id) => {
  const t = tasks.find((x) => x.id === id);
  const c = planner.cached(t);
  console.log(
    `${c.ok ? 'OK  ' : 'FAIL'} ${t.lane} · ${t.title} (${c.plan.steps.length} steps, ${c.plan.type}, ${c.plan.est_minutes}m)${c.ok ? '' : ' ' + c.plan.error}`
  );
  if (--left <= 0) process.exit(0);
});
if (!left) process.exit(0);
planner.ensure(tasks);
