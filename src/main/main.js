const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, shell, clipboard, dialog, nativeImage, nativeTheme, Notification, screen } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const config = require('./config');
const state = require('./state');
const planner = require('./planner');
const chat = require('./chat');
const { readTasks, parseEmails } = require('./tasks');
const { appendFromNick, appendResults, projectHeader, writeEnv } = require('./handback');
const projects = require('./projects');
const updater = require('./updater');
const icon = require('./icon');
const bridge = require('./bridge');

// Tests can run beside the real desk with their own browser profile (and so their own lock).
if (process.env.TASKDESK_USERDATA) app.setPath('userData', process.env.TASKDESK_USERDATA);
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setAppUserModelId('com.nick.taskdesk');

const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON_PNG = path.join(config.APP_ROOT, 'assets', 'icon.png');
const ICON_ICO = path.join(config.APP_ROOT, 'assets', 'icon.ico');
const BOX_W = 340;
const BOX_H = 520;
const BAR_H = 56;
// How wide the box can be stretched once it's unlocked.
const BOX_MIN_W = 300, BOX_MAX_W = 1000, BOX_MIN_H = 320;
const ZOOM = { s: 0.9, m: 1, l: 1.1, xl: 1.22 };
// Window background behind the page (shown while it loads), per theme.
const THEME_BG = {
  clay: ['#f6f1e9', '#1c1a17'], sage: ['#eef1ea', '#171b18'], ocean: ['#edf1f5', '#141820'],
  plum: ['#f4eff3', '#1b161b'], honey: ['#f8f2e2', '#1b1812'], graphite: ['#f2f2f1', '#141414'],
};

let box = null;
let tray = null;
let tasks = [];
const taskWins = new Map();
let pollTimer = null;
let watchers = [];

// ---------- tasks ----------

function decorate(t) {
  const c = planner.cached(t);
  const st = state.task(t.id);
  const plan = c && c.plan;
  const steps = plan ? plan.steps.length : 0;
  const ticked = plan ? plan.steps.filter((_, i) => st.ticks['s' + i]).length : 0;
  return {
    ...t,
    type: (plan && plan.type) || t.type,
    minutes: (plan && plan.est_minutes) || t.minutes,
    planStatus: planner.status(t),
    planOk: c ? c.ok : null,
    steps, ticked,
    status: st.status,
    snoozeUntil: st.snoozeUntil || null,
    chatLive: chat.isLive(t.id),
    projectName: t.project === 'factory' ? 'Workshop' : t.projectName,
    projectColor: projects.colorOf(t.project),
  };
}

const tier = (t) => (t.important ? 0 : t.low ? 2 : 1);

// Which project the box shows: 'all', 'factory' or a project id.
function currentView() {
  const v = config.get().view;
  return v === 'all' || v === 'factory' || projects.get(v) ? v : 'all';
}

function payload() {
  const view = currentView();
  const everything = tasks.map(decorate);
  const openAll = everything.filter((t) => state.isOpen(t.id)).sort((a, b) => tier(a) - tier(b) || a.minutes - b.minutes || (a.date || '').localeCompare(b.date || ''));
  const inView = (t) => view === 'all' || t.project === view;
  const all = everything.filter(inView);
  const open = openAll.filter(inView);
  const s = config.get();
  return {
    tasks: open,
    counts: {
      open: open.length,
      minutes: open.reduce((n, t) => n + (t.minutes || 0), 0),
      done: all.filter((t) => t.status === 'done').length,
      snoozed: all.filter((t) => t.status === 'snoozed').length,
    },
    totalOpen: openAll.length,
    view,
    projects: projects.summary().map((p) => ({ ...p, open: openAll.filter((t) => t.project === p.id).length })),
    mode: s.mode,
    root: config.root(),
    collapsed: s.collapsed,
    locked: s.boxLocked !== false,
    synced: config.synced(),
  };
}

function broadcast() {
  const p = payload();
  for (const w of [box, ...taskWins.values()]) if (w && !w.isDestroyed()) w.webContents.send('tasks', p);
  updateTray(p.totalOpen);
}

// Reads every project's tasks: the Workshop first, then the others.
function refresh() {
  const fresh = [];
  scan('factory', readTasks(config.root()), fresh);
  for (const p of projects.list()) scan(p.id, projects.read(p), fresh);
  state.save();
  tasks = fresh;
  planner.ensure(tasks);
  broadcast();
}

// Notifies about new urgent tasks (never on a project's very first scan).
function scan(key, list, out) {
  const mem = state.store(key);
  const firstEver = !mem.everScanned;
  for (const t of list) {
    const isNew = !state.has(t.id);
    state.task(t.id).lastTitle = t.title;
    if (isNew && !firstEver && t.important && Notification.isSupported()) {
      console.log('notify: new urgent task', t.id);
      const where = t.project === 'factory' ? t.lane : t.projectName;
      const n = new Notification({ title: 'New urgent task', body: `${t.title} · ${where}`, icon: ICON_PNG });
      n.on('click', () => openTask(t.id));
      n.show();
    }
  }
  mem.everScanned = true;
  out.push(...list);
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(refresh, config.get().pollSeconds * 1000);
  for (const w of watchers) try { w.close(); } catch {}
  watchers = [];
  // Re-read a moment after a task list file changes.
  let t = null;
  const watch = (dir, test) => {
    try { watchers.push(fs.watch(dir, (ev, f) => { if (f && test(f)) { clearTimeout(t); t = setTimeout(refresh, 800); } })); } catch {}
  };
  watch(path.join(config.root(), 'ops'), (f) => /NEEDS_NICK/i.test(f));
  for (const p of projects.list()) {
    const f = projects.tasksFile(p);
    if (f) watch(path.dirname(f), (name) => name.toLowerCase() === path.basename(f).toLowerCase());
  }
}

planner.events.on('status', () => broadcast());
planner.events.on('ready', (id) => {
  broadcast();
  const w = taskWins.get(id);
  if (w && !w.isDestroyed()) w.webContents.send('plan', id);
});

const findTask = (id) => tasks.find((t) => t.id === id);

// ---------- windows ----------

function windowBg() {
  const pair = THEME_BG[config.get().look.theme] || THEME_BG.clay;
  return pair[nativeTheme.shouldUseDarkColors ? 1 : 0];
}

// Light/dark follows the setting; "system" follows Windows.
// Which project a window belongs to, for project looks: the box follows the
// project it's showing; task and project windows follow their task's project.
function scopeOf(w) {
  if (!w) return null;
  if (w === box) return currentView();
  for (const [id, tw] of taskWins) if (tw === w) { const t = findTask(id); return t ? t.project : null; }
  for (const [id, pw] of projectWins) if (pw === w) return id === 'new' ? null : id;
  return null;
}
const ownLookOf = (scope) => { const p = scope && projects.get(scope); return p && p.ownLook ? p : null; };

// The look as a window sees it: the desk's look, with the project's own look on
// top when it has one. A picture frame also gets the picture's file address.
function lookOut(scope) {
  const p = scope && projects.get(scope);
  const own = ownLookOf(scope);
  const look = { ...config.get().look, ...(own ? own.look : {}) };
  look.newOwn = !!config.get().newProjectsOwnLook;
  if (p) Object.assign(look, { scopeId: p.id, scopeName: p.name, scopeOwn: !!own });
  if (look.picture) {
    const f = path.join(config.DATA_DIR, 'look', look.picture);
    look.pictureUrl = fs.existsSync(f) ? pathToFileURL(f).href : '';
  }
  return look;
}

// Nick picks a picture or GIF for the frame. A copy goes in the data folder
// (so it moves with OneDrive too); the old copy is removed.
async function pickFramePicture(scope) {
  const r = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || box, {
    title: 'Choose a picture or GIF for the frame', properties: ['openFile'],
    filters: [{ name: 'Pictures and GIFs', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const src = r.filePaths[0];
  if (fs.statSync(src).size > 40 * 1024 * 1024) return { ok: false, error: 'That file is over 40 MB. Pick a smaller one.' };
  const dir = path.join(config.DATA_DIR, 'look');
  fs.mkdirSync(dir, { recursive: true });
  const name = `frame-${Date.now()}${path.extname(src).toLowerCase()}`;
  fs.copyFileSync(src, path.join(dir, name));
  const own = ownLookOf(scope);
  const old = own ? (own.look || {}).picture : config.get().look.picture;
  if (own) projects.setLook(scope, { material: 'picture', picture: name });
  else config.set({ look: { ...config.get().look, material: 'picture', picture: name } });
  // Remove the old copy unless the desk or another project still uses it.
  const used = [config.get().look.picture, ...projects.list().map((p) => p.look && p.look.picture)];
  if (old && old !== name && !used.includes(old)) { try { fs.unlinkSync(path.join(dir, old)); } catch {} }
  applyLook();
  return { ok: true, look: lookOut(scope) };
}

function applyLook() {
  const look = config.get().look;
  nativeTheme.themeSource = look.appearance;
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    const mine = lookOut(scopeOf(w));
    w.webContents.setZoomFactor(ZOOM[mine.size] || 1);
    if (w !== box) w.setBackgroundColor(windowBg());
    w.webContents.send('look', mine);
  }
}

function createBox() {
  const s = config.get();
  const wa = screen.getPrimaryDisplay().workArea;
  const b = s.boxBounds || { x: wa.x + wa.width - BOX_W - 24, y: wa.y + 64, width: BOX_W, height: BOX_H };
  const width = Math.max(BOX_MIN_W, Math.min(BOX_MAX_W, b.width || BOX_W));
  box = new BrowserWindow({
    x: b.x, y: b.y, width, height: s.collapsed ? BAR_H : b.height,
    minWidth: BOX_MIN_W, minHeight: BAR_H, maxWidth: BOX_MAX_W,
    // Locked (the default) keeps the size fixed; the lock in the bottom-right corner frees it.
    frame: false, transparent: true, resizable: s.boxLocked === false && !s.collapsed, alwaysOnTop: true, skipTaskbar: true,
    show: false, icon: ICON_PNG, backgroundColor: '#00000000', hasShadow: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: false },
  });
  box.setAlwaysOnTop(true, 'floating');
  box.loadFile(path.join(RENDERER, 'box.html'));
  box.webContents.on('did-finish-load', () => box.webContents.setZoomFactor(ZOOM[s.look.size] || 1));
  box.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) box.show(); });
  box.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); box.hide(); } });
  const saveBounds = () => {
    if (!box || box.isDestroyed()) return;
    const cur = box.getBounds();
    const prev = config.get().boxBounds || {};
    config.set({ boxBounds: { ...cur, height: config.get().collapsed ? prev.height || BOX_H : cur.height } });
  };
  box.on('moved', saveBounds);
  box.on('resized', saveBounds);
  box.saveBounds = saveBounds;
}

function setBoxLocked(locked) {
  config.set({ boxLocked: locked });
  if (box && !box.isDestroyed()) box.setResizable(!locked && !config.get().collapsed);
  broadcast();
}

function toggleBox() {
  if (!box) return;
  if (box.isVisible() && box.isFocused()) box.hide();
  else { box.show(); box.focus(); }
}

function setCollapsed(c) {
  const b = box.getBounds();
  const expandedH = (config.get().boxBounds && config.get().boxBounds.height) || BOX_H;
  config.set({ collapsed: c });
  box.setResizable(!c && config.get().boxLocked === false);
  box.setBounds({ ...b, height: c ? BAR_H : expandedH }, true);
  broadcast();
}

function openTask(id) {
  const t = findTask(id);
  if (!t) return;
  const existing = taskWins.get(id);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
  const W = 1240, H = 800;
  const bb = box ? box.getBounds() : { x: 0, y: 0, width: 0 };
  const wa = screen.getDisplayMatching(bb).workArea;
  let x = bb.x - W - 16;
  if (x < wa.x) x = bb.x + bb.width + 16;
  if (x + W > wa.x + wa.width) x = Math.max(wa.x, Math.round(wa.x + (wa.width - W) / 2));
  const y = Math.max(wa.y, Math.min(bb.y, wa.y + wa.height - H));
  const w = new BrowserWindow({
    x: x + taskWins.size * 24, y: y + taskWins.size * 24, width: Math.min(W, wa.width), height: Math.min(H, wa.height),
    minWidth: 880, minHeight: 560, frame: false, show: false, icon: ICON_PNG, backgroundColor: windowBg(),
    title: t.title,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: false },
  });
  w.loadFile(path.join(RENDERER, 'task.html'), { query: { id } });
  w.webContents.on('did-finish-load', () => w.webContents.setZoomFactor(ZOOM[config.get().look.size] || 1));
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => { chat.stop(id); taskWins.delete(id); broadcast(); });
  taskWins.set(id, w);
}

// The "Add a project" / "Edit project" window. One per project.
const projectWins = new Map();
function openProjectEditor(id) {
  const key = id || 'new';
  const existing = projectWins.get(key);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
  const bb = box ? box.getBounds() : { x: 0, y: 0, width: 0 };
  const wa = screen.getDisplayMatching(bb).workArea;
  const W = 620, H = Math.min(820, wa.height);
  let x = bb.x - W - 16;
  if (x < wa.x) x = Math.max(wa.x, Math.round(wa.x + (wa.width - W) / 2));
  const w = new BrowserWindow({
    x, y: Math.max(wa.y, Math.min(bb.y, wa.y + wa.height - H)), width: W, height: H, minWidth: 520, minHeight: 520,
    frame: false, show: false, icon: ICON_PNG, backgroundColor: windowBg(), title: id ? 'Edit project' : 'Add a project',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: false },
  });
  w.loadFile(path.join(RENDERER, 'project.html'), { query: { id: id || '' } });
  w.webContents.on('did-finish-load', () => w.webContents.setZoomFactor(ZOOM[config.get().look.size] || 1));
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => projectWins.delete(key));
  projectWins.set(key, w);
}

function setView(view) {
  config.set({ view });
  broadcast();
  applyLook(); // a project with its own look restyles the box
}

// ---------- tray & shortcuts ----------

function updateTray(count) {
  if (!tray) return;
  tray.setToolTip(`Nick's Task Desk · ${count} open task${count === 1 ? '' : 's'}${projects.list().length ? ' (all projects)' : ''}`);
}

function startupLink() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', "Nick's Task Desk.lnk");
}
function desktopLink() {
  return path.join(app.getPath('desktop'), "Nick's Task Desk.lnk");
}
function writeLink(file, hidden) {
  return shell.writeShortcutLink(file, 'create', {
    target: process.execPath,
    args: `"${config.APP_ROOT}"${hidden ? ' --hidden' : ''}`,
    cwd: config.APP_ROOT,
    icon: ICON_ICO, iconIndex: 0,
    description: "Nick's Task Desk",
    appUserModelId: 'com.nick.taskdesk',
  });
}
function setAutostart(on) {
  if (on) writeLink(startupLink(), true);
  else try { fs.unlinkSync(startupLink()); } catch {}
  config.set({ autostart: on });
}
function ensureShortcuts() {
  if (config.get().shortcutsDone) return;
  try { writeLink(desktopLink(), false); } catch {}
  try { setAutostart(true); } catch {}
  config.set({ shortcutsDone: true });
}

function setMode(mode) {
  if (mode === config.get().mode) return;
  if (mode === 'live') {
    const r = dialog.showMessageBoxSync({
      type: 'question', buttons: ['Switch to live', 'Cancel'], defaultId: 0, cancelId: 1,
      message: 'Switch the Workshop to live?',
      detail: `Tasks will come from ${config.get().livePath}. The app only ever appends to ops\\FROM_NICK.md there.`,
    });
    if (r !== 0) return;
  }
  // Only the Workshop's windows close: other projects don't change with the mode.
  for (const [id, w] of [...taskWins]) if (state.projectOf(id) === 'factory') { chat.stop(id); w.destroy(); taskWins.delete(id); }
  config.set({ mode });
  state.use(mode);
  startPolling();
  refresh();
}

function resetAllChats() {
  const r = dialog.showMessageBoxSync({
    type: 'question', buttons: ['Reset all chats', 'Cancel'], defaultId: 1, cancelId: 1,
    message: 'Start every task chat fresh?',
    detail: 'Open chats close, and each task starts a brand-new chat next time. Old conversations stay in Claude Code\'s history (/resume).',
  });
  if (r !== 0) return;
  chat.stopAll();
  for (const t of state.allTasks()) delete t.chatSessionId;
  state.save();
  for (const [id, w] of taskWins) if (!w.isDestroyed()) w.webContents.send('chat:reset', id);
}

// Where Done notes go for what the box is showing (the Workshop's FROM_NICK.md when "All").
function resultsFor(view) {
  const p = projects.get(view);
  return p ? projects.resultsFile(p) : path.join(config.root(), 'ops', 'FROM_NICK.md');
}

function menu() {
  const s = config.get();
  const view = currentView();
  const cur = projects.get(view);
  const show = (v) => () => { setView(v); if (box) { box.show(); box.focus(); } };
  return Menu.buildFromTemplate([
    { label: box && box.isVisible() ? 'Hide task box' : 'Show task box', accelerator: 'Ctrl+Alt+T', click: toggleBox },
    { type: 'separator' },
    { label: 'All projects', type: 'radio', checked: view === 'all', click: show('all') },
    ...projects.summary().map((p) => ({ label: p.name, type: 'radio', checked: view === p.id, click: show(p.id) })),
    { label: 'Add a project…', click: () => openProjectEditor(null) },
    ...(cur ? [{ label: `Edit "${cur.name}"…`, click: () => openProjectEditor(cur.id) }] : []),
    { type: 'separator' },
    { label: 'Workshop: test copies', type: 'radio', checked: s.mode === 'test', click: () => setMode('test') },
    { label: 'Workshop: live', type: 'radio', checked: s.mode === 'live', click: () => setMode('live') },
    { type: 'separator' },
    { label: 'Refresh tasks now', click: refresh },
    { label: 'Reset all chats…', click: resetAllChats },
    { label: 'Show snoozed & done again', click: () => { for (const t of state.allTasks()) if (t.status === 'snoozed') t.status = 'open'; state.save(); broadcast(); } },
    { label: 'Customize look…', click: () => { box.show(); box.webContents.send('look:open'); } },
    { label: cur ? `Open "${cur.name}" results` : 'Open FROM_NICK.md', click: () => shell.openPath(resultsFor(view)) },
    { label: 'Open app data folder', click: () => shell.openPath(config.DATA_DIR) },
    { type: 'separator' },
    config.synced()
      ? { label: 'Move my data back to this computer…', click: moveDataHome }
      : { label: 'Keep my data in OneDrive…', click: moveDataToCloud },
    { label: 'Start with Windows', type: 'checkbox', checked: fs.existsSync(startupLink()), click: (i) => setAutostart(i.checked) },
    pendingUpdate
      ? { label: 'Restart to update', click: () => installUpdate(true) }
      : { label: 'Check for updates now', click: () => checkForUpdate(true) },
    { label: 'Update automatically (daily, 7 AM)', type: 'checkbox', checked: config.get().autoUpdate !== false, click: (i) => { config.set({ autoUpdate: i.checked }); scheduleUpdates(); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
}

// ---------- OneDrive ----------
// Moving the data folder copies settings, projects, ticks, notes and plans, then
// restarts. Chat history stays with each computer's Claude Code, and API keys are
// never in the data folder. A small in-use.json warns when the desk is already
// open on another computer, because OneDrive can't merge two copies of a file.

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

// ---------- updates ----------
// See updater.js. Checks GitHub every day at 7 AM, installs when the desk is idle.

const UPDATE_LOG = path.join(config.LOCAL_DIR, 'update.log');
let pendingUpdate = null, updateTimer = null, idleTimer = null, installing = false;
// Tests run their own copy and never update.
const autoUpdateOn = () => config.get().autoUpdate !== false && !process.env.TASKDESK_LOCAL_DATA && !process.env.TASKDESK_NO_UPDATE;
const windowsOpen = () => [...taskWins.values(), ...projectWins.values()].filter((w) => w && !w.isDestroyed()).length;
const logUpdate = (msg) => { try { fs.appendFileSync(UPDATE_LOG, `${new Date().toISOString()} ${msg}\n`); } catch {} };
const say = (title, body) => { try { new Notification({ title, body, icon: ICON_PNG }).show(); } catch {} };

async function checkForUpdate(manual) {
  const s = await updater.status(config.APP_ROOT);
  config.set({ lastUpdateCheck: Date.now() });
  const tell = (message, detail = '') => manual && dialog.showMessageBox({ type: 'info', buttons: ['OK'], message, detail });
  if (!s.ok) { logUpdate(`check: ${s.reason}`); tell('Couldn\'t check for updates', s.reason); return s; }
  if (!s.behind) { pendingUpdate = null; tell('Task Desk is up to date'); return s; }
  if (!s.canInstall) {
    logUpdate(`check: ${s.behind} new, not installed (own changes: ${s.dirty}, own commits: ${s.ahead})`);
    tell('There\'s a newer version, but this copy wasn\'t updated',
      'This copy of Task Desk has its own changes to the app (someone is working on the code here), so updating it automatically could lose them. Save or undo those changes, then check again.');
    return s;
  }
  pendingUpdate = s;
  logUpdate(`check: ${s.behind} new: ${s.changes.join(' | ')}`);
  if (manual) {
    const r = await dialog.showMessageBox({
      type: 'info', buttons: ['Install and restart', 'Later'], defaultId: 0, cancelId: 1,
      message: 'A new version of Task Desk is ready',
      detail: `${s.changes.map((c) => '• ' + c).join('\n')}\n\nIt takes a few seconds. Open task windows close; their chats come back when you reopen them.`,
    });
    if (r.response === 0) installUpdate(true);
  } else installWhenIdle();
  return s;
}

// Install once no task or project window is open, so nothing you're doing is cut off.
function installWhenIdle() {
  clearTimeout(idleTimer);
  if (!pendingUpdate) return;
  if (windowsOpen() || (box && box.isFocused())) {
    if (!pendingUpdate.told) {
      pendingUpdate.told = true;
      say('Task Desk update ready', 'It installs once your task windows are closed. Or choose "Restart to update" in the ⋯ menu.');
    }
    idleTimer = setTimeout(installWhenIdle, 20 * 60 * 1000);
    return;
  }
  installUpdate(true);
}

function installUpdate(relaunch) {
  const s = pendingUpdate;
  if (!s || installing) return;
  installing = true;
  config.set({ updatedNote: s.changes[0] || 'A new version' });
  if (!s.deps) {
    // Only the app's own files changed: update them now, then restart.
    const r = updater.pullNow(config.APP_ROOT);
    logUpdate(r.ok ? 'installed' : `install failed: ${r.error}`);
    if (!r.ok) { installing = false; pendingUpdate = null; config.set({ updatedNote: '' }); say('Task Desk couldn\'t update', r.error); return; }
    if (relaunch) restart();
    return;
  }
  // The packages changed too: a helper installs them after the desk has closed.
  if (!updater.startHelper({ root: config.APP_ROOT, relaunch, electron: process.execPath, log: UPDATE_LOG })) {
    installing = false;
    config.set({ updatedNote: '' });
    say('Task Desk update needs Node.js', 'This update needs "npm install", and Node.js wasn\'t found. Install Node.js, then choose Check for updates now.');
    return;
  }
  logUpdate('installing with helper');
  if (relaunch) { app.isQuitting = true; app.quit(); }
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
  releaseLock();
  state.flush();
  app.relaunch();
  app.isQuitting = true;
  app.exit(0);
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
      type: 'question', buttons: ['Use the data in OneDrive', 'Replace it with this computer\'s data', 'Cancel'], defaultId: 0, cancelId: 2,
      message: 'There\'s already Task Desk data in OneDrive',
      detail: `${target}\n\nIt's probably from your other computer. "Use the data in OneDrive" picks up where you left off there. "Replace" puts this computer's data there instead (the old copy is kept in a backup folder next to it).`,
    });
    if (r === 2) return;
    if (r === 1) {
      fs.cpSync(target, `${target} backup ${new Date().toISOString().slice(0, 10)}`, { recursive: true });
      copyData(config.DATA_DIR, target);
    }
  } else {
    const r = dialog.showMessageBoxSync({
      type: 'question', buttons: ['Move to OneDrive', 'Cancel'], defaultId: 0, cancelId: 1,
      message: 'Keep your Task Desk data in OneDrive?',
      detail: `Your projects, ticks, notes, plans and look settings move to:\n${target}\n\nOn another computer, install Task Desk and choose this again to pick up the same data. Chat history stays on each computer, and API keys are never stored there.\n\nTip: use Task Desk on one computer at a time. Task Desk restarts now.`,
    });
    if (r !== 0) return;
    copyData(config.DATA_DIR, target);
  }
  config.set({ dataDir: target });
  restart();
}

function moveDataHome() {
  const r = dialog.showMessageBoxSync({
    type: 'question', buttons: ['Move it back', 'Cancel'], defaultId: 0, cancelId: 1,
    message: 'Move your data back to this computer?',
    detail: `Copies everything from ${config.DATA_DIR} to ${config.LOCAL_DIR} and stops using OneDrive on this computer. The OneDrive copy is left alone. Task Desk restarts now.`,
  });
  if (r !== 0) return;
  copyData(config.DATA_DIR, config.LOCAL_DIR);
  config.set({ dataDir: null });
  restart();
}

const LOCK = path.join(config.DATA_DIR, 'in-use.json');
let lockTimer = null;
function beat() {
  try { fs.writeFileSync(LOCK, JSON.stringify({ computer: os.hostname(), at: Date.now() })); } catch {}
}
// Returns false if Nick chose to quit because the desk is open on another computer.
function takeLock() {
  if (!config.synced()) return true;
  try {
    const l = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    if (l.computer !== os.hostname() && Date.now() - l.at < 3 * 60 * 1000) {
      const r = dialog.showMessageBoxSync({
        type: 'warning', buttons: ['Open anyway', 'Quit'], defaultId: 1, cancelId: 1,
        message: `Task Desk looks open on ${l.computer}`,
        detail: 'Your data is shared through OneDrive. Using it on two computers at the same time can leave OneDrive with two versions of the same file. Close it on the other computer first, or open anyway.',
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
  try { if (JSON.parse(fs.readFileSync(LOCK, 'utf8')).computer === os.hostname()) fs.unlinkSync(LOCK); } catch {}
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON_PNG).resize({ width: 16, height: 16 }));
  tray.on('click', toggleBox);
  tray.on('right-click', () => tray.popUpContextMenu(menu()));
}

// ---------- chat tools (taskdesk MCP) ----------
// What the chat's Claude can do to its own task: read the plan, tick/comment a
// step, add to the notes. Changes show up live in the task window and the box.

function planView(t) {
  const c = planner.cached(t);
  const st = state.task(t.id);
  const steps = c && c.plan ? c.plan.steps : [];
  return {
    task: t.title, lane: t.lane, text: t.text,
    summary: c && c.plan ? c.plan.summary : null,
    steps: steps.map((s, i) => ({ step: i + 1, text: s.text, done: !!st.ticks['s' + i], comment: (st.stepNotes || {})['s' + i] || '' })),
    notes: st.notes || '',
    planReady: !!steps.length,
  };
}

function toWindow(id, change) {
  const w = taskWins.get(id);
  if (w && !w.isDestroyed()) w.webContents.send('task:changed', id, change);
}

async function chatTool(id, tool, args) {
  const t = findTask(id);
  if (!t) return { ok: false, error: 'This task is no longer open in Task Desk.' };
  const st = state.task(id);
  if (tool === 'get_task') return { ok: true, result: planView(t) };
  if (tool === 'update_step') {
    const c = planner.cached(t);
    const steps = c && c.plan ? c.plan.steps : [];
    const n = Number(args.step);
    if (!steps.length) return { ok: false, error: 'The plan is not ready yet.' };
    if (!Number.isInteger(n) || n < 1 || n > steps.length) return { ok: false, error: `Step must be 1-${steps.length}.` };
    const key = 's' + (n - 1);
    const change = { kind: 'step', key };
    if (typeof args.done === 'boolean') { st.ticks[key] = args.done; change.done = args.done; }
    if (typeof args.comment === 'string') {
      st.stepNotes = st.stepNotes || {};
      const text = args.comment.trim().slice(0, 1000);
      if (text) st.stepNotes[key] = text; else delete st.stepNotes[key];
      change.comment = text;
    }
    state.flush();
    toWindow(id, change);
    broadcast();
    return { ok: true, result: `Step ${n} updated${change.done === true ? ': done' : change.done === false ? ': not done' : ''}${change.comment ? ' (comment saved)' : ''}.` };
  }
  if (tool === 'add_note') {
    const text = String(args.text || '').trim().slice(0, 4000);
    if (!text) return { ok: false, error: 'Nothing to add.' };
    st.notes = st.notes ? `${st.notes.trimEnd()}\n${text}` : text;
    state.flush();
    toWindow(id, { kind: 'note', text, notes: st.notes });
    return { ok: true, result: 'Added to his notes.' };
  }
  return { ok: false, error: 'Unknown tool ' + tool };
}

// ---------- IPC ----------

const winOf = (e) => BrowserWindow.fromWebContents(e.sender);
// Relative paths in a plan are relative to its project's folder (the factory root for the Workshop).
function baseFor(e) {
  const w = winOf(e);
  const id = [...taskWins].find(([, x]) => x === w)?.[0];
  const t = id && findTask(id);
  return t && t.project !== 'factory' ? t.projectFolder || t.workDir : config.root();
}
const resolvePath = (p, e) => (p ? (path.isAbsolute(p) ? path.normalize(p) : path.join(e ? baseFor(e) : config.root(), p)) : null);

ipcMain.handle('tasks:list', () => payload());
ipcMain.handle('task:get', (e, id) => {
  const t = findTask(id);
  if (!t) return null;
  const c = planner.cached(t);
  return { task: decorate(t), plan: c ? c.plan : null, planOk: c ? c.ok : null, st: state.task(id), mode: config.get().mode, resultsTo: resultsKind(t) };
});
// Where this task's Done notes go: 'factory' (FROM_NICK.md), 'file' (the project's file) or 'app'.
function resultsKind(t) {
  const p = projects.get(t.project);
  return p ? p.results : 'factory';
}
ipcMain.handle('task:open', (e, id) => openTask(id));
ipcMain.handle('task:tick', (e, id, key, val) => {
  const st = state.task(id);
  st.ticks[key] = !!val;
  state.save();
  broadcast();
});
// Typed text is written to disk right away, so "Saved" in the window means saved.
ipcMain.handle('task:paste', (e, id, key, label, value) => {
  state.task(id).pastes[key] = { label, value };
  state.flush();
  return true;
});
ipcMain.handle('task:notes', (e, id, notes) => { state.update(id, { notes }); state.flush(); return true; });
// Used when a window closes mid-typing: blocks until the text is on disk.
ipcMain.on('task:saveSync', (e, id, kind, value, key, label) => {
  try {
    if (kind === 'notes') state.update(id, { notes: value });
    else state.task(id).pastes[key] = { label, value };
    state.flush();
    e.returnValue = true;
  } catch { e.returnValue = false; }
});
const senderScope = (e) => scopeOf(BrowserWindow.fromWebContents(e.sender));
ipcMain.on('look:get', (e) => { e.returnValue = lookOut(senderScope(e)); });
// Changes go to the project's own look when the window shows such a project, else to the desk's.
ipcMain.handle('look:set', (e, patch) => {
  const scope = senderScope(e);
  if (ownLookOf(scope)) projects.setLook(scope, patch);
  else config.set({ look: { ...config.get().look, ...patch } });
  applyLook();
  return lookOut(scope);
});
// Give the showing project its own look (starting from the desk's, in the project's color), or drop it.
ipcMain.handle('look:own', (e, on) => {
  const scope = senderScope(e);
  const p = scope && projects.get(scope);
  if (!p) return lookOut(scope);
  projects.setOwnLook(scope, !!on);
  applyLook();
  return lookOut(scope);
});
ipcMain.handle('look:newOwn', (e, on) => { config.set({ newProjectsOwnLook: !!on }); applyLook(); return lookOut(senderScope(e)); });
ipcMain.handle('look:picture', (e) => pickFramePicture(senderScope(e)));
// The box's size lock, and the corner grip that stretches it while unlocked.
ipcMain.handle('box:lock', (e, locked) => { setBoxLocked(!!locked); return !!locked; });
// The renderer only says start / move / end; the size comes from where the mouse
// is on screen, so it stays right at any text size or screen scaling.
let grab = null;
ipcMain.handle('box:resize', (e, phase) => {
  if (!box || box.isDestroyed() || config.get().boxLocked !== false || config.get().collapsed) return null;
  const cur = screen.getCursorScreenPoint();
  if (phase === 'start') { grab = { cur, b: box.getBounds() }; return null; }
  if (!grab) return null;
  const { b } = grab;
  const wa = screen.getDisplayMatching(b).workArea;
  const width = Math.round(Math.max(BOX_MIN_W, Math.min(BOX_MAX_W, wa.x + wa.width - b.x, b.width + cur.x - grab.cur.x)));
  const height = Math.round(Math.max(BOX_MIN_H, Math.min(wa.y + wa.height - b.y, b.height + cur.y - grab.cur.y)));
  box.setBounds({ x: b.x, y: b.y, width, height });
  if (phase === 'end') { grab = null; box.saveBounds(); }
  return { width, height };
});
ipcMain.handle('task:replan', (e, id) => { const t = findTask(id); if (t) planner.regenerate(t); });
ipcMain.handle('task:snooze', (e, id, when) => {
  const d = new Date();
  d.setDate(d.getDate() + (when === 'week' ? 7 : 1));
  d.setHours(8, 0, 0, 0);
  state.update(id, { status: 'snoozed', snoozeUntil: d.toISOString() });
  broadcast();
  return d.toISOString();
});
ipcMain.handle('task:finish', (e, id, status, notes, goNext) => {
  const t = findTask(id);
  if (!t) return { ok: false };
  const st = state.task(id);
  const c = planner.cached(t);
  const steps = c ? c.plan.steps.length : 0;
  const ticked = c ? c.plan.steps.filter((_, i) => st.ticks['s' + i]).length : 0;
  const results = Object.values(st.pastes).filter((p) => p && p.value && String(p.value).trim());
  if (c) c.plan.steps.forEach((s, i) => { const n = (st.stepNotes || {})['s' + i]; if (n) results.push({ label: `Step ${i + 1} comment (${s.text.slice(0, 60)})`, value: n }); });
  const entry = { lane: t.lane, text: t.text, status, notes, results, ticked: steps ? `${ticked}/${steps}` : '' };
  const p = projects.get(t.project);
  let file;
  try {
    file = p ? appendResults(projects.resultsFile(p), entry, projectHeader(p.name)) : appendFromNick(config.root(), entry);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  state.update(id, { status: status === 'done' ? 'done' : 'skipped', notes, finishedAt: new Date().toISOString() });
  const next = goNext ? payload().tasks.find((x) => x.id !== id) : null;
  broadcast();
  const w = taskWins.get(id);
  setTimeout(() => { if (w && !w.isDestroyed()) w.close(); if (next) openTask(next.id); }, 650);
  return { ok: true, file, resultsTo: resultsKind(t) };
});

// ---------- projects ----------
ipcMain.handle('view:set', (e, view) => setView(view));
ipcMain.handle('project:edit', (e, id) => openProjectEditor(id || null));
ipcMain.handle('project:get', (e, id) => {
  const p = projects.get(id);
  return p ? { ...p, resultsPath: projects.resultsFile(p), missing: projects.missing(p) } : null;
});
ipcMain.handle('project:save', (e, draft) => {
  const r = projects.save(draft);
  if (!r.ok) return r;
  if (r.created) config.set({ view: r.project.id });
  refresh();
  startPolling();
  applyLook();
  return { ...r, resultsPath: projects.resultsFile(r.project) };
});
ipcMain.handle('project:remove', (e, id) => {
  const p = projects.get(id);
  if (!p) return false;
  const r = dialog.showMessageBoxSync(winOf(e), {
    type: 'question', buttons: ['Remove project', 'Cancel'], defaultId: 1, cancelId: 1,
    message: `Remove "${p.name}" from Task Desk?`,
    detail: 'Its tasks leave the box. Nothing in the project folder is touched, and your notes and results stay in the app data folder in case you add it back.',
  });
  if (r !== 0) return false;
  for (const [id2, w] of [...taskWins]) if (state.projectOf(id2) === id) w.close();
  projects.remove(id);
  refresh();
  startPolling();
  return true;
});
ipcMain.handle('project:preview', (e, draft) => projects.preview(draft));
ipcMain.handle('project:suggest', (e, folder) => projects.suggest(folder));
ipcMain.handle('project:pick', async (e, kind, from) => {
  const r = await dialog.showOpenDialog(winOf(e), kind === 'folder'
    ? { title: 'Choose the project folder', defaultPath: from || 'C:\\MrC', properties: ['openDirectory'] }
    : { title: 'Choose the checklist file', defaultPath: from || undefined, properties: ['openFile'], filters: [{ name: 'Checklists', extensions: ['md', 'txt'] }, { name: 'All files', extensions: ['*'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('project:open', (e, p) => { if (p && fs.existsSync(p)) shell.openPath(p); else return { ok: false, error: 'Nothing there yet: it appears after your first Done.' }; });
ipcMain.handle('task:add', (e, pid, text) => {
  const id = projects.addTask(pid, text);
  if (id) refresh();
  return id;
});

ipcMain.handle('act:url', (e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
ipcMain.handle('act:copy', (e, text) => clipboard.writeText(String(text)));
ipcMain.handle('act:gmail', (e, { to = '', subject = '', body = '' }) => {
  const u = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  shell.openExternal(u);
});
ipcMain.handle('act:file', async (e, p) => {
  const f = resolvePath(p, e);
  if (!f || !fs.existsSync(f)) return { ok: false, error: 'File not found: ' + f };
  const err = await shell.openPath(f);
  return { ok: !err, error: err };
});
ipcMain.handle('act:folder', async (e, p) => {
  let f = resolvePath(p, e);
  if (f && fs.existsSync(f) && fs.statSync(f).isFile()) { shell.showItemInFolder(f); return { ok: true }; }
  while (f && !fs.existsSync(f) && path.dirname(f) !== f) f = path.dirname(f);
  if (!f) return { ok: false };
  await shell.openPath(f);
  return { ok: true, path: f };
});
ipcMain.handle('act:exists', (e, p) => { const f = resolvePath(p, e); return !!f && fs.existsSync(f); });
ipcMain.handle('act:emails', (e, p) => {
  const f = resolvePath(p, e);
  try {
    const r = parseEmails(fs.readFileSync(f, 'utf8'));
    return { ...r, file: f, attachPath: r.attach ? resolvePath(r.attach, e) : null };
  } catch (err) {
    return { emails: [], error: err.message };
  }
});
ipcMain.handle('act:env', (e, id, envPath, name, value) => {
  const f = resolvePath(envPath, e);
  const inFactory = f.toLowerCase().startsWith(path.resolve(config.get().livePath).toLowerCase());
  const r = dialog.showMessageBoxSync(winOf(e), {
    type: 'warning', buttons: ['Write the key', 'Cancel'], defaultId: 1, cancelId: 1,
    message: `Write ${name} into this .env file?`,
    detail: `${f}${inFactory ? '\n\nThis file is inside the Workshop.' : ''}\n\nThe key is not saved anywhere else (not in app data, logs or git).`,
  });
  if (r !== 0) return { ok: false, cancelled: true };
  try { writeEnv(f, name, value); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('chat:start', (e, id, mode, cols, rows) => {
  const t = findTask(id);
  const w = winOf(e);
  if (!t || !w) return;
  const c = planner.cached(t);
  const send = (ch, ...a) => { if (!w.isDestroyed()) w.webContents.send(ch, ...a); };
  chat.start(t, c && c.plan, {
    mode, cols, rows,
    onData: (d) => send('chat:data', id, d),
    onExit: (code) => { send('chat:exit', id, code); broadcast(); },
    onInfo: (info) => send('chat:info', id, info),
  });
  broadcast();
});
ipcMain.handle('chat:write', (e, id, d) => chat.write(id, d));
ipcMain.handle('chat:send', (e, id, text) => chat.send(id, text));
ipcMain.handle('chat:resize', (e, id, c, r) => chat.resize(id, c, r));
ipcMain.handle('chat:stop', (e, id) => { chat.stop(id); broadcast(); });

ipcMain.handle('win:close', (e) => winOf(e) && winOf(e).close());
ipcMain.handle('win:min', (e) => winOf(e) && winOf(e).minimize());
ipcMain.handle('win:max', (e) => { const w = winOf(e); if (w) w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.handle('win:hide', () => box && box.hide());
ipcMain.handle('win:collapse', (e, c) => setCollapsed(c));
ipcMain.handle('app:menu', (e) => menu().popup({ window: winOf(e) }));
ipcMain.handle('tray:badge', (e, dataUrl) => {
  if (tray && dataUrl) tray.setImage(nativeImage.createFromDataURL(dataUrl));
});

// ---------- lifecycle ----------

app.on('second-instance', () => { if (box) { box.show(); box.focus(); } });
app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  app.isQuitting = true; chat.stopAll(); state.flush(); releaseLock();
  // A waiting update installs when you quit; it's there next time the desk opens.
  if (pendingUpdate && !installing) installUpdate(false);
});
app.on('will-quit', () => globalShortcut.unregisterAll());

app.whenReady().then(async () => {
  if (config.dataMissing) {
    dialog.showMessageBoxSync({
      type: 'warning', buttons: ['OK'],
      message: 'Can\'t find your OneDrive data folder',
      detail: `${config.wantedDataDir}\n\nTask Desk is using this computer's own data for now. Check that OneDrive is running and signed in, then restart Task Desk.`,
    });
  }
  if (!takeLock()) { app.isQuitting = true; app.quit(); return; }
  await bridge.start(chatTool).catch((e) => console.warn('chat tools unavailable:', e.message));
  if (!fs.existsSync(ICON_PNG)) { fs.mkdirSync(path.dirname(ICON_PNG), { recursive: true }); fs.writeFileSync(ICON_PNG, icon.png(256)); }
  if (!fs.existsSync(ICON_ICO)) fs.writeFileSync(ICON_ICO, icon.ico());
  nativeTheme.themeSource = config.get().look.appearance;
  createTray();
  createBox();
  if (!globalShortcut.register(config.get().hotkey, toggleBox)) console.warn('Hotkey already taken:', config.get().hotkey);
  ensureShortcuts();
  refresh();
  startPolling();
  scheduleUpdates();
  const note = config.get().updatedNote;
  if (note) { config.set({ updatedNote: '' }); say('Task Desk was updated', note); }
});
