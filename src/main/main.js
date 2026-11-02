// Task Desk's main process: the wiring. The parts live next door:
//   desk.js         the app id and paths, and the task list the box shows
//   windows.js      the box, task and project windows, and how they look
//   menu.js         the ⋯ menu and the tray, and what their items do
//   shortcuts.js    the desktop, Startup and Start-menu shortcuts
//   ipc.js          every channel the pages call, and the chat's tools
//   update-flow.js  the daily update check, quiet-moment install, restart and reopen
//   data-folder.js  moving the data folder to OneDrive, and the in-use lock
const { app, globalShortcut, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

// Tests can run beside the real desk with their own browser profile (and so their own lock).
if (process.env.TASKDESK_USERDATA) app.setPath('userData', process.env.TASKDESK_USERDATA);
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const config = require('./config');
const state = require('./state');
const planner = require('./planner');
const chat = require('./chat');
const icon = require('./icon');
const bridge = require('./bridge');
const log = require('./log');
const desk = require('./desk');
const windows = require('./windows');
const menu = require('./menu');
const shortcuts = require('./shortcuts');
const updateFlow = require('./update-flow');
const dataFolder = require('./data-folder');
const ipc = require('./ipc');

app.setAppUserModelId(desk.APP_ID);
ipc.register();

// ---------- lifecycle ----------

// Starting it again (the taskbar pin, Start menu or desktop icon) brings the box up.
app.on('second-instance', () => windows.showBox());
app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  app.isQuitting = true;
  chat.stopAll();
  state.flush();
  dataFolder.releaseLock();
  // A waiting update installs when you quit; it's there next time the desk opens.
  updateFlow.installOnQuit();
});
app.on('will-quit', () => globalShortcut.unregisterAll());

process.on('uncaughtException', (err) => {
  log.error('unexpected error', err);
  try {
    updateFlow.say('Task Desk hit a problem', 'It kept running. The details are in data\\taskdesk.log.');
  } catch {}
});
process.on('unhandledRejection', (err) => log.error('unexpected error (promise)', err));
log.info(`Task Desk starting (electron ${process.versions.electron}, node ${process.versions.node})`);

app.whenReady().then(async () => {
  dataFolder.warnDataMissing();
  if (!dataFolder.takeLock()) {
    app.isQuitting = true;
    app.quit();
    return;
  }
  await bridge.start(ipc.chatTool).catch((e) => console.warn('chat tools unavailable:', e.message));
  if (!fs.existsSync(desk.ICON_PNG)) {
    fs.mkdirSync(path.dirname(desk.ICON_PNG), { recursive: true });
    fs.writeFileSync(desk.ICON_PNG, icon.png(256));
  }
  if (!fs.existsSync(desk.ICON_ICO)) fs.writeFileSync(desk.ICON_ICO, icon.ico());
  nativeTheme.themeSource = windows.themeSource(config.get().look.appearance);
  menu.createTray();
  windows.createBox();
  if (!globalShortcut.register(config.get().hotkey, windows.toggleBox)) console.warn('Hotkey already taken:', config.get().hotkey);
  shortcuts.ensureShortcuts();
  desk.refresh();
  desk.startPolling();
  updateFlow.scheduleUpdates();
  updateFlow.reopenWindows();
  // Tests (their own data folder only) drive the update steps directly.
  if (process.env.TASKDESK_LOCAL_DATA)
    global.__update = {
      refreshWindows: updateFlow.refreshWindows,
      rememberWindows: updateFlow.rememberWindows,
      quietNow: updateFlow.quietNow,
      setLastInput: updateFlow.setLastInput,
      planPrompt: planner.prompt,
    };
  updateFlow.sayUpdated();
});
