const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, shell, clipboard, dialog, nativeImage, nativeTheme, Notification, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const state = require('./state');
const planner = require('./planner');
const chat = require('./chat');
const { readTasks, parseEmails } = require('./tasks');
const { appendFromNick, writeEnv } = require('./handback');
const icon = require('./icon');
const bridge = require('./bridge');

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
let watcher = null;

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
  };
}

const tier = (t) => (t.important ? 0 : t.low ? 2 : 1);

function payload() {
  const all = tasks.map(decorate);
  const open = all.filter((t) => state.isOpen(t.id)).sort((a, b) => tier(a) - tier(b) || a.minutes - b.minutes || (a.date || '').localeCompare(b.date || ''));
  const s = config.get();
  return {
    tasks: open,
    counts: {
      open: open.length,
      minutes: open.reduce((n, t) => n + (t.minutes || 0), 0),
      done: all.filter((t) => t.status === 'done').length,
      snoozed: all.filter((t) => t.status === 'snoozed').length,
    },
    mode: s.mode,
    root: config.root(),
    collapsed: s.collapsed,
  };
}

function broadcast() {
  const p = payload();
  for (const w of [box, ...taskWins.values()]) if (w && !w.isDestroyed()) w.webContents.send('tasks', p);
  updateTray(p.counts.open);
}

function refresh() {
  const firstEver = !state.state.everScanned;
  const fresh = readTasks(config.root());
  for (const t of fresh) {
    const isNew = !state.has(t.id);
    state.task(t.id).lastTitle = t.title;
    if (isNew && !firstEver && t.important && Notification.isSupported()) {
      console.log('notify: new urgent task', t.id);
      const n = new Notification({ title: 'New urgent task', body: `${t.title} · ${t.lane}`, icon: ICON_PNG });
      n.on('click', () => openTask(t.id));
      n.show();
    }
  }
  state.state.everScanned = true;
  state.save();
  tasks = fresh;
  planner.ensure(tasks);
  broadcast();
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(refresh, config.get().pollSeconds * 1000);
  try { watcher && watcher.close(); } catch {}
  try {
    let t = null;
    watcher = fs.watch(path.join(config.root(), 'ops'), (ev, f) => {
      if (f && /NEEDS_NICK/i.test(f)) { clearTimeout(t); t = setTimeout(refresh, 800); }
    });
  } catch {}
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
function applyLook() {
  const look = config.get().look;
  nativeTheme.themeSource = look.appearance;
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    w.webContents.setZoomFactor(ZOOM[look.size] || 1);
    if (w !== box) w.setBackgroundColor(windowBg());
    w.webContents.send('look', look);
  }
}

function createBox() {
  const s = config.get();
  const wa = screen.getPrimaryDisplay().workArea;
  const b = s.boxBounds || { x: wa.x + wa.width - BOX_W - 24, y: wa.y + 64, width: BOX_W, height: BOX_H };
  box = new BrowserWindow({
    x: b.x, y: b.y, width: BOX_W, height: s.collapsed ? BAR_H : b.height,
    minWidth: 300, minHeight: BAR_H, maxWidth: 520,
    frame: false, transparent: true, resizable: true, alwaysOnTop: true, skipTaskbar: true,
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

// ---------- tray & shortcuts ----------

function updateTray(count) {
  if (!tray) return;
  tray.setToolTip(`Nick's Task Desk · ${count} open task${count === 1 ? '' : 's'}`);
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
      message: 'Switch to the live Idea Factory?',
      detail: `Tasks will come from ${config.get().livePath}. The app only ever appends to ops\\FROM_NICK.md there.`,
    });
    if (r !== 0) return;
  }
  chat.stopAll();
  for (const w of taskWins.values()) w.destroy();
  taskWins.clear();
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
  for (const t of Object.values(state.state.tasks)) delete t.chatSessionId;
  state.save();
  for (const [id, w] of taskWins) if (!w.isDestroyed()) w.webContents.send('chat:reset', id);
}

function menu() {
  const s = config.get();
  return Menu.buildFromTemplate([
    { label: box && box.isVisible() ? 'Hide task box' : 'Show task box', accelerator: 'Ctrl+Alt+T', click: toggleBox },
    { type: 'separator' },
    { label: 'Test mode (copies)', type: 'radio', checked: s.mode === 'test', click: () => setMode('test') },
    { label: 'Live Idea Factory', type: 'radio', checked: s.mode === 'live', click: () => setMode('live') },
    { type: 'separator' },
    { label: 'Refresh tasks now', click: refresh },
    { label: 'Reset all chats…', click: resetAllChats },
    { label: 'Show snoozed & done again', click: () => { for (const t of Object.values(state.state.tasks)) if (t.status === 'snoozed') t.status = 'open'; state.save(); broadcast(); } },
    { label: 'Customize look…', click: () => { box.show(); box.webContents.send('look:open'); } },
    { label: 'Open FROM_NICK.md', click: () => shell.openPath(path.join(config.root(), 'ops', 'FROM_NICK.md')) },
    { label: 'Open app data folder', click: () => shell.openPath(config.DATA_DIR) },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: fs.existsSync(startupLink()), click: (i) => setAutostart(i.checked) },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
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
const resolvePath = (p) => (p ? (path.isAbsolute(p) ? path.normalize(p) : path.join(config.root(), p)) : null);

ipcMain.handle('tasks:list', () => payload());
ipcMain.handle('task:get', (e, id) => {
  const t = findTask(id);
  if (!t) return null;
  const c = planner.cached(t);
  return { task: decorate(t), plan: c ? c.plan : null, planOk: c ? c.ok : null, st: state.task(id), mode: config.get().mode };
});
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
ipcMain.on('look:get', (e) => { e.returnValue = config.get().look; });
ipcMain.handle('look:set', (e, patch) => {
  config.set({ look: { ...config.get().look, ...patch } });
  applyLook();
  return config.get().look;
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
  let file;
  try {
    file = appendFromNick(config.root(), { lane: t.lane, text: t.text, status, notes, results, ticked: steps ? `${ticked}/${steps}` : '' });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  state.update(id, { status: status === 'done' ? 'done' : 'skipped', notes, finishedAt: new Date().toISOString() });
  const next = goNext ? payload().tasks.find((x) => x.id !== id) : null;
  broadcast();
  const w = taskWins.get(id);
  setTimeout(() => { if (w && !w.isDestroyed()) w.close(); if (next) openTask(next.id); }, 650);
  return { ok: true, file };
});

ipcMain.handle('act:url', (e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
ipcMain.handle('act:copy', (e, text) => clipboard.writeText(String(text)));
ipcMain.handle('act:gmail', (e, { to = '', subject = '', body = '' }) => {
  const u = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  shell.openExternal(u);
});
ipcMain.handle('act:file', async (e, p) => {
  const f = resolvePath(p);
  if (!f || !fs.existsSync(f)) return { ok: false, error: 'File not found: ' + f };
  const err = await shell.openPath(f);
  return { ok: !err, error: err };
});
ipcMain.handle('act:folder', async (e, p) => {
  let f = resolvePath(p);
  if (f && fs.existsSync(f) && fs.statSync(f).isFile()) { shell.showItemInFolder(f); return { ok: true }; }
  while (f && !fs.existsSync(f) && path.dirname(f) !== f) f = path.dirname(f);
  if (!f) return { ok: false };
  await shell.openPath(f);
  return { ok: true, path: f };
});
ipcMain.handle('act:exists', (e, p) => { const f = resolvePath(p); return !!f && fs.existsSync(f); });
ipcMain.handle('act:emails', (e, p) => {
  const f = resolvePath(p);
  try {
    const r = parseEmails(fs.readFileSync(f, 'utf8'));
    return { ...r, file: f, attachPath: r.attach ? resolvePath(r.attach) : null };
  } catch (err) {
    return { emails: [], error: err.message };
  }
});
ipcMain.handle('act:env', (e, id, envPath, name, value) => {
  const f = resolvePath(envPath);
  const inFactory = f.toLowerCase().startsWith(path.resolve(config.get().livePath).toLowerCase());
  const r = dialog.showMessageBoxSync(winOf(e), {
    type: 'warning', buttons: ['Write the key', 'Cancel'], defaultId: 1, cancelId: 1,
    message: `Write ${name} into this .env file?`,
    detail: `${f}${inFactory ? '\n\nThis file is inside the Idea Factory.' : ''}\n\nThe key is not saved anywhere else (not in app data, logs or git).`,
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
app.on('before-quit', () => { app.isQuitting = true; chat.stopAll(); state.flush(); });
app.on('will-quit', () => globalShortcut.unregisterAll());

app.whenReady().then(async () => {
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
});
