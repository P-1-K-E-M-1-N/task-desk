// What every other part of the main process shares: the app id and paths, and
// the task list the box shows. Tasks are read from every project (the lanes
// workspace first), re-read on a timer and when a task file changes, and sent
// to the open windows.
//
// windows.js and menu.js require this module back, so they are reached through
// their module objects at call time, never destructured at load.
const { Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const state = require('./state');
const planner = require('./planner');
const chat = require('./chat');
const attention = require('./attention');
const claims = require('./claims');
const handoff = require('./handoff');
const { readTasks, normType } = require('./tasks');
const projects = require('./projects');
const ai = require('./ai');
const order = require('./order');
const log = require('./log');
const windows = require('./windows');
const menu = require('./menu');

// Windows groups taskbar buttons, pins and notifications by this id, and caches
// an icon for it. The id changed when the icon did (the old one kept showing
// Electron's icon); ensureShortcuts() moves the shortcuts over. Tests use their
// own id, so a test copy can't leave Windows a shortcut with Electron's icon for
// the real one.
// TASKDESK_TEST is set by every test (test/env.js), even the one that runs the
// app in its normal data mode, so tests never touch this computer's shortcuts,
// taskbar id or updates.
const TESTING = !!(process.env.TASKDESK_LOCAL_DATA || process.env.TASKDESK_TEST);
const APP_ID = TESTING ? 'com.taskdesk.desk.test' : 'com.taskdesk.desk';

const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload.js');
// Files Windows would run rather than show. The app opens documents and folders, never programs.
const RUNS = /\.(exe|bat|cmd|com|msi|msix|appx|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|scr|pif|lnk|url|reg|hta|cpl|msc|jar|inf|sct)$/i;
const ICON_PNG = path.join(config.APP_ROOT, 'assets', 'icon.png');
const ICON_ICO = path.join(config.APP_ROOT, 'assets', 'icon.ico');

let tasks = [];
let pollTimer = null;
let watchers = [];

// Whether this task's chat gets Chrome: 'off', 'look' or 'work' (see chat.js).
const chromeDrive = (id) => chat.chromeWork({ id });
const chromeMode = (id) => chat.chromeMode({ id });

// A task as the windows see it: with its plan's type and estimate, its state and its project.
function decorate(t) {
  const c = planner.cached(t);
  const st = state.task(t.id);
  const plan = c && c.plan;
  const steps = plan ? plan.steps.length : 0;
  const ticked = plan ? plan.steps.filter((_, i) => st.ticks['s' + i]).length : 0;
  return {
    ...t,
    type: plan && plan.type ? normType(plan.type, t.text) : t.type,
    minutes: (plan && plan.est_minutes) || t.minutes,
    planStatus: planner.status(t),
    planOk: c ? c.ok : null,
    updatedAfter: (c && c.updatedAfter) || null,
    chromeDrive: chromeDrive(t.id),
    chrome: chromeMode(t.id),
    chromeLocked: config.safeMode(),
    steps,
    ticked,
    status: st.status,
    snoozeUntil: st.snoozeUntil || null,
    chatLive: chat.isLive(t.id),
    // Whether opening it starts its chat at once (the project's switch), or waits for Start.
    autoStart: t.project === 'factory' ? !!config.get().factoryAutoStart : !!t.autoStart,
    needs: chat.needs(t.id),
    // What its chat says it's doing (set_status), and how many files that chat holds.
    doing: st.doing && chat.isLive(t.id) ? st.doing.text : '',
    editing: claims.holdings(t.id).length,
    aiName: ai.pick(t).app,
    // Claude's model and effort for this task's chat, and its own choice (when per task is on).
    claude:
      ai.pick(t).id === 'claude'
        ? { ...ai.modelFor(t), own: ai.modelSetting(`task:${t.id}`), base: ai.modelFor(t, { withTask: false }) }
        : null,
    projectName: t.project === 'factory' ? config.factoryName() : t.projectName,
    projectColor: projects.colorOf(t.project),
  };
}

// Which project the box shows: 'all', 'factory' or a project id.
function currentView() {
  const v = config.get().view;
  return v === 'all' || (v === 'factory' && config.factoryOn()) || projects.get(v) ? v : 'all';
}

function payload() {
  const view = currentView();
  const everything = tasks.map(decorate);
  // Tasks that others wait on come first; the rest A to Z (see order.js).
  const openNow = everything.filter((t) => state.isOpen(t.id));
  const openAll = order.sortTasks(openNow, order.needsFor(openNow)).map((t) => ({ ...t, waitsOn: order.waitsOn(t, openNow) }));
  const inView = (t) => view === 'all' || t.project === view;
  const all = everything.filter(inView);
  const open = openAll.filter(inView);
  const s = config.get();
  const counts = {
    open: open.length,
    minutes: open.reduce((n, t) => n + (t.minutes || 0), 0),
    done: all.filter((t) => t.status === 'done').length,
    snoozed: all.filter((t) => t.status === 'snoozed').length,
  };
  // Claude's model and effort for the view's scope (a project, or the desk in "All projects").
  const scope = view === 'all' ? 'desk' : view;
  return {
    tasks: open,
    counts,
    // How far the project on show is toward its end goal (a rough AI guess, or the share of tasks done).
    goal: view === 'all' ? null : order.progress(view, counts),
    totalOpen: openAll.length,
    totalNeeds: openAll.filter((t) => t.needs).length,
    // Chats running (task chats and main chats), for the box's stop-all button.
    liveChats: chat.liveIds().length,
    // Notes from task chats waiting for the main chat of the project on show.
    mainNotes: view === 'all' ? 0 : handoff.pending(view),
    view,
    projects: projects.summary().map((p) => ({ ...p, open: openAll.filter((t) => t.project === p.id).length })),
    mode: s.mode,
    root: config.root(),
    // The person (greeting, and whether to ask their name) and the optional workspace.
    me: { name: config.userName(), about: s.userAbout || '', asked: !!s.userNameAsked },
    factory: config.factoryOn() ? { name: config.factoryName() } : null,
    collapsed: s.collapsed,
    locked: s.boxLocked !== false,
    ai: { ...ai.choices(null), project: projects.get(view) && projects.get(view).ai ? projects.get(view).ai : null },
    synced: config.synced(),
    models: {
      scope,
      own: ai.modelSetting(scope),
      desk: ai.modelSetting('desk'),
      perTask: ai.perTaskOn(),
      list: ai.MODELS,
      efforts: ai.EFFORTS,
    },
    ordering: s.orderTasks !== false,
  };
}

function broadcast() {
  const p = payload();
  for (const w of [windows.box(), ...windows.taskWins.values()]) if (w && !w.isDestroyed()) w.webContents.send('tasks', p);
  menu.updateTray(p.totalOpen, p.totalNeeds);
}

// The settings for a chat that's waiting on the user (⋯ menu, "When a chat needs you").
const cueSettings = () => ({ flash: true, notify: true, sound: 'off', ...(config.get().cue || {}) });

// A chat started or stopped waiting on the user: the box marks its card and
// counts it on the tray; its window's taskbar button flashes; and unless that
// window is in front, a notification and the chosen sound.
attention.onChange((id, kind) => {
  broadcast();
  const key = id.startsWith('main-') ? id.slice(5) : null;
  const w = key ? windows.mainWins.get(key) : windows.taskWins.get(id);
  const open = !!w && !w.isDestroyed();
  const cue = cueSettings();
  if (open) w.flashFrame(!!kind && cue.flash && !w.isFocused());
  if (!kind || (open && w.isFocused())) return;
  const t = key ? null : findTask(id);
  const name = t ? t.title : 'The main chat';
  if (cue.notify && Notification.isSupported()) {
    const n = new Notification({
      title: kind === 'question' ? 'Waiting on you: a yes or no' : 'Your turn',
      body: name,
      icon: ICON_PNG,
      silent: true,
    });
    n.on('click', () => {
      if (open) {
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
      } else if (!key) windows.openTask(id);
    });
    n.show();
  }
  const b = windows.box();
  if (cue.sound !== 'off' && b && !b.isDestroyed()) b.webContents.send('cue', { sound: cue.sound, kind });
});

// Notes handed into a main chat: the box's count on the main-chat button goes down.
handoff.onDeliver(() => broadcast());

// Reads every project's tasks: the lanes workspace first (when it's on), then the others.
function refresh() {
  const fresh = [];
  if (config.factoryOn()) scan('factory', readTasks(config.root()), fresh);
  for (const p of projects.list()) scan(p.id, projects.read(p), fresh);
  state.save();
  tasks = fresh;
  planner.ensure(tasks);
  order.ensure(tasks);
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
      n.on('click', () => windows.openTask(t.id));
      n.show();
    }
  }
  mem.everScanned = true;
  out.push(...list);
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(refresh, config.get().pollSeconds * 1000);
  for (const w of watchers)
    try {
      w.close();
    } catch {}
  watchers = [];
  // Re-read a moment after a task list file changes.
  let t = null;
  const watch = (dir, test) => {
    try {
      watchers.push(
        fs.watch(dir, (ev, f) => {
          if (f && test(f)) {
            clearTimeout(t);
            t = setTimeout(refresh, 800);
          }
        })
      );
    } catch (err) {
      log.warn(`couldn't watch ${dir}`, err);
    }
  };
  watch(path.join(config.root(), 'ops'), (f) => /NEEDS_NICK/i.test(f));
  for (const p of projects.list()) {
    const f = projects.tasksFile(p);
    if (f) watch(path.dirname(f), (name) => name.toLowerCase() === path.basename(f).toLowerCase());
  }
}

planner.events.on('status', () => broadcast());
order.events.on('ready', () => broadcast());
planner.events.on('ready', (id) => {
  broadcast();
  const w = windows.taskWins.get(id);
  if (w && !w.isDestroyed()) w.webContents.send('plan', id);
});

const findTask = (id) => tasks.find((t) => t.id === id);

function setView(view) {
  config.set({ view });
  broadcast();
  windows.applyLook(); // a project with its own look restyles the box
}

Object.assign(module.exports, {
  TESTING,
  APP_ID,
  RENDERER,
  PRELOAD,
  RUNS,
  ICON_PNG,
  ICON_ICO,
  tasks: () => tasks,
  chromeDrive,
  chromeMode,
  decorate,
  currentView,
  payload,
  broadcast,
  refresh,
  startPolling,
  findTask,
  setView,
});
