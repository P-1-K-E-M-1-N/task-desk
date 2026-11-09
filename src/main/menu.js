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

function updateTray(count, needs = 0) {
  if (!tray) return;
  const waiting = needs ? ` · ${needs} waiting on you` : '';
  tray.setToolTip(`Task Desk · ${count} open task${count === 1 ? '' : 's'}${waiting}${projects.list().length ? ' (all projects)' : ''}`);
}

// "When a chat needs you": flash its window, a Windows notification, a sound.
const cueNow = () => ({ flash: true, notify: true, sound: 'off', ...(config.get().cue || {}) });
function setCue(patch, preview) {
  const cue = { ...cueNow(), ...patch };
  config.set({ cue });
  const b = windows.box();
  if (preview && cue.sound !== 'off' && b && !b.isDestroyed()) b.webContents.send('cue', { sound: cue.sound, kind: 'preview' });
}
const SOUNDS = [
  ['off', 'No sound'],
  ['chime', 'Chime'],
  ['ping', 'Ping'],
  ['knock', 'Knock'],
];

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
      detail: `Tasks will come from ${config.livePath()}. The app only ever appends to ops\\FROM_NICK.md there.`,
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
  if (!ai.allowed(id)) return;
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
  // With shared data and a workspace already connected, a different folder is this computer's own.
  config.set({
    factory: true,
    livePath: config.placeFolder('factory', dir, config.get().factory ? config.get().livePath : ''),
    mode: 'live',
  });
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
    // Every chat stops what it's doing and waits (see chat.interrupt).
    {
      label: 'Stop all chats',
      enabled: chat.liveIds().length > 0,
      click: () => {
        chat.interruptAll();
        desk.broadcast();
      },
    },
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
          {
            label: `${config.factoryName()}'s folder on this computer…`,
            click: connectWorkspace,
          },
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
        ...ai.IDS.filter(ai.allowed).map((id) => {
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
      : { label: 'Keep my data in OneDrive…', enabled: !config.safeMode(), click: dataFolder.moveDataToCloud },
    // Whether Claude chats get Chrome, unless a task's own Chrome button says otherwise.
    {
      label: 'Claude and Chrome',
      enabled: !config.safeMode(),
      submenu: [
        ['off', 'Off: chats never see my browser'],
        ['look', 'Look only: Claude reads pages I open, when I ask'],
        ['work', 'Work: Claude may click and type (uses more tokens)'],
      ].map(([mode, label]) => ({
        label,
        type: 'radio',
        checked: chat.deskChrome() === mode,
        click: () => {
          config.set({ chrome: mode, chromeDrive: mode === 'work' });
          desk.broadcast();
        },
      })),
    },
    {
      label: config.safeModeForced() ? 'Company-safe mode (set by your IT team)' : 'Company-safe mode (for a work computer)',
      type: 'checkbox',
      checked: config.safeMode(),
      enabled: !config.safeModeForced(),
      click: (i) => setSafeMode(i.checked),
    },
    {
      label: 'Put my tasks in order (AI)',
      type: 'checkbox',
      checked: config.get().orderTasks !== false,
      click: (i) => {
        config.set({ orderTasks: i.checked });
        desk.refresh();
      },
    },
    {
      label: 'Update other tasks when one is done',
      type: 'checkbox',
      checked: config.get().catchUp !== false,
      click: (i) => config.set({ catchUp: i.checked }),
    },
    {
      label: 'When a chat needs you',
      submenu: [
        { label: 'Flash its window', type: 'checkbox', checked: cueNow().flash, click: (i) => setCue({ flash: i.checked }) },
        { label: 'Windows notification', type: 'checkbox', checked: cueNow().notify, click: (i) => setCue({ notify: i.checked }) },
        { type: 'separator' },
        ...SOUNDS.map(([v, label]) => ({ label, type: 'radio', checked: cueNow().sound === v, click: () => setCue({ sound: v }, true) })),
      ],
    },
    {
      label: config.safeMode() ? 'Start with Windows (off in Company-safe mode)' : 'Start with Windows',
      type: 'checkbox',
      checked: shortcuts.autostartOn(),
      enabled: !config.safeMode(),
      click: (i) => shortcuts.setAutostart(i.checked),
    },
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
      enabled: !config.safeMode(),
      checked: config.get().autoUpdate === true && !config.safeMode(),
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

// Company-safe mode on or off for this computer (see config.safeMode).
async function setSafeMode(on) {
  config.set({ safeMode: !!on });
  updateFlow.scheduleUpdates();
  desk.broadcast();
  if (!on) return;
  shortcuts.setAutostart(false);
  const r = await dialog.showMessageBox({
    type: 'info',
    buttons: config.synced() ? ['Move my data back now', 'Later'] : ['OK'],
    defaultId: 0,
    message: 'Company-safe mode is on',
    detail: [
      'On this computer, Task Desk now:',
      '  • never updates by itself (Check for updates still asks first),',
      '  • starts chats without your Chrome browser,',
      '  • uses only Claude Code (no Codex or Gemini),',
      "  • doesn't start with Windows,",
      '  • keeps its data off OneDrive.',
      '',
      'Chats that are already running keep going as they are until they restart.',
      config.synced() ? 'Your data is in OneDrive right now. Move it back to this computer?' : '',
    ].join('\n'),
  });
  if (config.synced() && r.response === 0) dataFolder.moveDataHome();
}

Object.assign(module.exports, { createTray, setSafeMode, updateTray, setTrayImage, setAI, menu, connectWorkspace });
