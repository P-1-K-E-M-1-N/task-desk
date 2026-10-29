// Runs the real `claude` CLI in a pseudo-terminal for each open task window.
//
// Session rules:
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
const { sessionFile, newestSession, claudeExe, cleanEnv } = require('./sessions');
const bridge = require('./bridge');

const live = new Map(); // taskId -> { proc, sessionId, label, buf, lastOut, cb }
const KEEP = 400 * 1024; // recent chat output kept per task, so a refreshed window can redraw it

function ownSessionIds() {
  const ids = state.allTasks().map((t) => t.chatSessionId).filter(Boolean);
  return new Set([...ids, ...(state.state.ownSessions || [])]);
}

function remember(sid) {
  state.state.ownSessions = [...(state.state.ownSessions || []), sid].slice(-500);
  state.save();
}

const isProject = (task) => !!task.project && task.project !== 'factory';

function firstMessage(task, plan) {
  const steps = plan && plan.steps ? plan.steps.map((s, i) => `${i + 1}) ${s.text}`).join(' ') : '(plan not ready yet)';
  let msg;
  if (isProject(task)) {
    const where = task.projectFolder ? ` (folder ${task.projectFolder})` : '';
    const edits = task.allowEdits
      ? 'You may change files in the project folder when a step needs it.'
      : 'Don\'t change files in the project folder unless he explicitly asks: his results go back through the Done notes.';
    msg = `Sam is working on this task from his project "${task.projectName}"${where}: ${task.text}. The plan he's following: ${steps} Help him finish it. ${edits} As steps get done, tick them in his plan with the Task Desk tools.`;
  } else {
    const lane = task.lane === 'factory' ? 'factory-wide' : `lane ${task.lane} (folder ${task.laneDir})`;
    msg = `Sam is working on this task from NEEDS_NICK.md, ${lane}: ${task.text}. The plan he's following: ${steps} Help him finish it. Don't edit Workshop files unless he explicitly asks: his results go back through the Done notes. As steps get done, tick them in his plan with the Task Desk tools.`;
  }
  return msg.replace(/\s+/g, ' ').slice(0, 7000);
}

// Sent with every launch (fresh or resumed), so even older chats know about the tools.
function systemNote(task) {
  const where = isProject(task) ? `project "${task.projectName}"` : `lane ${task.lane}`;
  return [
    `You are running inside Nick's Task Desk, in the chat window for one task: "${task.title}" (${where}).`,
    "The taskdesk tools update THIS task's plan, which Nick sees next to this chat:",
    'get_task shows the numbered steps, which are done, comments, and his notes. Call it when you start or resume, so you know what is already done.',
    'update_step ticks a step done (or not) and/or leaves a short comment on it. Use it as soon as a step is finished or Nick says he did one, with a one-line comment on the outcome (who, what, date, result, or what is still open).',
    'add_note appends a line to his "Notes for the factory" (results, replies, dates). Do not repeat what is already there.',
    'Never press Done/Skip for him; he finishes the task himself.',
  ].join(' ');
}

function withTools(task, args) {
  if (!bridge.ready()) return args;
  // These options take lists, so they go first: the next "--" option ends each list.
  return ['--mcp-config', bridge.configFor(task.id), '--allowedTools', 'mcp__taskdesk', '--append-system-prompt', systemNote(task), ...args];
}

function attempts(task, plan, mode) {
  const st = state.task(task.id);
  const msg = firstMessage(task, plan);
  const list = [];
  if (mode === 'auto' && st.chatSessionId && fs.existsSync(sessionFile(task.workDir, st.chatSessionId))) {
    list.push({ label: 'Resuming this task\'s chat', sid: st.chatSessionId, args: ['--resume', st.chatSessionId] });
  }
  if (mode !== 'fresh') {
    const base = newestSession(task.workDir, ownSessionIds());
    if (base) {
      const sid = crypto.randomUUID();
      list.push({ label: isProject(task) ? 'Starting from this project\'s latest session' : 'Starting from the factory\'s latest session', sid, args: ['--resume', base, '--fork-session', '--session-id', sid, msg] });
    }
    const sid2 = crypto.randomUUID();
    list.push({ label: 'Continuing the folder\'s last conversation', sid: sid2, args: ['--continue', '--fork-session', '--session-id', sid2, msg] });
  }
  const sid3 = crypto.randomUUID();
  list.push({ label: 'Starting a fresh chat', sid: sid3, args: ['--session-id', sid3, msg] });
  return list;
}

// Tests swap in a pretend claude: TASKDESK_FAKE_CLAUDE="<node.exe>|<script.js>".
function command(args) {
  const fake = process.env.TASKDESK_FAKE_CLAUDE;
  if (fake) { const [exe, script] = fake.split('|'); return [exe, [script, ...args]]; }
  return [claudeExe(), args];
}

function start(task, plan, { mode = 'auto', cols = 100, rows = 30, onData, onExit, onInfo }) {
  stop(task.id);
  const tries = attempts(task, plan, mode);
  // The window's handlers; attach() swaps them when a window is refreshed.
  const cb = { onData, onExit, onInfo };
  const run = (i) => {
    const a = tries[i];
    cb.onInfo && cb.onInfo({ label: a.label, sessionId: a.sid });
    const startedAt = Date.now();
    const [exe, args] = command(withTools(task, a.args));
    const proc = pty.spawn(exe, args, {
      name: 'xterm-256color', cols, rows, cwd: task.workDir,
      env: cleanEnv({ TERM: 'xterm-256color', COLORTERM: 'truecolor' }),
    });
    const entry = { proc, sessionId: a.sid, label: a.label, stopped: false, buf: '', lastOut: Date.now(), cb };
    live.set(task.id, entry);
    remember(a.sid);
    state.update(task.id, { chatSessionId: a.sid });
    proc.onData((d) => {
      entry.lastOut = Date.now();
      entry.buf += d;
      if (entry.buf.length > KEEP * 1.5) entry.buf = entry.buf.slice(-KEEP);
      cb.onData && cb.onData(d);
    });
    proc.onExit(({ exitCode }) => {
      if (entry.stopped) return;
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

function write(id, data) {
  const e = live.get(id);
  if (e) e.proc.write(data);
}

// Paste text as a single block (bracketed paste) and press Enter.
function send(id, text) {
  const e = live.get(id);
  if (!e) return false;
  e.proc.write('\x1b[200~' + text + '\x1b[201~');
  setTimeout(() => e.proc.write('\r'), 120);
  return true;
}

function resize(id, cols, rows) {
  const e = live.get(id);
  if (e && cols > 0 && rows > 0) try { e.proc.resize(cols, rows); } catch {}
}

function stop(id) {
  const e = live.get(id);
  if (!e) return;
  e.stopped = true;
  live.delete(id);
  try { e.proc.kill(); } catch {}
}

function stopAll() {
  for (const id of [...live.keys()]) stop(id);
}

const isLive = (id) => live.has(id);

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

module.exports = { start, attach, write, send, resize, stop, stopAll, isLive, quietFor, firstMessage };
