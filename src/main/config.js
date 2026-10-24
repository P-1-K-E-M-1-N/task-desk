// Settings live in data/settings.json. "mode" switches between the test copies
// in test-fixtures/ and the real Workshop folder.
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(APP_ROOT, 'data');
const PLANS_DIR = path.join(DATA_DIR, 'plans');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULTS = {
  mode: 'test',
  livePath: 'C:\\MrC\\idea-factory',
  testPath: path.join(APP_ROOT, 'test-fixtures'),
  pollSeconds: 60,
  hotkey: 'Control+Alt+T',
  plannerModel: '',
  boxBounds: null,
  collapsed: false,
};

fs.mkdirSync(PLANS_DIR, { recursive: true });

let settings = load();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function get() {
  return settings;
}

function set(patch) {
  settings = { ...settings, ...patch };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return settings;
}

// The folder the app reads tasks from (factory root or its test copy).
function root() {
  return settings.mode === 'live' ? settings.livePath : settings.testPath;
}

module.exports = { APP_ROOT, DATA_DIR, PLANS_DIR, get, set, root };
