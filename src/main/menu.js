// The ⋯ menu and the tray, and what their items do: switching project, test
// copies vs live, connecting the lanes workspace, the desk's AI, resetting chats.
const { app, Menu, Tray, dialog, nativeImage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const state = require('./state');
const chat = require('./chat');
const projects = require('./projects');
const ai = require('./ai');
const desk = require('./desk');
const windows = require('./windows');
const shortcuts = require('./shortcuts');
const updateFlow = require('./update-flow');
const dataFolder = require('./data-folder');

let tray = null;

function createTray() {
  tray = new Tray(nativeImage.createFromPath(desk.ICON_PNG).resize({ width: 16, height: 16 }));
  tray.on('click', windows.toggleBox);
  tray.on('right-click', () => tray.popUpContextMenu(menu()));
}

function updateTray(count) {
  if (!tray) return;
  tray.setToolTip(`Task Desk · ${count} open task${count === 1 ? '' : 's'}${projects.list().length ? ' (all projects)' : ''}`);
}

// The box draws the tray icon with the open-task count on it.
function setTrayImage(dataUrl) {
  if (tray && dataUrl) tray.setImage(nativeImage.createFromDataURL(dataUrl));
}

// Close the workspace's task windows (other projects don't change with the mode).
function closeWorkspaceWindows() {
  for (const [id, w] of [...windows.taskWins])
    if (state.projectOf(id) === 'factory') {
      chat.stop(id);
      w.destroy();
      windows.taskWins.delete(id);
    }
}

function setMode(mode) {
  if (mode === config.get().mode) return;
  if (mode === 'live') {
    const r = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Switch to live', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `Switch ${config.factoryName()} to live?`,
      detail: `Tasks will come from ${config.get().livePath}. The app only ever appends to ops\\FROM_NICK.md there.`,
    });
    if (r !== 0) return;
  }
  closeWorkspaceWindows();
  config.set({ mode });
  state.use(mode);
  desk.startPolling();
  desk.refresh();
}

// The desk's AI. New chats use it; open chats keep going until restarted.
function setAI(id) {
  ai.forget(); // look for the apps again (one may have just been installed)
  config.set({ ai: id });
  const p = ai.PROVIDERS[id];
  if (!ai.locate(p)) {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['OK'],
      message: `${p.app} isn't installed on this computer yet`,
      detail: `To use ${p.name}, open PowerShell and run:\n\n   ${p.install}\n   ${p.signin}   (${p.signinNote})\n\nThen open a task. Task Desk never signs in or installs anything for you.`,
    });
  }
  desk.broadcast();
}

function resetAllChats() {
  const r = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Reset all chats', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'Start every task chat fresh?',
    detail: "Open chats close, and each task starts a brand-new chat next time. Old conversations stay in Claude Code's history (/resume).",
  });
  if (r !== 0) return;
  chat.stopAll();
  for (const t of state.allTasks()) delete t.chatSessionId;
  state.save();
  for (const [id, w] of windows.taskWins) if (!w.isDestroyed()) w.webContents.send('chat:reset', id);
}

// Where Done notes go for what the box is showing (the workspace's FROM_NICK.md when "All").
function resultsFor(view) {
  const p = projects.get(view);
  return p ? projects.resultsFile(p) : config.factoryOn() ? path.join(config.root(), 'ops', 'FROM_NICK.md') : null;
}

// The optional lanes workspace: pick its folder to turn it on, or turn it off.
function connectWorkspace() {
  const pick = dialog.showOpenDialogSync({
    title: 'Choose the workspace folder (it has ops\\NEEDS_NICK.md and lanes\\)',
    properties: ['openDirectory'],
  });
  if (!pick) return;
  const dir = pick[0];
  if (!fs.existsSync(path.join(dir, 'ops', 'NEEDS_NICK.md'))) {
    dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['OK'],
      message: "That folder isn't a lanes workspace",
      detail: `${dir}\n\nA workspace has ops\\NEEDS_NICK.md (and usually lanes\\<name>\\LANE.md). For any other folder, use Add a project.`,
    });
    return;
  }
  config.set({ factory: true, livePath: dir, mode: 'live' });
  state.use('live');
  desk.startPolling();
  desk.refresh();
}
function disconnectWorkspace() {
  closeWorkspaceWindows();
  config.set({ factory: false, view: desk.currentView() === 'factory' ? 'all' : desk.currentView() });
  desk.refresh();
}

function menu() {
  const s = config.get();
  const box = windows.box();
  const view = desk.currentView();
  const cur = projects.get(view);
  const show = (v) => () => {
    desk.setView(v);
    if (box) {
      box.show();
      box.focus();
    }
  };
  return Menu.buildFromTemplate([
    { label: box && box.isVisible() ? 'Hide task box' : 'Show task box', accelerator: 'Ctrl+Alt+T', click: windows.toggleBox },
    { type: 'separator' },
    { label: 'All projects', type: 'radio', checked: view === 'all', click: show('all') },
    ...projects.summary().map((p) => ({ label: p.name, type: 'radio', checked: view === p.id, click: show(p.id) })),
    { label: 'Add a project…', click: () => windows.openProjectEditor(null) },
    ...(cur ? [{ label: `Edit "${cur.name}"…`, click: () => windows.openProjectEditor(cur.id) }] : []),
    { type: 'separator' },
    ...(config.factoryOn()
      ? [
          { label: `${config.factoryName()}: test copies`, type: 'radio', checked: s.mode === 'test', click: () => setMode('test') },
          { label: `${config.factoryName()}: live`, type: 'radio', checked: s.mode === 'live', click: () => setMode('live') },
          { label: `Disconnect ${config.factoryName()}`, click: disconnectWorkspace },
        ]
      : [{ label: 'Connect a lanes workspace…', click: connectWorkspace }]),
    { type: 'separator' },
    { label: 'Refresh tasks now', click: desk.refresh },
    { label: 'Reset all chats…', click: resetAllChats },
    {
      label: 'Show snoozed & done again',
      click: () => {
        for (const t of state.allTasks()) if (t.status === 'snoozed') t.status = 'open';
        state.save();
        desk.broadcast();
      },
    },
    {
      label: 'Customize look…',
      click: () => {
        box.show();
        box.webContents.send('look:open');
      },
    },
    {
      label: 'AI for chats and plans',
      submenu: [
        ...ai.IDS.map((id) => {
          const p = ai.PROVIDERS[id];
          return {
            label: `${p.name} (${p.app})${ai.locate(p) ? '' : ' - not installed'}`,
            type: 'radio',
            checked: (s.ai || 'claude') === id,
            click: () => setAI(id),
          };
        }),
        { type: 'separator' },
        { label: 'A project can use its own: Edit project, box 9', enabled: false },
      ],
    },
    ...(resultsFor(view)
      ? [
          {
            label: cur ? `Open "${cur.name}" results` : `Open ${config.factoryName()} results (FROM_NICK.md)`,
            click: () => shell.openPath(resultsFor(view)),
          },
        ]
      : []),
    {
      label: 'Your name…',
      click: () => {
        box.show();
        box.webContents.send('me:ask');
      },
    },
    { label: 'Open app data folder', click: () => shell.openPath(config.DATA_DIR) },
    { type: 'separator' },
    config.synced()
      ? { label: 'Move my data back to this computer…', click: dataFolder.moveDataHome }
      : { label: 'Keep my data in OneDrive…', click: dataFolder.moveDataToCloud },
    { label: 'Start with Windows', type: 'checkbox', checked: shortcuts.autostartOn(), click: (i) => shortcuts.setAutostart(i.checked) },
    {
      label: 'Show in the taskbar',
      type: 'checkbox',
      checked: config.get().showInTaskbar !== false,
      click: (i) => {
        config.set({ showInTaskbar: i.checked });
        box.setSkipTaskbar(!i.checked);
      },
    },
    updateFlow.pending()
      ? { label: 'Restart to update', click: () => updateFlow.installUpdate(true) }
      : { label: 'Check for updates now', click: () => updateFlow.checkForUpdate(true) },
    {
      label: 'Update automatically (daily, 7 AM)',
      type: 'checkbox',
      checked: config.get().autoUpdate !== false,
      click: (i) => {
        config.set({ autoUpdate: i.checked });
        updateFlow.scheduleUpdates();
      },
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

Object.assign(module.exports, { createTray, updateTray, setTrayImage, setAI, menu });
