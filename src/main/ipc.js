// Every way the outside reaches into the app: the IPC channels the three pages
// call (see src/preload.js), and the chat tools the task's AI calls through the
// local bridge. Only the app's own pages may call in: every handler goes through
// handle() or onSync(), which check where the message came from.
const { ipcMain, BrowserWindow, dialog, shell, clipboard } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const config = require('./config');
const state = require('./state');
const planner = require('./planner');
const chat = require('./chat');
const { parseEmails } = require('./tasks');
const { appendFromNick, appendResults, projectHeader, writeEnv } = require('./handback');
const projects = require('./projects');
const ai = require('./ai');
const log = require('./log');
const desk = require('./desk');
const windows = require('./windows');
const menu = require('./menu');

const PAGES_URL = pathToFileURL(desk.RENDERER).href;
const fromOurPage = (e) => {
  const u = (e.senderFrame && e.senderFrame.url) || '';
  return u.startsWith(PAGES_URL);
};
const handle = (channel, fn) =>
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromOurPage(e)) {
      log.warn(`ipc ${channel} refused from ${(e.senderFrame && e.senderFrame.url) || 'an unknown sender'}`);
      throw new Error('Not allowed');
    }
    return fn(e, ...args);
  });
const onSync = (channel, fn) =>
  ipcMain.on(channel, (e, ...args) => {
    if (!fromOurPage(e)) {
      e.returnValue = null;
      return;
    }
    fn(e, ...args);
  });

const winOf = (e) => BrowserWindow.fromWebContents(e.sender);
const senderScope = (e) => windows.scopeOf(winOf(e));
// Relative paths in a plan are relative to its project's folder (the workspace root for the lanes workspace).
function baseFor(e) {
  const w = winOf(e);
  const id = [...windows.taskWins].find(([, x]) => x === w)?.[0];
  const t = id && desk.findTask(id);
  return t && t.project !== 'factory' ? t.projectFolder || t.workDir : config.root();
}
const resolvePath = (p, e) => (p ? (path.isAbsolute(p) ? path.normalize(p) : path.join(e ? baseFor(e) : config.root(), p)) : null);
// Where this task's Done notes go: 'factory' (FROM_NICK.md), 'file' (the project's file) or 'app'.
function resultsKind(t) {
  const p = projects.get(t.project);
  return p ? p.results : 'factory';
}

// ---------- chat tools (taskdesk MCP) ----------
// What the chat's AI can do to its own task: read the plan, tick/comment a
// step, add to the notes. Changes show up live in the task window and the box.

function planView(t) {
  const c = planner.cached(t);
  const st = state.task(t.id);
  const steps = c && c.plan ? c.plan.steps : [];
  return {
    task: t.title,
    lane: t.lane,
    text: t.text,
    summary: c && c.plan ? c.plan.summary : null,
    steps: steps.map((s, i) => ({ step: i + 1, text: s.text, done: !!st.ticks['s' + i], comment: (st.stepNotes || {})['s' + i] || '' })),
    notes: st.notes || '',
    planReady: !!steps.length,
  };
}

function toWindow(id, change) {
  const w = windows.taskWins.get(id);
  if (w && !w.isDestroyed()) w.webContents.send('task:changed', id, change);
}

async function chatTool(id, tool, args) {
  const t = desk.findTask(id);
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
    if (typeof args.done === 'boolean') {
      st.ticks[key] = args.done;
      change.done = args.done;
    }
    if (typeof args.comment === 'string') {
      st.stepNotes = st.stepNotes || {};
      const text = args.comment.trim().slice(0, 1000);
      if (text) st.stepNotes[key] = text;
      else delete st.stepNotes[key];
      change.comment = text;
    }
    state.flush();
    toWindow(id, change);
    desk.broadcast();
    return {
      ok: true,
      result: `Step ${n} updated${change.done === true ? ': done' : change.done === false ? ': not done' : ''}${change.comment ? ' (comment saved)' : ''}.`,
    };
  }
  if (tool === 'add_note') {
    const text = String(args.text || '')
      .trim()
      .slice(0, 4000);
    if (!text) return { ok: false, error: 'Nothing to add.' };
    st.notes = st.notes ? `${st.notes.trimEnd()}\n${text}` : text;
    state.flush();
    toWindow(id, { kind: 'note', text, notes: st.notes });
    return { ok: true, result: 'Added to his notes.' };
  }
  return { ok: false, error: 'Unknown tool ' + tool };
}

// ---------- the channels ----------

function register() {
  // ----- tasks -----
  handle('tasks:list', () => desk.payload());
  handle('task:get', (e, id) => {
    const t = desk.findTask(id);
    if (!t) return null;
    const c = planner.cached(t);
    return {
      task: desk.decorate(t),
      plan: c ? c.plan : null,
      planOk: c ? c.ok : null,
      st: state.task(id),
      mode: config.get().mode,
      resultsTo: resultsKind(t),
    };
  });
  handle('task:open', (e, id) => windows.openTask(id));
  handle('task:tick', (e, id, key, val) => {
    const st = state.task(id);
    st.ticks[key] = !!val;
    state.save();
    desk.broadcast();
  });
  // Typed text is written to disk right away, so "Saved" in the window means saved.
  handle('task:paste', (e, id, key, label, value) => {
    state.task(id).pastes[key] = { label, value };
    state.flush();
    return true;
  });
  handle('task:notes', (e, id, notes) => {
    state.update(id, { notes });
    state.flush();
    return true;
  });
  // Used when a window closes mid-typing: blocks until the text is on disk.
  onSync('task:saveSync', (e, id, kind, value, key, label) => {
    try {
      if (kind === 'notes') state.update(id, { notes: value });
      else state.task(id).pastes[key] = { label, value };
      state.flush();
      e.returnValue = true;
    } catch {
      e.returnValue = false;
    }
  });
  handle('task:replan', (e, id) => {
    const t = desk.findTask(id);
    if (t) planner.regenerate(t);
  });
  handle('task:snooze', (e, id, when) => {
    const d = new Date();
    d.setDate(d.getDate() + (when === 'week' ? 7 : 1));
    d.setHours(8, 0, 0, 0);
    state.update(id, { status: 'snoozed', snoozeUntil: d.toISOString() });
    desk.broadcast();
    return d.toISOString();
  });
  handle('task:finish', (e, id, status, notes, goNext) => {
    const t = desk.findTask(id);
    if (!t) return { ok: false };
    const st = state.task(id);
    const c = planner.cached(t);
    const steps = c ? c.plan.steps.length : 0;
    const ticked = c ? c.plan.steps.filter((_, i) => st.ticks['s' + i]).length : 0;
    const results = Object.values(st.pastes).filter((p) => p && p.value && String(p.value).trim());
    if (c)
      c.plan.steps.forEach((s, i) => {
        const n = (st.stepNotes || {})['s' + i];
        if (n) results.push({ label: `Step ${i + 1} comment (${s.text.slice(0, 60)})`, value: n });
      });
    const entry = { lane: t.lane, text: t.text, status, notes, results, ticked: steps ? `${ticked}/${steps}` : '' };
    const p = projects.get(t.project);
    let file;
    try {
      file = p ? appendResults(projects.resultsFile(p), entry, projectHeader(p.name)) : appendFromNick(config.root(), entry);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    state.update(id, { status: status === 'done' ? 'done' : 'skipped', notes, finishedAt: new Date().toISOString() });
    const next = goNext ? desk.payload().tasks.find((x) => x.id !== id) : null;
    desk.broadcast();
    const w = windows.taskWins.get(id);
    setTimeout(() => {
      if (w && !w.isDestroyed()) w.close();
      if (next) windows.openTask(next.id);
    }, 650);
    return { ok: true, file, resultsTo: resultsKind(t) };
  });
  handle('task:add', (e, pid, text) => {
    const id = projects.addTask(pid, text);
    if (id) desk.refresh();
    return id;
  });

  // ----- look -----
  onSync('look:get', (e) => {
    e.returnValue = windows.lookOut(senderScope(e));
  });
  // Changes go to the project's own look when the window shows such a project, else to the desk's.
  handle('look:set', (e, patch) => {
    const scope = senderScope(e);
    if (windows.ownLookOf(scope)) projects.setLook(scope, patch);
    else config.set({ look: { ...config.get().look, ...patch } });
    windows.applyLook();
    return windows.lookOut(scope);
  });
  // Give the showing project its own look (starting from the desk's, in the project's color), or drop it.
  handle('look:own', (e, on) => {
    const scope = senderScope(e);
    const p = scope && projects.get(scope);
    if (!p) return windows.lookOut(scope);
    projects.setOwnLook(scope, !!on);
    windows.applyLook();
    return windows.lookOut(scope);
  });
  handle('look:newOwn', (e, on) => {
    config.set({ newProjectsOwnLook: !!on });
    windows.applyLook();
    return windows.lookOut(senderScope(e));
  });
  handle('look:picture', (e) => windows.pickFramePicture(senderScope(e)));

  // ----- the box -----
  handle('box:lock', (e, locked) => {
    windows.setBoxLocked(!!locked);
    return !!locked;
  });
  handle('box:resize', (e, phase) => windows.dragResize(phase));
  handle('view:set', (e, view) => desk.setView(view));
  handle('win:close', (e) => winOf(e) && winOf(e).close());
  handle('win:min', (e) => winOf(e) && winOf(e).minimize());
  handle('win:max', (e) => {
    const w = winOf(e);
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  handle('win:hide', () => windows.tuckAway());
  handle('win:collapse', (e, c) => windows.setCollapsed(c));
  handle('app:menu', (e) => menu.menu().popup({ window: winOf(e) }));
  handle('tray:badge', (e, dataUrl) => menu.setTrayImage(dataUrl));

  // ----- projects -----
  handle('project:edit', (e, id) => windows.openProjectEditor(id || null));
  handle('project:get', (e, id) => {
    const p = projects.get(id);
    return p ? { ...p, resultsPath: projects.resultsFile(p), tasksPath: projects.tasksFile(p), missing: projects.missing(p) } : null;
  });
  handle('project:save', (e, draft) => {
    const r = projects.save(draft);
    if (!r.ok) return r;
    if (r.created) config.set({ view: r.project.id });
    desk.refresh();
    desk.startPolling();
    windows.applyLook();
    return { ...r, resultsPath: projects.resultsFile(r.project) };
  });
  handle('project:remove', (e, id) => {
    const p = projects.get(id);
    if (!p) return false;
    const r = dialog.showMessageBoxSync(winOf(e), {
      type: 'question',
      buttons: ['Remove project', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Remove "${p.name}" from Task Desk?`,
      detail:
        'Its tasks leave the box. Nothing in the project folder is touched, and your notes and results stay in the app data folder in case you add it back.',
    });
    if (r !== 0) return false;
    for (const [id2, w] of [...windows.taskWins]) if (state.projectOf(id2) === id) w.close();
    projects.remove(id);
    desk.refresh();
    desk.startPolling();
    return true;
  });
  handle('project:preview', (e, draft) => projects.preview(draft));
  handle('project:suggest', (e, folder) => projects.suggest(folder));
  handle('project:pick', async (e, kind, from) => {
    const r = await dialog.showOpenDialog(
      winOf(e),
      kind === 'folder'
        ? { title: 'Choose the project folder', defaultPath: from || os.homedir(), properties: ['openDirectory'] }
        : {
            title: 'Choose the checklist file',
            defaultPath: from || undefined,
            properties: ['openFile'],
            filters: [
              { name: 'Checklists', extensions: ['md', 'txt'] },
              { name: 'All files', extensions: ['*'] },
            ],
          }
    );
    return r.canceled ? null : r.filePaths[0];
  });
  handle('project:open', (e, p) => {
    if (p && fs.existsSync(p) && !desk.RUNS.test(p)) shell.openPath(p);
    else return { ok: false, error: 'Nothing there yet: it appears after your first Done.' };
  });

  // ----- plan step actions -----
  handle('act:url', (e, url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  handle('act:copy', (e, text) => clipboard.writeText(String(text)));
  handle('act:gmail', (e, { to = '', subject = '', body = '' }) => {
    const u = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    shell.openExternal(u);
  });
  handle('act:file', async (e, p) => {
    const f = resolvePath(p, e);
    if (!f || !fs.existsSync(f)) return { ok: false, error: 'File not found: ' + f };
    if (desk.RUNS.test(f)) return { ok: false, error: "Task Desk doesn't run programs. Use 'Show in folder' instead." };
    const err = await shell.openPath(f);
    return { ok: !err, error: err };
  });
  handle('act:folder', async (e, p) => {
    let f = resolvePath(p, e);
    if (f && fs.existsSync(f) && fs.statSync(f).isFile()) {
      shell.showItemInFolder(f);
      return { ok: true };
    }
    while (f && !fs.existsSync(f) && path.dirname(f) !== f) f = path.dirname(f);
    if (!f) return { ok: false };
    await shell.openPath(f);
    return { ok: true, path: f };
  });
  handle('act:exists', (e, p) => {
    const f = resolvePath(p, e);
    return !!f && fs.existsSync(f);
  });
  handle('act:emails', (e, p) => {
    const f = resolvePath(p, e);
    try {
      const r = parseEmails(fs.readFileSync(f, 'utf8'));
      return { ...r, file: f, attachPath: r.attach ? resolvePath(r.attach, e) : null };
    } catch (err) {
      return { emails: [], error: err.message };
    }
  });
  handle('act:env', (e, id, envPath, name, value) => {
    const f = resolvePath(envPath, e);
    const inFactory = config.inFactory(f);
    const r = dialog.showMessageBoxSync(winOf(e), {
      type: 'warning',
      buttons: ['Write the key', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Write ${name} into this .env file?`,
      detail: `${f}${inFactory ? `\n\nThis file is inside ${config.factoryName()}.` : ''}\n\nThe key is not saved anywhere else (not in app data, logs or git).`,
    });
    if (r !== 0) return { ok: false, cancelled: true };
    try {
      writeEnv(f, name, value);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ----- the chat -----
  handle('chat:start', (e, id, mode, cols, rows) => {
    const t = desk.findTask(id);
    const w = winOf(e);
    if (!t || !w) return;
    const c = planner.cached(t);
    const send = (ch, ...a) => {
      if (!w.isDestroyed()) w.webContents.send(ch, ...a);
    };
    const handlers = {
      onData: (d) => send('chat:data', id, d),
      onExit: (code) => {
        send('chat:exit', id, code);
        desk.broadcast();
      },
      onInfo: (info) => send('chat:info', id, info),
    };
    // 'attach': a refreshed window reconnects to its running chat (else starts it as usual).
    if (mode === 'attach') {
      const a = chat.attach(id, handlers);
      if (a) {
        send('chat:info', id, { label: a.label, sessionId: a.sessionId });
        if (a.buffer) send('chat:data', id, a.buffer);
        chat.resize(id, cols, rows);
        return { attached: true, pid: a.pid };
      }
      mode = 'auto';
    }
    chat.start(t, c && c.plan, { mode, cols, rows, ...handlers });
    desk.broadcast();
  });
  handle('chat:write', (e, id, d) => chat.write(id, d));
  handle('chat:send', (e, id, text) => chat.send(id, text));
  handle('chat:resize', (e, id, c, r) => chat.resize(id, c, r));
  handle('chat:stop', (e, id) => {
    chat.stop(id);
    desk.broadcast();
  });
  // Which AI: the pickers in the box footer (desk default) and the task chat panel (this task).
  handle('ai:choices', (e, id) => ai.choices(id ? desk.findTask(id) : null));
  handle('ai:setDefault', (e, id) => {
    if (ai.PROVIDERS[id]) menu.setAI(id);
    return ai.choices(null);
  });
  handle('chat:switchAI', (e, id, to) => {
    const t = desk.findTask(id);
    if (!t) return null;
    ai.forget();
    const p = chat.switchAI(t, to);
    desk.broadcast();
    return { app: p.app, name: p.name, installed: !!ai.locate(p), choices: ai.choices(t) };
  });

  // ----- the person -----
  // Your name (and an optional line about you) for the AI and the greeting.
  handle('me:get', () => ({ name: config.userName(), about: config.get().userAbout || '' }));
  handle('me:set', (e, me) => {
    const name = String((me && me.name) || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    const about = String((me && me.about) || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    config.set({ userName: name, userAbout: about, userNameAsked: true });
    desk.refresh();
    return { name, about };
  });
}

module.exports = { register, chatTool };
