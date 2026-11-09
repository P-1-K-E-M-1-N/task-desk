// What a chat is waiting for, read from what it prints. Task Desk can't see
// inside Claude Code (or Codex, or Gemini); it only sees the terminal output.
// So it reads the screen the way a person would: a question with Yes/No or
// numbered choices means "needs a yes or no" ('question'); the empty input
// line with its footer hints means "finished, your turn" ('turn'); "esc to
// interrupt" means busy.
//
// Output is collected until the chat has been quiet for a moment, then that
// chunk (the latest redraw) is read. Only the newest output counts, so a
// question that was answered doesn't linger. Typing clears the cue at once,
// and "your turn" isn't shown again until the chat has been busy since, so the
// user's own typing (which redraws the input line) never counts as the AI
// waiting. The desk listens (onChange) to flash windows and mark cards.

const QUIET_MS = 500;
const KEEP = 4000;

// Terminal output without its colours, cursor moves and other control sequences.
// Claude Code spaces words by moving the cursor right ("esc\x1b[1Cto\x1b[1Cinterrupt"),
// and starts lines by placing the cursor: those become spaces and line breaks
// first, so the words stay apart.
const strip = (s) =>
  String(s)
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '') // OSC (titles, hyperlinks)
    .replace(/\x1b\[(\d*)C/g, (m, n) => ' '.repeat(Math.min(Number(n) || 1, 200))) // cursor right
    .replace(/\x1b\[\d*(;\d*)?[HfEF]|\x1b\[\d*[ABd]/g, '\n') // cursor to another line
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '') // CSI (colours, cursor)
    .replace(/\x1b[()#][A-Za-z0-9]/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

// A yes/no, allow/deny or pick-an-option prompt (Claude Code, Codex, Gemini and plain y/n asks).
const QUESTION = [
  /❯\s*1\.\s*Yes/i,
  /\b(y\/n|yes\/no)\b/i,
  /\(Y\/n\)|\[y\/N\]/i,
  /Do you want to/i,
  /Would you like to/i,
  /Do you trust/i,
  /Yes, and don't ask again/i,
  /Esc to cancel/i,
  /Enter to (select|confirm|continue)/i,
  /Press Enter to continue/i,
  /\bAllow (once|always|this|execution)/i,
];
// The AI is working.
const BUSY = [/esc to interrupt/i, /ctrl\+c to (stop|cancel|interrupt)/i];
// The empty input line, waiting for a message.
const IDLE = [/\? for shortcuts/i, /shift\+tab to cycle/i, /accept edits/i, /Type your message/i, /context left/i, />\s*$/];

// One chunk of output: 'question', 'busy', 'idle', or 'nothing' (a spinner tick, a scroll).
function classify(output) {
  const s = strip(output).slice(-1500);
  if (!s.trim()) return 'nothing';
  if (QUESTION.some((r) => r.test(s))) return 'question';
  if (BUSY.some((r) => r.test(s))) return 'busy';
  if (IDLE.some((r) => r.test(s))) return 'idle';
  return 'nothing';
}

// One look at the latest output for one chat. e: { state, armed }. Returns the
// new state: 'question', 'turn' or null.
function step(e, output) {
  const c = classify(output);
  if (c === 'question') {
    e.state = 'question';
    e.idle = false;
  } else if (c === 'busy') {
    e.armed = true;
    e.state = null;
    e.idle = false;
  } else if (c === 'idle') {
    e.state = e.armed ? 'turn' : null;
    e.idle = true;
  }
  return e.state;
}

// Keys the user pressed, as against the terminal answering a query from the AI
// app (cursor position "\x1b[12;1R", device attributes "\x1b[?1;2c", mouse
// reports): those carry digits after the bracket; arrow keys and the like don't.
// Focus reports ("\x1b[I" in, "\x1b[O" out, sent when the window is clicked) aren't typing either.
const userTyped = (data) => !/^\x1b\[([?<]?\d[\d;]*[A-Za-z~]|[IO])$/.test(String(data));

const entries = new Map(); // chat id -> { state, armed, chunk, timer }
let listener = null;
// fn(id, state, before) whenever a chat's state changes.
const onChange = (fn) => (listener = fn);

const entry = (id) => {
  let e = entries.get(id);
  if (!e) entries.set(id, (e = { state: null, armed: false, idle: false, chunk: '', timer: null }));
  return e;
};
function tell(id, e, before) {
  if (e.state !== before && listener) listener(id, e.state, before);
}

// The chat printed something.
function feed(id, data) {
  const e = entry(id);
  e.chunk += data;
  if (e.chunk.length > KEEP * 1.5) e.chunk = e.chunk.slice(-KEEP);
  clearTimeout(e.timer);
  e.timer = setTimeout(() => settle(id), QUIET_MS);
}
function settle(id) {
  const e = entries.get(id);
  if (!e) return;
  const before = e.state;
  const out = e.chunk;
  e.chunk = '';
  step(e, out);
  tell(id, e, before);
}

// The user typed into the chat: whatever it was waiting for, they're on it.
function input(id, data) {
  const e = entries.get(id);
  if (!e || !userTyped(data)) return;
  const before = e.state;
  e.armed = false;
  e.state = null;
  e.idle = false;
  tell(id, e, before);
}

// The chat ended.
function forget(id) {
  const e = entries.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  entries.delete(id);
  tell(id, { state: null }, e.state);
}

const needs = (id) => (entries.get(id) || {}).state || null;
// The chat shows its empty input line (whether or not that counts as "your turn"): a message can go in.
const isIdle = (id) => !!(entries.get(id) || {}).idle;

module.exports = { classify, step, strip, userTyped, feed, input, forget, needs, isIdle, onChange, QUIET_MS };
