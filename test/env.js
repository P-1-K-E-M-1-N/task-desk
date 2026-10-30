// Shared test setup. Each test run gets its own temporary data folder and browser
// profile, so it can run beside the real Task Desk without touching its settings,
// ticks or notes. The lanes workspace (named "Workshop" here) is on, reading
// its test copies in test-fixtures/, the user is "Sam" (the name the sample
// files use), and there are no other
// projects. Cached test plans are copied in so nothing has to be re-planned.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(os.tmpdir(), 'taskdesk-test');
const DATA = path.join(BASE, 'data');
const PROFILE = path.join(BASE, 'profile');
const SETTINGS = path.join(DATA, 'settings.json');
// A pretend live workspace folder, for the "it stays read-only" checks.
const WORKSPACE = path.join(BASE, 'workspace');
// The real desk keeps Ctrl+Alt+T while tests run, so tests use their own hotkey.
const HOTKEY = 'Control+Alt+Shift+F9';

let ready = false;
function useTestSettings(extra = {}) {
  if (!ready) {
    fs.rmSync(BASE, { recursive: true, force: true });
    fs.mkdirSync(DATA, { recursive: true });
    fs.mkdirSync(path.join(WORKSPACE, 'ops'), { recursive: true });
    const plans = path.join(ROOT, 'data', 'plans', 'test');
    if (fs.existsSync(plans)) fs.cpSync(plans, path.join(DATA, 'plans', 'test'), { recursive: true });
    fs.writeFileSync(path.join(DATA, 'machine.json'), JSON.stringify({ collapsed: false, shortcutsDone: true }, null, 2));
    ready = true;
  }
  let real = {};
  try { real = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8')); } catch {}
  const s = {
    look: real.look, mode: 'test', projects: [], view: 'all', hotkey: HOTKEY,
    factory: true, factoryName: 'Workshop', livePath: WORKSPACE, userName: 'Sam', userNameAsked: true,
    ...extra,
  };
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
  return s;
}

const launchOpts = (env = {}) => ({
  executablePath: require('electron'), args: [ROOT], cwd: ROOT,
  env: { ...process.env, TASKDESK_LOCAL_DIR: DATA, TASKDESK_LOCAL_DATA: '1', TASKDESK_USERDATA: PROFILE, ...env },
});

module.exports = { ROOT, DATA, SETTINGS, HOTKEY, WORKSPACE, useTestSettings, launchOpts };
