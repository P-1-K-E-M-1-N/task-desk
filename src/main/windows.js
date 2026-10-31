// The three kinds of window (the box, a task, the project editor): where they
// go on screen, their bounds, and how they look (theme, light/dark, text size,
// a project's own look, picture frames). Other modules reach the windows through
// box(), taskWins and projectWins.
const { app, BrowserWindow, dialog, nativeTheme, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const config = require('./config');
const chat = require('./chat');
const projects = require('./projects');
const desk = require('./desk');

const BOX_W = 340;
const BOX_H = 520;
const BAR_H = 56;
// How wide the box can be stretched once it's unlocked.
const BOX_MIN_W = 300,
  BOX_MAX_W = 1000,
  BOX_MIN_H = 320;
const ZOOM = { s: 0.9, m: 1, l: 1.1, xl: 1.22 };
// Window background behind the page (shown while it loads), per theme.
const THEME_BG = {
  clay: ['#f6f1e9', '#1c1a17'],
  sage: ['#eef1ea', '#171b18'],
  ocean: ['#edf1f5', '#141820'],
  plum: ['#f4eff3', '#1b161b'],
  honey: ['#f8f2e2', '#1b1812'],
  graphite: ['#f2f2f1', '#141414'],
};

let box = null;
const taskWins = new Map();
// The "Add a project" / "Edit project" windows, one per project ('new' for a new one).
const projectWins = new Map();

const webPreferences = () => ({ preload: desk.PRELOAD, contextIsolation: true, sandbox: true });

function windowBg() {
  const pair = THEME_BG[config.get().look.theme] || THEME_BG.clay;
  return pair[nativeTheme.shouldUseDarkColors ? 1 : 0];
}

// Which project a window belongs to, for project looks: the box follows the
// project it's showing; task and project windows follow their task's project.
function scopeOf(w) {
  if (!w) return null;
  if (w === box) return desk.currentView();
  for (const [id, tw] of taskWins)
    if (tw === w) {
      const t = desk.findTask(id);
      return t ? t.project : null;
    }
  for (const [id, pw] of projectWins) if (pw === w) return id === 'new' ? null : id;
  return null;
}
const ownLookOf = (scope) => {
  const p = scope && projects.get(scope);
  return p && p.ownLook ? p : null;
};

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

// The user picks a picture or GIF for the frame. A copy goes in the data folder
// (so it moves with OneDrive too); the old copy is removed.
async function pickFramePicture(scope) {
  const r = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || box, {
    title: 'Choose a picture or GIF for the frame',
    properties: ['openFile'],
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
  if (old && old !== name && !used.includes(old)) {
    try {
      fs.unlinkSync(path.join(dir, old));
    } catch {}
  }
  applyLook();
  return { ok: true, look: lookOut(scope) };
}

// "Day & night" (appearance 'cycle') is light from 7:00 to 19:00 and dark the rest;
// the windows follow the clock (see ui.js), and so does Windows' own theming of them.
// Light/dark otherwise follows the setting; "system" follows Windows.
const DAY_FROM = 7,
  DAY_TO = 19;
const isNight = (d = new Date()) => d.getHours() < DAY_FROM || d.getHours() >= DAY_TO;
const themeSource = (a) => (a === 'cycle' ? (isNight() ? 'dark' : 'light') : a);
setInterval(() => {
  const a = config.get().look.appearance;
  if (a === 'cycle' && nativeTheme.themeSource !== themeSource(a)) applyLook();
}, 60 * 1000);

function applyLook() {
  const look = config.get().look;
  nativeTheme.themeSource = themeSource(look.appearance);
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
    x: b.x,
    y: b.y,
    width,
    height: s.collapsed ? BAR_H : b.height,
    minWidth: BOX_MIN_W,
    minHeight: BAR_H,
    maxWidth: BOX_MAX_W,
    // Locked (the default) keeps the size fixed; the lock in the bottom-right corner frees it.
    // It has a taskbar button (pin it to start the desk with one click) unless that's turned off in the ⋯ menu.
    frame: false,
    transparent: true,
    resizable: s.boxLocked === false && !s.collapsed,
    alwaysOnTop: true,
    skipTaskbar: s.showInTaskbar === false,
    show: false,
    icon: desk.ICON_PNG,
    backgroundColor: '#00000000',
    hasShadow: true,
    webPreferences: webPreferences(),
  });
  box.setAlwaysOnTop(true, 'floating');
  // "Pin to taskbar" on the box's button pins Task Desk itself (not plain Electron).
  if (process.platform === 'win32') {
    box.setAppDetails({
      appId: desk.APP_ID,
      appIconPath: desk.ICON_ICO,
      appIconIndex: 0,
      relaunchCommand: `"${process.execPath}" "${config.APP_ROOT}"`,
      relaunchDisplayName: 'Task Desk',
    });
  }
  box.loadFile(path.join(desk.RENDERER, 'box.html'));
  box.webContents.on('did-finish-load', () => box.webContents.setZoomFactor(ZOOM[s.look.size] || 1));
  box.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) box.show();
  });
  box.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      tuckAway();
    }
  });
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
  desk.broadcast();
}

// The corner grip that stretches the box while unlocked. The renderer only says
// start / move / end; the size comes from where the mouse is on screen, so it
// stays right at any text size or screen scaling.
let grab = null;
function dragResize(phase) {
  if (!box || box.isDestroyed() || config.get().boxLocked !== false || config.get().collapsed) return null;
  const cur = screen.getCursorScreenPoint();
  if (phase === 'start') {
    grab = { cur, b: box.getBounds() };
    return null;
  }
  if (!grab) return null;
  const { b } = grab;
  const wa = screen.getDisplayMatching(b).workArea;
  const width = Math.round(Math.max(BOX_MIN_W, Math.min(BOX_MAX_W, wa.x + wa.width - b.x, b.width + cur.x - grab.cur.x)));
  const height = Math.round(Math.max(BOX_MIN_H, Math.min(wa.y + wa.height - b.y, b.height + cur.y - grab.cur.y)));
  box.setBounds({ x: b.x, y: b.y, width, height });
  if (phase === 'end') {
    grab = null;
    box.saveBounds();
  }
  return { width, height };
}

// Putting the box away: with the taskbar button on, it minimizes so the button
// stays and one click brings it back; otherwise it hides to the tray.
function tuckAway() {
  if (!box) return;
  if (config.get().showInTaskbar !== false) box.minimize();
  else box.hide();
}

function toggleBox() {
  if (!box) return;
  if (box.isVisible() && box.isFocused() && !box.isMinimized()) tuckAway();
  else {
    if (box.isMinimized()) box.restore();
    box.show();
    box.focus();
  }
}

// Bring the box up (the taskbar pin, Start menu or desktop icon started the app again).
function showBox() {
  if (!box) return;
  if (box.isMinimized()) box.restore();
  box.show();
  box.focus();
}

function setCollapsed(c) {
  const b = box.getBounds();
  const expandedH = (config.get().boxBounds && config.get().boxBounds.height) || BOX_H;
  config.set({ collapsed: c });
  box.setResizable(!c && config.get().boxLocked === false);
  box.setBounds({ ...b, height: c ? BAR_H : expandedH }, true);
  desk.broadcast();
}

function openTask(id, bounds) {
  const t = desk.findTask(id);
  if (!t) return;
  const existing = taskWins.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  const W = 1240,
    H = 800;
  const bb = box ? box.getBounds() : { x: 0, y: 0, width: 0 };
  const wa = screen.getDisplayMatching(bb).workArea;
  let x = bb.x - W - 16;
  if (x < wa.x) x = bb.x + bb.width + 16;
  if (x + W > wa.x + wa.width) x = Math.max(wa.x, Math.round(wa.x + (wa.width - W) / 2));
  const y = Math.max(wa.y, Math.min(bb.y, wa.y + wa.height - H));
  const w = new BrowserWindow({
    x: x + taskWins.size * 24,
    y: y + taskWins.size * 24,
    width: Math.min(W, wa.width),
    height: Math.min(H, wa.height),
    minWidth: 880,
    minHeight: 560,
    frame: false,
    show: false,
    icon: desk.ICON_PNG,
    backgroundColor: windowBg(),
    title: t.title,
    webPreferences: webPreferences(),
  });
  if (bounds) {
    const { x, y, width, height } = bounds;
    w.setBounds({ x, y, width, height });
    if (bounds.maximized) w.maximize();
  }
  w.loadFile(path.join(desk.RENDERER, 'task.html'), { query: { id } });
  w.webContents.on('did-finish-load', () => w.webContents.setZoomFactor(ZOOM[config.get().look.size] || 1));
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => {
    chat.stop(id);
    taskWins.delete(id);
    desk.broadcast();
  });
  taskWins.set(id, w);
}

function openProjectEditor(id) {
  const key = id || 'new';
  const existing = projectWins.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  const bb = box ? box.getBounds() : { x: 0, y: 0, width: 0 };
  const wa = screen.getDisplayMatching(bb).workArea;
  const W = 620,
    H = Math.min(820, wa.height);
  let x = bb.x - W - 16;
  if (x < wa.x) x = Math.max(wa.x, Math.round(wa.x + (wa.width - W) / 2));
  const w = new BrowserWindow({
    x,
    y: Math.max(wa.y, Math.min(bb.y, wa.y + wa.height - H)),
    width: W,
    height: H,
    minWidth: 520,
    minHeight: 520,
    frame: false,
    show: false,
    icon: desk.ICON_PNG,
    backgroundColor: windowBg(),
    title: id ? 'Edit project' : 'Add a project',
    webPreferences: webPreferences(),
  });
  w.loadFile(path.join(desk.RENDERER, 'project.html'), { query: { id: id || '' } });
  w.webContents.on('did-finish-load', () => w.webContents.setZoomFactor(ZOOM[config.get().look.size] || 1));
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => projectWins.delete(key));
  projectWins.set(key, w);
}

// Every window that is still there.
const liveWins = () => [box, ...taskWins.values(), ...projectWins.values()].filter((w) => w && !w.isDestroyed());

Object.assign(module.exports, {
  box: () => box,
  taskWins,
  projectWins,
  scopeOf,
  ownLookOf,
  lookOut,
  pickFramePicture,
  themeSource,
  applyLook,
  createBox,
  setBoxLocked,
  dragResize,
  tuckAway,
  toggleBox,
  showBox,
  setCollapsed,
  openTask,
  openProjectEditor,
  liveWins,
});
