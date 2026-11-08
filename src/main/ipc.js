// Every way the outside reaches into the app: the IPC channels the three pages
// call (see src/preload.js), and the chat tools the task's AI calls through the
// local bridge. Only the app's own pages may call in: every handler goes through
// handle() or onSync(), which check where the message came from.
const { ipcMain, BrowserWindow, dialog, shell, clipboard } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const config = require('./config');
const state = require('./state');
const planner = require('./planner');
const chat = require('./chat');
const mainchat = require('./mainchat');
const { parseEmails } = require('./tasks');
const { appendFromNick, appendResults, projectHeader, writeEnv } = require('./handback');
const projects = require('./projects');
const ai = require('./ai');
const log = require('./log');
const safety = require('./safety');
const snooze = require('./snooze');
const desk = require('./desk');
const windows = require('./windows');
const menu = require('./menu');

// The app's own pages, exactly (their ?id=… part aside).
const PAGES = new Set(
  ['box.html', 'task.html', 'project.html', 'mainchat.html'].map((f) => pathToFileURL(path.join(desk.RENDERER, f)).href)
);
const fromOurPage = (e) => {
  const u = (e.senderFrame && e.senderFrame.url) || '';
  return PAGES.has(u.split(/[?#]/)[0]);
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
// A path from a plan, as a full path. Network paths and odd names (see safety.js) are refused (null).
const resolvePath = (p, e) => {
  if (typeof p !== 'string' || !p || safety.isNetwork(p) || safety.oddName(p)) return null;
  return path.isAbsolute(p) ? path.normalize(p) : path.join(e ? baseFor(e) : config.root(), p);
};
// Is this path inside the task's own folder (or the app's data folder)?
const inTaskFolder = (f, e) => safety.within(f, baseFor(e)) || safety.within(f, config.DATA_DIR);

// Asks before the app does something a plan asked for: the whole address or
// path is shown, and Cancel is the default.
async function confirm(e, { message, detail, ok }) {
  const r = await dialog.showMessageBox(winOf(e), {
    type: 'question',
    buttons: [ok, 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    message,
    detail,
  });
  return r.response === 0;
}
// Links you've already said yes to, per task, so the same link doesn't ask twice.
const approved = new Set();
const taskIdOf = (e) => [...windows.taskWins].find(([, w]) => !w.isDestroyed() && w.webContents === e.sender)?.[0] || '';
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
    opened_pages: (st.opened || []).map((o) => ({ url: o.url, at: o.at })),
    chrome: desk.chromeDrive(t.id) ? 'work' : 'look',
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
  // The chat puts the task away until a day the user asked for. The window stays
  // open (closing it would end the chat mid-sentence); the task leaves the box.
  if (tool === 'snooze_task') {
    const d = snooze.until(args.until);
    if (!d) return { ok: false, error: `Can't use "${String(args.until || '').slice(0, 40)}". ${snooze.HELP}` };
    const reason = String(args.reason || '')
      .trim()
      .slice(0, 1000);
    if (reason) {
      st.notes = st.notes ? `${st.notes.trimEnd()}\n${reason}` : reason;
      toWindow(id, { kind: 'note', text: reason, notes: st.notes });
    }
    state.update(id, { status: 'snoozed', snoozeUntil: d.toISOString() });
    toWindow(id, { kind: 'snoozed', until: d.toISOString() });
    desk.broadcast();
    return {
      ok: true,
      result: `Snoozed until ${snooze.dayName(d)}, 8 in the morning. The task is out of the box until then; this window stays open as long as ${config.who()} wants it. Tell them.`,
    };
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
  // when: 'tomorrow', 'week' or a day as YYYY-MM-DD (see snooze.js). null when it can't be used.
  handle('task:snooze', (e, id, when) => {
    const d = snooze.until(when);
    if (!d) return null;
    state.update(id, { status: 'snoozed', snoozeUntil: d.toISOString() });
    desk.broadcast();
    return d.toISOString();
  });
  handle('task:finish', (e, id, status, notes, goNext) => finishTask(id, status, notes, goNext));
  // "Close anyway" from the did-you-finish question.
  handle('task:closeAnyway', (e, id) => {
    const w = windows.taskWins.get(id);
    if (!w || w.isDestroyed()) return;
    w.closeAnyway = true;
    w.close();
  });
  function finishTask(id, status, notes, goNext) {
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
    if (status === 'done') catchUp(t, entry);
    return { ok: true, file, resultsTo: resultsKind(t) };
  }

  // After a task is done, the AI checks the same project's other open tasks and
  // redrafts the plans this one changed (an answer they were waiting for, a step
  // already done). Each redraft says why ("updated after ...").
  async function catchUp(t, entry) {
    if (config.get().catchUp === false) return;
    const others = desk
      .tasks()
      .filter((x) => x.project === t.project && x.id !== t.id && state.isOpen(x.id))
      .slice(0, 25);
    if (!others.length) return;
    let hits = [];
    try {
      hits = await planner.affected({ ...t, notes: entry.notes, results: entry.results }, others);
    } catch (err) {
      log.warn(`couldn't check the other tasks after "${t.title}": ${err.message}`);
      return;
    }
    for (const h of hits) {
      const other = desk.findTask(h.id);
      if (!other || !state.isOpen(other.id)) continue;
      log.info(`redrafting "${other.title}" after "${t.title}": ${h.why}`);
      planner.regenerate({ ...other, recentChange: { title: t.title, notes: entry.notes, why: h.why } });
    }
    if (hits.length) desk.broadcast();
  }
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
  // "Fix the folder" for the lanes workspace: pick where it is on this computer.
  handle('workspace:folder', () => menu.connectWorkspace());
  handle('project:get', (e, id) => {
    const p = projects.get(id);
    return p
      ? {
          ...p,
          resultsPath: projects.resultsFile(p),
          tasksPath: projects.tasksFile(p),
          missing: projects.missing(p),
          synced: config.synced(),
        }
      : null;
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
    for (const [id2, w] of [...windows.taskWins])
      if (state.projectOf(id2) === id) {
        w.closeAnyway = true;
        w.close();
      }
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
  // A project's results file: only a document inside one of your projects' folders or the app's data.
  handle('project:open', (e, p) => {
    const f = typeof p === 'string' && !safety.isNetwork(p) ? path.resolve(p) : null;
    const known = f && projects.list().some((x) => path.resolve(projects.resultsFile(x)) === f);
    if (!f || !fs.existsSync(f)) return { ok: false, error: 'Nothing there yet: it appears after your first Done.' };
    if (!known || !safety.openable(f)) return { ok: false, error: "Task Desk only opens your projects' results files here." };
    shell.openPath(f);
  });

  // ----- plan step actions -----
  // Links from a task open in Chrome, where the task's Claude chat can see them
  // (Claude in Chrome). The task remembers the last few pages it opened, so
  // "look at the window" in the chat means the newest one.
  const CHROME = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
    .filter(Boolean)
    .map((d) => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  // Only web links (http or https), never with a name and password in them.
  const webLink = (url) => {
    try {
      const u = new URL(String(url));
      return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null;
    } catch {
      return null;
    }
  };
  // Links the app itself makes (not the plan): no need to ask.
  const OWN_LINKS = new Set(['https://ads.google.com/aw/keywordplanner/home']);
  function openLink(e, url) {
    const exe = !desk.TESTING && CHROME.find((f) => fs.existsSync(f));
    if (exe) spawn(exe, [url], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    else shell.openExternal(url);
    const id = taskIdOf(e);
    if (id) {
      const st = state.task(id);
      state.update(id, { opened: [...(st.opened || []), { url, at: new Date().toISOString() }].slice(-8) });
    }
  }
  // A link from a plan opens after you've seen the whole address and said yes (once per link and task).
  handle('act:url', async (e, url) => {
    const u = webLink(url);
    if (!u) return { ok: false, error: 'Task Desk only opens web links (http or https).' };
    const key = `${taskIdOf(e)} ${u}`;
    if (!OWN_LINKS.has(u) && !approved.has(key)) {
      const yes = await confirm(e, {
        ok: 'Open the link',
        message: `Open this link from the plan?`,
        detail: `${u.length > 600 ? u.slice(0, 600) + '…' : u}\n\nIt opens at ${new URL(u).hostname}. Check it's a site you expect: the plan was written by the AI from the task's files.`,
      });
      if (!yes) return { ok: false, cancelled: true, error: 'Not opened' };
      approved.add(key);
    }
    openLink(e, u);
    return { ok: true };
  });
  handle('act:copy', (e, text) => clipboard.writeText(String(text)));
  // A Gmail draft opens in your browser; you still press Send. One with a recipient
  // filled in by the plan shows who it's to and the subject first.
  handle('act:gmail', async (e, draft) => {
    const d = draft && typeof draft === 'object' ? draft : {};
    const [to, subject, body] = ['to', 'subject', 'body'].map((k) => String(d[k] || ''));
    if (to.trim()) {
      const yes = await confirm(e, {
        ok: 'Open the draft',
        message: 'Open this email draft in Gmail?',
        detail: `To: ${to}\nSubject: ${subject || '(none)'}\n\n${body.slice(0, 400)}${body.length > 400 ? '…' : ''}\n\nNothing is sent until you press Send in Gmail.`,
      });
      if (!yes) return { ok: false, cancelled: true, error: 'Not opened' };
    }
    openLink(
      e,
      `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    );
    return { ok: true };
  });
  // The task window's Chrome button: 'off', 'look' or 'work' for this task.
  // Chrome is given to Claude when the chat starts, so turning it on or off
  // restarts a running chat (it resumes the same conversation). Between look
  // and work, the running chat is just told.
  handle('task:chrome', (e, id, mode) => {
    if (!desk.findTask(id) || !chat.CHROME_MODES.includes(mode)) return null;
    if (config.safeMode()) return { mode: 'off', locked: true };
    const before = desk.chromeMode(id);
    state.update(id, { chrome: mode, chromeDrive: undefined });
    const now = desk.chromeMode(id);
    const live = chat.isLive(id);
    const restart = live && (before === 'off') !== (now === 'off');
    if (live && !restart && before !== now)
      chat.send(
        id,
        now === 'work'
          ? `(Task Desk) ${config.who()} turned on "Let Claude work in Chrome" for this task. ${chat.CHROME_WORK}`
          : `(Task Desk) "Let Claude work in Chrome" is off again. ${chat.CHROME_LOOK}`
      );
    desk.broadcast();
    return { mode: now, restart };
  });
  // Open buttons open documents, never programs: only the types in safety.js
  // (Markdown, text, PDF, pictures, Office files without macros…). One inside
  // the task's own folder opens straight away; anywhere else, you see the full
  // path and say yes first.
  handle('act:file', async (e, p) => {
    const f = resolvePath(p, e);
    if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) return { ok: false, error: 'File not found: ' + (f || p) };
    if (!safety.openable(f))
      return {
        ok: false,
        error: `Task Desk only opens documents, not .${safety.typeOf(f) || '?'} files. Use the folder button to find it.`,
      };
    if (!inTaskFolder(f, e)) {
      const yes = await confirm(e, {
        ok: 'Open it',
        message: "Open this file? It's outside the task's folder.",
        detail: `${safety.real(f)}\n\nThe plan was written by the AI from the task's files. Open it only if you expected this file.`,
      });
      if (!yes) return { ok: false, cancelled: true, error: 'Not opened' };
    }
    const err = await shell.openPath(f);
    return { ok: !err, error: err };
  });
  // Shows a file in its folder, or opens a folder (the nearest one that exists), in File Explorer.
  handle('act:folder', async (e, p) => {
    let f = resolvePath(p, e);
    if (!f) return { ok: false, error: 'Task Desk only opens folders on this computer.' };
    const ask = (where) =>
      inTaskFolder(where, e) ||
      confirm(e, {
        ok: 'Show it',
        message: "Open this folder? It's outside the task's folder.",
        detail: `${safety.real(where)}\n\nThe plan was written by the AI from the task's files.`,
      });
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      if (!(await ask(f))) return { ok: false, cancelled: true, error: 'Not opened' };
      shell.showItemInFolder(f);
      return { ok: true };
    }
    while (f && !fs.existsSync(f) && path.dirname(f) !== f) f = path.dirname(f);
    if (!f || !fs.existsSync(f) || !fs.statSync(f).isDirectory()) return { ok: false };
    if (!(await ask(f))) return { ok: false, cancelled: true, error: 'Not opened' };
    await shell.openPath(f);
    return { ok: true, path: f };
  });
  handle('act:exists', (e, p) => {
    const f = resolvePath(p, e);
    return !!f && fs.existsSync(f);
  });
  // The drafts in an outreach emails.md (a Markdown file, at most 2 MB).
  handle('act:emails', (e, p) => {
    const f = resolvePath(p, e);
    try {
      if (!f || !/\.(md|txt)$/i.test(f)) throw new Error('The drafts have to be in a .md or .txt file.');
      if (fs.statSync(f).size > 2 * 1024 * 1024) throw new Error('That file is too big to be a list of drafts.');
      const r = parseEmails(fs.readFileSync(f, 'utf8'));
      return { ...r, file: f, attachPath: r.attach ? resolvePath(r.attach, e) : null };
    } catch (err) {
      return { emails: [], error: err.message };
    }
  });
  // Saving a key you paste: only into a .env (or .env.local) file inside the
  // task's own folder, and only after you've seen the variable and the file.
  handle('act:env', async (e, id, envPath, name, value) => {
    const f = resolvePath(envPath, e);
    if (!f || !['.env', '.env.local'].includes(path.basename(f).toLowerCase()))
      return { ok: false, error: 'Task Desk only writes keys into a .env file.' };
    if (!safety.within(f, baseFor(e)))
      return { ok: false, error: "That .env file isn't inside this task's folder, so Task Desk won't write to it." };
    if (typeof name !== 'string' || !/^[A-Z_][A-Z0-9_]{0,99}$/.test(name)) return { ok: false, error: 'That variable name looks wrong.' };
    const inFactory = config.inFactory(f);
    const yes = await confirm(e, {
      ok: 'Write the key',
      message: `Write ${name} into this .env file?`,
      detail: `Variable: ${name}\nFile: ${safety.real(f)}${inFactory ? `\n\nThis file is inside ${config.factoryName()}.` : ''}\n\nThe key is not saved anywhere else (not in app data, logs or git).`,
    });
    if (!yes) return { ok: false, cancelled: true };
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
  // A main chat (id "main-…") is only reached through the main: channels below, from its own window.
  const taskChat = (id) => typeof id === 'string' && !id.startsWith('main-');
  handle('chat:write', (e, id, d) => taskChat(id) && chat.write(id, d));
  handle('chat:send', (e, id, text) => taskChat(id) && chat.send(id, text));
  handle('chat:resize', (e, id, c, r) => taskChat(id) && chat.resize(id, c, r));
  handle('chat:stop', (e, id) => {
    if (!taskChat(id)) return;
    chat.stop(id);
    desk.broadcast();
  });

  // ----- a project's main chat (see mainchat.js) -----
  // The box opens it; everything else comes from the main chat window, and the
  // project is taken from that window, not from what the page says.
  handle('main:open', (e, key) => {
    if (typeof key === 'string' && mainchat.target(key)) windows.openMainChat(key);
  });
  const mainOf = (e) => {
    const key = windows.mainKeyOf(winOf(e));
    return key && mainchat.target(key) ? key : null;
  };
  const describe = (key, s) => {
    const t = mainchat.target(key);
    return { name: t.name, folder: t.folder, session: s ? { id: s.id, cwd: s.cwd, first: s.first, at: s.at } : null };
  };
  handle('main:info', async (e) => {
    const key = mainOf(e);
    return key ? describe(key, (config.get().mainChats || {})[key] || null) : null;
  });
  handle('main:sessions', async (e) => {
    const key = mainOf(e);
    if (!key) return [];
    return (await mainchat.choices(key, chat.ownSessionIds())).map((s) => ({
      id: s.id,
      first: s.first,
      at: s.at,
      cwd: s.cwd,
      setUp: s.setUp,
    }));
  });
  // mode: 'attach' (a refreshed window), 'auto' (the remembered or found session),
  // 'new' (a brand-new one in the project's folder) or 'pick' (one from main:sessions, by id).
  handle('main:start', async (e, mode, pickId, cols, rows) => {
    const key = mainOf(e);
    const w = winOf(e);
    if (!key || !w) return { ok: false };
    const id = `main-${key}`;
    const send = (ch, ...a) => {
      if (!w.isDestroyed()) w.webContents.send(ch, 'main', ...a);
    };
    const handlers = {
      onData: (d) => send('chat:data', d),
      onExit: (code) => send('chat:exit', code),
      onInfo: (info) => send('chat:info', info),
    };
    if (mode === 'attach') {
      const a = chat.attach(id, handlers);
      if (a) {
        send('chat:info', { label: a.label });
        if (a.buffer) send('chat:data', a.buffer);
        chat.resize(id, cols, rows);
        return { ok: true, attached: true, ...describe(key, (config.get().mainChats || {})[key]) };
      }
      mode = 'auto';
    }
    let s = null;
    if (mode === 'new') s = mainchat.fresh(key);
    else if (mode === 'pick') {
      const found = (await mainchat.choices(key, chat.ownSessionIds())).find((x) => x.id === pickId);
      s = found ? mainchat.link(key, found) : null;
    } else s = await mainchat.find(key, chat.ownSessionIds());
    if (!s) return { ok: false, ...describe(key, null) };
    chat.startPlain(
      id,
      { args: mainchat.argsFor(s), cwd: s.cwd, label: s.isNew ? 'New main chat' : 'Main chat' },
      { cols, rows, ...handlers }
    );
    return { ok: true, ...describe(key, s) };
  });
  handle('main:write', (e, d) => {
    const key = mainOf(e);
    if (key) chat.write(`main-${key}`, d);
  });
  handle('main:resize', (e, c, r) => {
    const key = mainOf(e);
    if (key) chat.resize(`main-${key}`, c, r);
  });
  // Which AI: the pickers in the box footer (desk default) and the task chat panel (this task).
  handle('ai:choices', (e, id) => ai.choices(id ? desk.findTask(id) : null));
  handle('ai:setDefault', (e, id) => {
    if (ai.PROVIDERS[id]) menu.setAI(id);
    return ai.choices(null);
  });
  // Claude's model and effort: for the desk, a project ('factory' or its id) or one task ('task:<id>').
  handle('model:set', (e, scope, patch) => {
    if (typeof scope !== 'string' || !patch || typeof patch !== 'object') return null;
    if (scope.startsWith('task:') && !desk.findTask(scope.slice(5))) return null;
    if (!scope.startsWith('task:') && scope !== 'desk' && scope !== 'factory' && !projects.get(scope)) return null;
    const r = ai.setModel(scope, patch);
    desk.broadcast();
    return r;
  });
  // Whether a task can have its own model and effort (right-click it in the box).
  handle('model:perTask', (e, on) => {
    config.set({ perTaskModel: !!on });
    desk.broadcast();
    return ai.perTaskOn();
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
