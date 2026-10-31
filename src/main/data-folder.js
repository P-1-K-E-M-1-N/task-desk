// Where the data folder lives. Moving it to OneDrive copies settings, projects,
// ticks, notes and plans, then restarts. Chat history stays with each computer's
// Claude Code, and API keys are never in the data folder. A small in-use.json
// warns when the desk is already open on another computer, because OneDrive
// can't merge two copies of a file.
const { dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');
const updateFlow = require('./update-flow');

const SHARED = ['settings.json', 'state.json', 'state.test.json', 'plans', 'projects', 'look'];

function copyData(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const n of SHARED) {
    const src = path.join(from, n);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(to, n), { recursive: true, force: true });
  }
}

function oneDriveRoot() {
  const env = process.env.OneDrive || process.env.OneDriveConsumer || process.env.OneDriveCommercial;
  return env && fs.existsSync(env) ? env : null;
}

function moveDataToCloud() {
  let base = oneDriveRoot();
  if (!base) {
    const pick = dialog.showOpenDialogSync({ title: 'Choose your OneDrive folder', properties: ['openDirectory'] });
    if (!pick) return;
    base = pick[0];
  }
  const target = path.join(base, 'Task Desk');
  if (fs.existsSync(path.join(target, 'settings.json'))) {
    const r = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Use the data in OneDrive', "Replace it with this computer's data", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: "There's already Task Desk data in OneDrive",
      detail: `${target}\n\nIt's probably from your other computer. "Use the data in OneDrive" picks up where you left off there. "Replace" puts this computer's data there instead (the old copy is kept in a backup folder next to it).`,
    });
    if (r === 2) return;
    if (r === 1) {
      fs.cpSync(target, `${target} backup ${new Date().toISOString().slice(0, 10)}`, { recursive: true });
      copyData(config.DATA_DIR, target);
    }
  } else {
    const r = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Move to OneDrive', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Keep your Task Desk data in OneDrive?',
      detail: `Your projects, ticks, notes, plans and look settings move to:\n${target}\n\nOn another computer, install Task Desk and choose this again to pick up the same data. Chat history stays on each computer, and API keys are never stored there.\n\nTip: use Task Desk on one computer at a time. Task Desk restarts now.`,
    });
    if (r !== 0) return;
    copyData(config.DATA_DIR, target);
  }
  config.set({ dataDir: target });
  updateFlow.restart();
}

function moveDataHome() {
  const r = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Move it back', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: 'Move your data back to this computer?',
    detail: `Copies everything from ${config.DATA_DIR} to ${config.LOCAL_DIR} and stops using OneDrive on this computer. The OneDrive copy is left alone. Task Desk restarts now.`,
  });
  if (r !== 0) return;
  copyData(config.DATA_DIR, config.LOCAL_DIR);
  config.set({ dataDir: null });
  updateFlow.restart();
}

// Shown at start when the OneDrive folder the settings point to isn't there.
function warnDataMissing() {
  if (!config.dataMissing) return;
  dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['OK'],
    message: "Can't find your OneDrive data folder",
    detail: `${config.wantedDataDir}\n\nTask Desk is using this computer's own data for now. Check that OneDrive is running and signed in, then restart Task Desk.`,
  });
}

const LOCK = path.join(config.DATA_DIR, 'in-use.json');
let lockTimer = null;
function beat() {
  try {
    fs.writeFileSync(LOCK, JSON.stringify({ computer: os.hostname(), at: Date.now() }));
  } catch {}
}
// Returns false if the user chose to quit because the desk is open on another computer.
function takeLock() {
  if (!config.synced()) return true;
  try {
    const l = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    if (l.computer !== os.hostname() && Date.now() - l.at < 3 * 60 * 1000) {
      const r = dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['Open anyway', 'Quit'],
        defaultId: 1,
        cancelId: 1,
        message: `Task Desk looks open on ${l.computer}`,
        detail:
          'Your data is shared through OneDrive. Using it on two computers at the same time can leave OneDrive with two versions of the same file. Close it on the other computer first, or open anyway.',
      });
      if (r !== 0) return false;
    }
  } catch {}
  beat();
  lockTimer = setInterval(beat, 60 * 1000);
  return true;
}
function releaseLock() {
  clearInterval(lockTimer);
  if (!config.synced()) return;
  try {
    if (JSON.parse(fs.readFileSync(LOCK, 'utf8')).computer === os.hostname()) fs.unlinkSync(LOCK);
  } catch {}
}

Object.assign(module.exports, { moveDataToCloud, moveDataHome, warnDataMissing, takeLock, releaseLock });
