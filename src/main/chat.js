// Runs the task's AI app in a pseudo-terminal for each open task window: the
// real `claude` CLI by default, or Codex / Gemini (see ai.js).
//
// Claude Code session rules:
//  - Reopening a task resumes that task's own session (`--resume <id>`).
//  - First open forks the working folder's newest session (`--resume <newest>
//    --fork-session --session-id <new>`), so the chat starts with the factory's
//    context but never writes into the factory's running session.
//  - Fallbacks: `--continue --fork-session`, then a fresh `claude`.
//  - "Fresh chat" skips the fork and starts clean.
const fs = require('fs');
const crypto = require('crypto');
const pty = require('@lydell/node-pty');
const state = require('./state');
const { sessionFile, newestSession, cleanEnv } = require('./sessions');
const bridge = require('./bridge');
const ai = require('./ai');

const attention = require('./attention');
const claims = require('./claims');

const live = new Map(); // taskId -> { proc, sessionId, label, buf, lastOut, cb }
const KEEP = 400 * 1024; // recent chat output kept per task, so a refreshed window can redraw it

function ownSessionIds() {
  const ids = state
    .allTasks()
    .map((t) => t.chatSessionId)
    .filter(Boolean);
  return new Set([...ids, ...(state.state.ownSessions || [])]);
}

function remember(sid) {
  state.state.ownSessions = [...(state.state.ownSessions || []), sid].slice(-500);
  state.save();
}

const config = require('./config');
const isProject = (task) => !!task.project && task.project !== 'factory';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function firstMessage(task, plan) {
  const steps = plan && plan.steps ? plan.steps.map((s, i) => `${i + 1}) ${s.text}`).join(' ') : '(plan not ready yet)';
  let msg;
  if (isProject(task)) {
    const where = task.projectFolder ? ` (folder ${task.projectFolder})` : '';
    const edits = task.allowEdits
      ? 'You may change files in the project folder when a step needs it.'
      : 'This chat is set not to change files in the project folder (Task Desk turns off your edit tools; the project\'s "let the chat change files" setting turns them on): their results go back through the Done notes.';
    msg = `${cap(config.who())} is working on this task from the project "${task.projectName}"${where}: ${task.text}. The plan they're following: ${steps} Help them finish it. ${edits} As steps get done, tick them in the plan with the Task Desk tools.`;
  } else {
    const lane = task.lane === 'factory' ? 'workspace-wide' : `lane ${task.lane} (folder ${task.laneDir})`;
    msg = `${cap(config.who())} is working on this task from the ${config.factoryName()} workspace's ops/NEEDS_NICK.md, ${lane}: ${task.text}. The plan they're following: ${steps} Help them finish it. Don't edit ${config.factoryName()} files unless they explicitly ask: their results go back through the Done notes. As steps get done, tick them in the plan with the Task Desk tools.`;
  }
  return msg.replace(/\s+/g, ' ').slice(0, 7000);
}

// Sent with every launch (fresh or resumed), so even older chats know about the tools.
function systemNote(task) {
  const where = isProject(task) ? `project "${task.projectName}"` : `lane ${task.lane}`;
  return [
    `You are running inside Task Desk, in the chat window for one task: "${task.title}" (${where}).`,
    `The taskdesk tools update THIS task's plan, which ${config.who()} sees next to this chat:`,
    'get_task shows the numbered steps, which are done, comments, and their notes. Call it when you start or resume, so you know what is already done.',
    `update_step ticks a step done (or not) and/or leaves a short comment on it. Use it as soon as a step is finished or ${config.who()} says they did one, with a one-line comment on the outcome (who, what, date, result, or what is still open).`,
    "add_note appends a line to the task's notes box (results, replies, dates). Do not repeat what is already there.",
    `snooze_task puts this task away until a day (it leaves the box and comes back that morning at 8). Only when ${config.who()} asks to come back to it later: agree the day with them, then call it with that day (YYYY-MM-DD, tomorrow or next week) and a one-line reason for their notes.`,
    `Other task chats may be working in this project at the same time. get_task lists them under others, with what each is doing and the files it is editing: do not redo work they report done, and leave their files alone. Before an edit, Task Desk checks the file; if another chat is in it, your edit is stopped and you are told who has it: do your other steps first, or tell ${config.who()}. Call set_status with one line when you start on something and when it is done, so the other chats know. Tool results may end with a "Meanwhile" note about them.`,
    `tell_main_chat sends a short note to the project's main chat (${config.whose()} own Claude Code session that plans this project) when this task changed or found something that matters for the plan; Task Desk also sends one when the task is finished.`,
    'Never press Done/Skip for them; they finish the task themselves.',
  ].join(' ');
}

// Claude in Chrome: whether a chat gets the user's Chrome at all. Off unless
// it's turned on, for the desk (⋯ menu) or one task (its Chrome button):
//   'off'   no Chrome: Claude starts without it (the default)
//   'look'  Claude can read the pages they open from the plan, when asked
//   'work'  Claude may also click and type there (uses more tokens)
// Company-safe mode keeps it off. Older settings said chromeDrive true/false
// ("work" or "look only" while Chrome was always on).
const CHROME_MODES = ['off', 'look', 'work'];
const CHROME_LOOK =
  'Only look at Chrome pages (read them or take a screenshot) when asked; do not click, type or navigate there unless they ask you to.';
const CHROME_WORK =
  'You may work in Chrome for the steps: open pages, click through, fill in forms. Stop before the final send, submit, pay, sign-up or delete click and ask them to press it themselves.';
function deskChrome() {
  const s = config.get();
  if (CHROME_MODES.includes(s.chrome)) return s.chrome;
  return s.chromeDrive === true ? 'work' : 'off';
}
function chromeMode(task) {
  if (config.safeMode()) return 'off';
  const st = state.has(task.id) ? state.task(task.id) : {};
  if (CHROME_MODES.includes(st.chrome)) return st.chrome;
  if (st.chromeDrive === true) return 'work';
  return deskChrome();
}
const chromeWork = (task) => chromeMode(task) === 'work';
function chromeNote(task) {
  const who = config.who();
  return [
    `Links ${who} opens from the plan open in Google Chrome. get_task lists them under opened_pages, newest last.`,
    `When they say "the window", "this page" or "that tab", they mean the newest one: find it with your Claude in Chrome tools.`,
    chromeWork(task) ? CHROME_WORK : CHROME_LOOK,
  ].join(' ');
}

// May the chat change files? Only a project with "let the chat change files"
// on (Edit project, box 5). Otherwise Claude Code itself refuses its edit tools
// and its command tools (a command could change files too), so it doesn't
// depend on Claude following the brief. It can still read files and use the web.
const mayEdit = (task) => isProject(task) && !!task.allowEdits;

// How a chat scrolls (⋯ menu, "Chat scrolling"). 'smooth' (the default): Claude
// Code keeps its classic view, so what it prints stays in the chat panel's own
// history and the panel scrolls it at once, a touchpad 1:1 (see touchpadScroll
// in ui.js). 'claude': Claude Code's full-screen view, which takes over the
// mouse and scrolls itself, one round trip per wheel step (slow on a touchpad).
const scrollEnv = () => (config.get().chatScroll === 'claude' ? {} : { CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN: '1' });
const NO_EDITS = ['--disallowedTools', 'Edit', 'Write', 'NotebookEdit', 'MultiEdit', 'Bash', 'PowerShell'];

function withTools(task, args) {
  // The model and effort picked for the task, its project or the desk (see ai.js).
  const model = ai.modelArgs(task);
  const chrome = chromeMode(task) !== 'off';
  const edits = mayEdit(task) ? [] : NO_EDITS;
  // Options that take lists go first: the next "--" option ends each list.
  const tools = bridge.ready() ? ['--mcp-config', bridge.configFor(task.id), '--allowedTools', 'mcp__taskdesk'] : [];
  // A chat that may edit asks the app before each edit (see claims.js); after configFor, which makes the token.
  const guard = tools.length && mayEdit(task) ? ['--settings', bridge.hooksFor(task.id)] : [];
  return [
    ...tools,
    ...guard,
    ...edits,
    '--append-system-prompt',
    `${systemNote(task)}${chrome ? ` ${chromeNote(task)}` : ''}`,
    ...(chrome ? ['--chrome'] : []),
    ...model,
    ...args,
  ];
}

// Notes for the next AI when the user switches a task's AI mid-way (taskId -> text).
const handoffs = new Map();

// Claude Code: resume this task's chat, or fork the folder's newest session.
function attempts(task, plan, mode, note) {
  const st = state.task(task.id);
  const msg = firstMessage(task, plan) + (note ? `\n\n${note}` : '');
  const list = [];
  const own = ai.sessionFor(st, 'claude');
  if (mode === 'auto' && own && fs.existsSync(sessionFile(task.workDir, own))) {
    list.push({ label: "Resuming this task's chat", sid: own, args: ['--resume', own, ...(note ? [note] : [])] });
  }
  if (mode !== 'fresh') {
    const base = newestSession(task.workDir, ownSessionIds());
    if (base) {
      const sid = crypto.randomUUID();
      list.push({
        label: isProject(task) ? "Starting from this project's latest session" : "Starting from the factory's latest session",
        sid,
        args: ['--resume', base, '--fork-session', '--session-id', sid, msg],
      });
    }
    const sid2 = crypto.randomUUID();
    list.push({
      label: "Continuing the folder's last conversation",
      sid: sid2,
      args: ['--continue', '--fork-session', '--session-id', sid2, msg],
    });
  }
  const sid3 = crypto.randomUUID();
  list.push({ label: 'Starting a fresh chat', sid: sid3, args: ['--session-id', sid3, msg] });
  return list;
}

// Codex and Gemini: resume this task's own chat when there is one, else start
// fresh with the task brief (the Task Desk note goes first, since these apps
// have no separate system-prompt option).
function otherAttempts(p, task, plan, mode, note) {
  const st = state.task(task.id);
  const edits = isProject(task) ? !!task.allowEdits : false;
  const own = ai.sessionFor(st, p.id);
  const list = [];
  if (mode === 'auto' && own) {
    list.push({
      label: "Resuming this task's chat",
      sid: own,
      args: ai.chatArgs(p, { resume: true, sessionId: own === 'latest' ? null : own, brief: note, edits }),
    });
  }
  const brief = `${systemNote(task)}\n\n${firstMessage(task, plan)}${note ? `\n\n${note}` : ''}`;
  list.push({ label: `Starting a fresh ${p.app} chat`, sid: null, fresh: true, args: ai.chatArgs(p, { brief, edits }) });
  return list;
}

// Remember which chat this AI has for this task (each AI keeps its own).
function saveSession(taskId, aiId, sid) {
  const st = state.task(taskId);
  state.update(taskId, { chats: { ...(st.chats || {}), [aiId]: sid }, chatSessionId: sid, chatAi: aiId });
}

// Switch a task to another AI ('' = back to the project's or desk's choice).
// The running chat stops; the next one is told how the last one ended.
function switchAI(task, toId) {
  const from = ai.pick(task);
  const e = live.get(task.id);
  const note = e ? ai.handover(from, e.sessionId, task.workDir, e.buf) : '';
  stop(task.id);
  state.update(task.id, { ai: toId || null });
  const to = ai.pick(task);
  if (note && to.id !== from.id) handoffs.set(task.id, note);
  else handoffs.delete(task.id);
  return to;
}

function start(task, plan, { mode = 'auto', cols = 100, rows = 30, onData, onExit, onInfo }) {
  stop(task.id);
  // The window's handlers; attach() swaps them when a window is refreshed.
  const cb = { onData, onExit, onInfo };
  const p = ai.pick(task);
  const loc = ai.locate(p);
  if (!loc) {
    cb.onInfo && cb.onInfo({ label: `${p.app} isn't installed`, sessionId: null, ai: p.id });
    setTimeout(() => {
      cb.onData && cb.onData(ai.missingText(p) + '\r\n');
      cb.onExit && cb.onExit(-2);
    }, 50); // -2: not installed
    return;
  }
  const note = handoffs.get(task.id) || '';
  handoffs.delete(task.id);
  const claude = p.id === 'claude';
  const tries = claude ? attempts(task, plan, mode, note) : otherAttempts(p, task, plan, mode, note);
  const tools = !claude && bridge.ready() ? ai.toolArgs(p, bridge.spec(task.id), task.id, { edits: mayEdit(task) }) : { args: [], env: {} };
  const run = (i) => {
    const a = tries[i];
    cb.onInfo && cb.onInfo({ label: a.label, sessionId: a.sid, ai: p.id });
    const startedAt = Date.now();
    const args = claude ? withTools(task, a.args) : [...tools.args, ...a.args];
    const proc = pty.spawn(loc.exe, [...loc.pre, ...args], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: task.workDir,
      env: cleanEnv({
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...loc.env,
        ...tools.env,
        ...(claude && bridge.ready() ? bridge.hookEnv(task.id) : {}),
        ...(claude ? scrollEnv() : {}),
      }),
    });
    const entry = { proc, sessionId: a.sid, label: a.label, stopped: false, buf: '', lastOut: Date.now(), cb };
    live.set(task.id, entry);
    if (claude) {
      remember(a.sid);
      saveSession(task.id, 'claude', a.sid);
    } else if (a.fresh) {
      // Gemini resumes the folder's latest chat; Codex names its own sessions: find
      // this one once it's saved, so Resume reopens it.
      saveSession(task.id, p.id, p.id === 'gemini' ? 'latest' : null);
      if (p.id === 'codex') {
        const look = (n) =>
          setTimeout(() => {
            if (entry.stopped || live.get(task.id) !== entry) return;
            const sid = ai.findCodexSession(task.workDir, startedAt);
            if (sid) {
              entry.sessionId = sid;
              saveSession(task.id, 'codex', sid);
            } else if (n > 0) look(n - 1);
          }, 3000);
        look(40);
      }
    } else {
      state.update(task.id, { chatSessionId: a.sid, chatAi: p.id });
    }
    proc.onData((d) => {
      entry.lastOut = Date.now();
      entry.buf += d;
      if (entry.buf.length > KEEP * 1.5) entry.buf = entry.buf.slice(-KEEP);
      attention.feed(task.id, d);
      cb.onData && cb.onData(d);
    });
    proc.onExit(({ exitCode }) => {
      if (entry.stopped) return;
      attention.forget(task.id);
      // A launch that dies within a few seconds means that start method failed: try the next one.
      if (exitCode !== 0 && Date.now() - startedAt < 8000 && i + 1 < tries.length) {
        cb.onData && cb.onData(`\r\n\x1b[2m(${a.label.toLowerCase()} didn't work, trying the next option…)\x1b[0m\r\n`);
        run(i + 1);
        return;
      }
      live.delete(task.id);
      cb.onExit && cb.onExit(exitCode);
    });
  };
  run(0);
}

// A project's main chat (see mainchat.js): plain Claude Code in the folder its
// session ran in, with no task tools and no task limits. id is the chat's own
// key ("main-<project>"), so writing, resizing, stopping and reattaching work
// as for a task's chat.
function startPlain(id, { args, cwd, label }, { cols = 100, rows = 30, onData, onExit, onInfo }) {
  stop(id);
  const cb = { onData, onExit, onInfo };
  const p = ai.PROVIDERS.claude;
  const loc = ai.locate(p);
  if (!loc) {
    cb.onInfo && cb.onInfo({ label: `${p.app} isn't installed`, sessionId: null, ai: p.id });
    setTimeout(() => {
      cb.onData && cb.onData(ai.missingText(p) + '\r\n');
      cb.onExit && cb.onExit(-2);
    }, 50);
    return;
  }
  cb.onInfo && cb.onInfo({ label, sessionId: null, ai: p.id });
  const proc = pty.spawn(loc.exe, [...loc.pre, ...args], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: cleanEnv({ TERM: 'xterm-256color', COLORTERM: 'truecolor', ...loc.env, ...scrollEnv() }),
  });
  const entry = { proc, sessionId: null, label, stopped: false, buf: '', lastOut: Date.now(), cb };
  live.set(id, entry);
  proc.onData((d) => {
    entry.lastOut = Date.now();
    entry.buf += d;
    if (entry.buf.length > KEEP * 1.5) entry.buf = entry.buf.slice(-KEEP);
    attention.feed(id, d);
    cb.onData && cb.onData(d);
  });
  proc.onExit(({ exitCode }) => {
    if (entry.stopped) return;
    attention.forget(id);
    live.delete(id);
    cb.onExit && cb.onExit(exitCode);
  });
}

function write(id, data) {
  const e = live.get(id);
  if (!e) return;
  attention.input(id, data);
  if (attention.userTyped(data)) held.delete(id);
  e.proc.write(data);
}

// Paste text as a single block (bracketed paste) and press Enter.
function send(id, text) {
  const e = live.get(id);
  if (!e) return false;
  // The text can't end the paste early: any "end of paste" marker inside it is removed.
  const safe = String(text).replace(/\x1b\[20[01]~/g, '');
  attention.input(id, safe);
  e.proc.write('\x1b[200~' + safe + '\x1b[201~');
  setTimeout(() => e.proc.write('\r'), 120);
  return true;
}

function resize(id, cols, rows) {
  const e = live.get(id);
  if (e && cols > 0 && rows > 0)
    try {
      e.proc.resize(cols, rows);
    } catch {}
}

function stop(id) {
  const e = live.get(id);
  if (!e) return;
  e.stopped = true;
  live.delete(id);
  held.delete(id);
  attention.forget(id);
  claims.release(id);
  // Its link to the app goes too: the token stops working and its config files are deleted.
  bridge.forget(id);
  try {
    e.proc.kill();
  } catch {}
}

function stopAll() {
  for (const id of [...live.keys()]) stop(id);
}

// Stop what a chat is doing but keep it open: the Esc key, as if pressed in the
// chat (Claude Code, Codex and Gemini all end their current turn on Esc). Then
// it waits for the user: Task Desk sends it nothing more (no main-chat notes)
// until they type in it or send it something.
const held = new Set();
function interrupt(id) {
  const e = live.get(id);
  if (!e) return false;
  held.add(id);
  e.proc.write('\x1b');
  return true;
}
const interruptAll = () => [...live.keys()].filter(interrupt).length;
const isHeld = (id) => held.has(id);
const unhold = (id) => held.delete(id);
const liveIds = () => [...live.keys()];

const isLive = (id) => live.has(id);
// What the chat is waiting for: 'question' (a yes/no or a choice), 'turn' (finished, waiting for a message) or null.
const needs = (id) => attention.needs(id);

// A refreshed task window picks its running chat back up instead of restarting
// it: new handlers, plus the recent output so the window can redraw the chat.
function attach(id, handlers) {
  const e = live.get(id);
  if (!e) return null;
  Object.assign(e.cb, handlers);
  return { label: e.label, sessionId: e.sessionId, buffer: e.buf, pid: e.proc.pid };
}

// True when no chat has printed anything for `ms` (Claude isn't in the middle of a reply).
const quietFor = (ms) => [...live.values()].every((e) => Date.now() - e.lastOut >= ms);

module.exports = {
  start,
  startPlain,
  ownSessionIds,
  switchAI,
  attach,
  write,
  send,
  resize,
  stop,
  stopAll,
  interrupt,
  interruptAll,
  isHeld,
  unhold,
  liveIds,
  isLive,
  needs,
  quietFor,
  firstMessage,
  chromeWork,
  chromeMode,
  deskChrome,
  CHROME_MODES,
  mayEdit,
  CHROME_LOOK,
  CHROME_WORK,
};
