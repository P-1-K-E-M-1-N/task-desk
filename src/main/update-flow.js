// Keeping the desk up to date. See updater.js for the git side; this is the
// flow: check GitHub every day at 7 AM, install at a quiet moment, refresh the
// windows in place when that's enough, otherwise restart and reopen the task
// windows where they were.
const { app, dialog, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const state = require('./state');
const chat = require('./chat');
const updater = require('./updater');
const desk = require('./desk');
const windows = require('./windows');
const dataFolder = require('./data-folder');

const UPDATE_LOG = path.join(config.LOCAL_DIR, 'update.log');
let pendingUpdate = null,
  updateTimer = null,
  idleTimer = null,
  installing = false;
// Tests run their own copy and never update.
const autoUpdateOn = () => config.get().autoUpdate !== false && !desk.TESTING && !process.env.TASKDESK_NO_UPDATE;
const logUpdate = (msg) => {
  try {
    fs.appendFileSync(UPDATE_LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
};
// A Windows notification from the desk.
const say = (title, body) => {
  try {
    new Notification({ title, body, icon: desk.ICON_PNG }).show();
  } catch {}
};

async function checkForUpdate(manual) {
  const s = await updater.status(config.APP_ROOT);
  config.set({ lastUpdateCheck: Date.now() });
  const tell = (message, detail = '') => manual && dialog.showMessageBox({ type: 'info', buttons: ['OK'], message, detail });
  if (!s.ok) {
    logUpdate(`check: ${s.reason}`);
    tell("Couldn't check for updates", s.reason);
    return s;
  }
  if (!s.behind) {
    pendingUpdate = null;
    tell('Task Desk is up to date');
    return s;
  }
  if (!s.canInstall) {
    logUpdate(`check: ${s.behind} new, not installed (own changes: ${s.dirty}, own commits: ${s.ahead})`);
    tell(
      "There's a newer version, but this copy wasn't updated",
      'This copy of Task Desk has its own changes to the app (someone is working on the code here), so updating it automatically could lose them. Save or undo those changes, then check again.'
    );
    return s;
  }
  pendingUpdate = s;
  logUpdate(`check: ${s.behind} new: ${s.changes.join(' | ')}`);
  if (manual) {
    const r = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Install and restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: 'A new version of Task Desk is ready',
      detail: `${s.changes.map((c) => '• ' + c).join('\n')}\n\n${
        s.kind === 'refresh' || s.kind === 'none'
          ? 'Your windows refresh for a moment; your chats keep running.'
          : 'The desk restarts for a few seconds and reopens your task windows. Each chat picks up where it left off, but a reply Claude is writing right now would be cut off.'
      }`,
    });
    if (r.response === 0) installUpdate(true);
    else installWhenIdle();
  } else installWhenIdle();
  return s;
}

// Install at a quiet moment, so nothing you're doing is cut off:
//  - nobody has typed in a desk window for 2 minutes,
//  - no "Add/Edit project" form is open (it isn't saved until you press Save),
//  - and, when the desk has to restart, no chat has printed anything for
//    2 minutes (Claude isn't in the middle of a reply).
// A refresh-only update keeps the chats running, so it doesn't wait for them.
const QUIET_MS = 2 * 60 * 1000;
let lastInput = 0;
app.on('browser-window-created', (e, w) =>
  w.webContents.on('before-input-event', () => {
    lastInput = Date.now();
  })
);
function quietNow(kind) {
  if ([...windows.projectWins.values()].some((w) => w && !w.isDestroyed())) return false;
  if (Date.now() - lastInput < QUIET_MS) return false;
  return kind === 'refresh' || kind === 'none' || chat.quietFor(QUIET_MS);
}

function installWhenIdle() {
  clearTimeout(idleTimer);
  if (!pendingUpdate) return;
  if (!quietNow(pendingUpdate.kind)) {
    idleTimer = setTimeout(installWhenIdle, 60 * 1000);
    return;
  }
  installUpdate(true);
}

// Remember the open task windows, so the desk reopens them after restarting.
function rememberWindows() {
  const box = windows.box();
  const wins = [...windows.taskWins]
    .filter(([, w]) => w && !w.isDestroyed())
    .map(([id, w]) => ({
      id,
      ...w.getNormalBounds(),
      maximized: w.isMaximized(),
      minimized: w.isMinimized(),
    }));
  config.set({ reopenAfterUpdate: { at: Date.now(), wins, boxHidden: !!box && !box.isVisible() } });
}
function reopenWindows() {
  const r = config.get().reopenAfterUpdate;
  if (!r) return;
  config.set({ reopenAfterUpdate: null });
  if (Date.now() - (r.at || 0) > 30 * 60 * 1000) return; // a stale note from an update that never restarted
  const box = windows.box();
  if (r.boxHidden && box) box.once('show', () => box.hide());
  for (const x of r.wins || []) {
    if (!desk.findTask(x.id)) continue;
    windows.openTask(x.id, x);
    const w = windows.taskWins.get(x.id);
    if (x.minimized && w) w.once('show', () => w.minimize());
  }
}

// Refresh every open window in place. Task windows reconnect to their running chats.
function refreshWindows() {
  for (const w of windows.liveWins()) w.webContents.reload();
}

function installUpdate(relaunch) {
  const s = pendingUpdate;
  if (!s || installing) return;
  installing = true;
  const note = s.changes[0] || 'A new version';
  if (s.kind !== 'deps') {
    // Only the app's own files changed: update them now.
    const r = updater.pullNow(config.APP_ROOT);
    logUpdate(r.ok ? `installed (${s.kind})` : `install failed: ${r.error}`);
    if (!r.ok) {
      installing = false;
      pendingUpdate = null;
      say("Task Desk couldn't update", r.error);
      return;
    }
    if (!relaunch) return; // quitting: the new version is there next time
    if (s.kind === 'none' || s.kind === 'refresh') {
      installing = false;
      pendingUpdate = null;
      if (s.kind === 'refresh') {
        refreshWindows();
        say('Task Desk was updated', note);
      }
      return;
    }
    config.set({ updatedNote: note });
    rememberWindows();
    restart();
    return;
  }
  // The packages changed too: a helper installs them after the desk has closed.
  if (!updater.startHelper({ root: config.APP_ROOT, relaunch, electron: process.execPath, log: UPDATE_LOG })) {
    installing = false;
    say(
      'Task Desk update needs Node.js',
      'This update needs "npm install", and Node.js wasn\'t found. Install Node.js, then choose Check for updates now.'
    );
    return;
  }
  config.set({ updatedNote: note });
  logUpdate('installing with helper');
  if (relaunch) {
    rememberWindows();
    app.isQuitting = true;
    app.quit();
  }
}

function scheduleUpdates() {
  clearTimeout(updateTimer);
  if (!autoUpdateOn()) return;
  const missed = (config.get().lastUpdateCheck || 0) < updater.lastRunTime();
  const tick = async () => {
    await checkForUpdate(false).catch((e) => logUpdate(`check error: ${e.message}`));
    updateTimer = setTimeout(tick, updater.msUntilNextRun());
  };
  // Missed this morning's check (the computer was off at 7)? Check a couple of minutes after starting.
  updateTimer = setTimeout(tick, missed ? 2 * 60 * 1000 : updater.msUntilNextRun());
}

function restart() {
  dataFolder.releaseLock();
  state.flush();
  app.relaunch();
  app.isQuitting = true;
  app.exit(0);
}

// On quit, a waiting update installs so it's there next time the desk opens.
function installOnQuit() {
  if (pendingUpdate && !installing) installUpdate(false);
}

// After a restart for an update, tell the user what changed.
function sayUpdated() {
  const note = config.get().updatedNote;
  if (note) {
    config.set({ updatedNote: '' });
    say('Task Desk was updated', note);
  }
}

Object.assign(module.exports, {
  say,
  checkForUpdate,
  quietNow,
  rememberWindows,
  reopenWindows,
  refreshWindows,
  installUpdate,
  installOnQuit,
  scheduleUpdates,
  restart,
  sayUpdated,
  pending: () => pendingUpdate,
  setLastInput: (t) => {
    lastInput = t;
  },
});
