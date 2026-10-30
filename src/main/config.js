// Settings live in settings.json in the data folder.
//
// The lanes workspace ("factory" in the code) is optional and off for new
// installs: a folder laid out as ops/NEEDS_NICK.md + lanes/*/LANE.md that
// several agents work in. "mode" switches it between the test copies in
// test-fixtures/ and the real folder (livePath).
//
// Two folders:
//  - LOCAL_DIR (data/ next to the app) always stays on this computer. It holds
//    machine.json (window position, auto-start, and where the data folder is)
//    and the chat-tool configs.
//  - DATA_DIR holds everything worth keeping: settings, projects, ticks, notes,
//    plans. It is LOCAL_DIR unless it was moved to OneDrive.
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_DIR = process.env.TASKDESK_LOCAL_DIR || path.join(APP_ROOT, 'data');
const MACHINE_FILE = path.join(LOCAL_DIR, 'machine.json');
// Settings that belong to this computer, not to the shared data.
const MACHINE_KEYS = ['dataDir', 'boxBounds', 'boxLocked', 'collapsed', 'shortcutsDone', 'autostart', 'autoUpdate', 'lastUpdateCheck', 'updatedNote', 'reopenAfterUpdate', 'showInTaskbar', 'linksFor'];

const DEFAULTS = {
  // Who uses this desk: the AI calls them by name, and "only lines that mention
  // me" looks for it. about = an optional line the planner reads ("does not write code").
  userName: '',
  userAbout: '',
  // The optional lanes workspace: on/off, its folder, and the name shown for it
  // (defaults to the folder's name, e.g. "my-factory" -> "My Factory").
  factory: false,
  factoryName: '',
  mode: 'test',
  livePath: '',
  testPath: path.join(APP_ROOT, 'test-fixtures'),
  pollSeconds: 60,
  hotkey: 'Control+Alt+T',
  plannerModel: '',
  boxBounds: null,
  collapsed: false,
  // How the windows look: color theme, frame material, light/dark, text size.
  // appearance 'cycle' = "Day & night": light from 7:00 to 19:00, dark the rest.
  look: { theme: 'ocean', material: 'paper', appearance: 'cycle', size: 'm', motion: 'on', picture: '' },
  // Projects besides the lanes workspace (see projects.js), and which one the box shows.
  projects: [],
  view: 'all',
};

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, obj) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj, null, 2)); };

fs.mkdirSync(LOCAL_DIR, { recursive: true });
let machine = readJson(MACHINE_FILE) || {};
// Tests always use the folder next to the app, never a synced one.
const wanted = process.env.TASKDESK_LOCAL_DATA ? null : machine.dataDir || null;
const DATA_DIR = wanted && fs.existsSync(wanted) ? wanted : LOCAL_DIR;
const dataMissing = !!wanted && DATA_DIR !== wanted;
const PLANS_DIR = path.join(DATA_DIR, 'plans');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

fs.mkdirSync(PLANS_DIR, { recursive: true });

let settings = load();

function load() {
  const saved = readJson(SETTINGS_FILE) || {};
  // Older versions kept the machine settings in settings.json: move them over once.
  let moved = false;
  for (const k of MACHINE_KEYS) if (!(k in machine) && k in saved && k !== 'dataDir') { machine[k] = saved[k]; moved = true; }
  if (moved) writeJson(MACHINE_FILE, machine);
  // Desks set up before the workspace became optional had a folder saved: keep it on for them.
  if (saved.factory === undefined && saved.livePath) saved.factory = true;
  return { ...DEFAULTS, ...saved, look: { ...DEFAULTS.look, ...saved.look } };
}

function get() {
  const own = {};
  for (const k of MACHINE_KEYS) if (k in machine) own[k] = machine[k];
  return { ...settings, ...own };
}

function set(patch) {
  const shared = {};
  let mine = false;
  for (const [k, v] of Object.entries(patch)) {
    if (MACHINE_KEYS.includes(k)) { machine[k] = v; mine = true; } else shared[k] = v;
  }
  if (mine) writeJson(MACHINE_FILE, machine);
  if (Object.keys(shared).length) {
    settings = { ...settings, ...shared };
    const out = { ...settings };
    for (const k of MACHINE_KEYS) delete out[k];
    writeJson(SETTINGS_FILE, out);
  }
  return get();
}

// The folder the app reads the lanes workspace from (its root or the test copy).
function root() {
  return settings.mode === 'live' ? settings.livePath : settings.testPath;
}

const synced = () => DATA_DIR !== LOCAL_DIR;

// The person, for prompts and the box ("the user" until they say their name).
const userName = () => String(settings.userName || '').trim();
const who = () => userName() || 'the user';
const whose = () => (userName() ? `${userName()}'s` : "the user's");

// The lanes workspace is shown only when it's turned on (and, live, has a folder).
const factoryOn = () => settings.factory === true && (settings.mode !== 'live' || !!settings.livePath);
const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
const factoryName = () => String(settings.factoryName || '').trim() || (settings.livePath ? titleCase(path.basename(settings.livePath)) : '') || 'Workspace';
// Is this path inside the live workspace folder? (false when there isn't one)
function inFactory(p) {
  if (!settings.livePath || !p) return false;
  const rel = path.relative(path.resolve(settings.livePath), path.resolve(p));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

module.exports = { APP_ROOT, LOCAL_DIR, DATA_DIR, PLANS_DIR, PROJECTS_DIR, get, set, root, synced, dataMissing, wantedDataDir: wanted, userName, who, whose, factoryOn, factoryName, inFactory };
