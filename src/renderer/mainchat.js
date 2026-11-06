// A project's main chat window: the user's own Claude Code session for the
// project (the one that writes its tasks), found and started by the app (see
// src/main/mainchat.js). The window only shows it and passes keys through.
const $ = (s) => document.querySelector(s);
let started = false;

// ---------- window chrome ----------
$('#wmin').innerHTML = icon('minus');
$('#wmax').innerHTML = icon('square');
$('#wclose').innerHTML = icon('x');
$('#wmin').onclick = () => desk.minimize();
$('#wmax').onclick = () => desk.maximize();
$('#wclose').onclick = () => desk.close();
$('#wlook').innerHTML = icon('palette');
$('#wlook').onclick = (e) => {
  e.stopPropagation();
  lookPanel($('#wlook'));
};
$('#ttile').innerHTML = icon('chat');
$('#avatar').innerHTML = icon('sparkle');
$('#cother').innerHTML = `${icon('refresh')}<span>Other sessions</span>`;
$('#cnew').innerHTML = `${icon('plus')}<span>New main chat</span>`;

const dateOf = (t) =>
  t ? new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

function showName(r) {
  if (!r || !r.name) return;
  document.title = `${r.name} · Main chat`;
  $('#tname').textContent = `${r.name}  ·  Main chat`;
}

// ---------- the terminal ----------
const css = getComputedStyle(document.documentElement);
const term = new Terminal({
  fontFamily: css.getPropertyValue('--mono').trim(),
  fontSize: 13,
  lineHeight: 1.25,
  cursorBlink: true,
  cursorStyle: 'bar',
  allowProposedApi: true,
  scrollback: 5000,
  theme: termTheme(),
});
document.addEventListener('lookchange', () => {
  term.options.theme = termTheme();
  setTimeout(refit, 50);
});
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.open($('#term'));
// Ctrl+C copies when text is selected (otherwise it goes to Claude); Ctrl+V pastes.
term.attachCustomKeyEventHandler((e) => {
  if (e.type !== 'keydown') return true;
  if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && term.hasSelection()) {
    desk.copy(term.getSelection());
    term.clearSelection();
    return false;
  }
  if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) return false;
  return true;
});
term.onData((d) => desk.mainWrite(d));
const refit = () => {
  try {
    fit.fit();
    if (started) desk.mainResize(term.cols, term.rows);
  } catch {}
};
new ResizeObserver(() => requestAnimationFrame(refit)).observe($('#term'));

function setStat(kind, text) {
  $('#cstat').className = 'cstat ' + kind;
  $('#cstatText').textContent = text;
}

let gotData = false;
let label = 'Live';
desk.onChatData((id, d) => {
  if (id !== 'main') return;
  term.write(d);
  if (!gotData) {
    gotData = true;
    setStat('live', label);
  }
});
desk.onChatInfo((id, info) => {
  if (id !== 'main') return;
  gotData = false;
  label = `Live · ${String(info.label || 'main chat').toLowerCase()}`;
  setStat('connecting', `${info.label || 'Starting'}…`);
});
desk.onChatExit((id, code) => {
  if (id !== 'main') return;
  started = false;
  if (code === -2) return setStat('', "Claude Code isn't installed: see below");
  setStat('', 'The chat ended');
  ended();
});

// ---------- starting it ----------
// mode: 'attach' | 'auto' | 'new' | 'pick' (with the session's id)
async function start(mode, pickId) {
  $('#overlay').hidden = true;
  term.reset();
  fit.fit();
  setStat('connecting', mode === 'new' ? 'Starting a new main chat…' : 'Looking for your main chat…');
  const r = await desk.mainStart(mode, pickId || null, term.cols, term.rows);
  showName(r);
  if (!r || !r.ok) {
    setStat('', 'No main chat yet');
    return choose(r, true);
  }
  started = true;
  if (r.session && r.session.first)
    $('#cfoot').textContent = `"${r.session.first}"  ·  in ${r.session.cwd}. If it's also open in a terminal, close it there first.`;
  setTimeout(() => term.focus(), 200);
}

function ended() {
  const o = $('#overlay');
  o.replaceChildren(
    h(
      'div',
      { class: 'inner' },
      h('b', { class: 't' }, 'The chat ended'),
      h('p', {}, 'Open it again where it left off, or pick another session.'),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn primary', html: `${icon('play')}<span>Open it again</span>`, onclick: () => start('auto') }),
        h('button', { class: 'btn', html: `${icon('refresh')}<span>Other sessions</span>`, onclick: () => choose() })
      )
    )
  );
  o.hidden = false;
}

// The list of sessions to pick from: the ones that set this project up for Task
// Desk first, then other recent sessions in its folder.
async function choose(info, none) {
  const o = $('#overlay');
  o.replaceChildren(h('div', { class: 'inner' }, h('p', {}, 'Looking through your Claude Code sessions…')));
  o.hidden = false;
  const list = await desk.mainSessions();
  const name = (info && info.name) || 'this project';
  const rows = list.map((s) =>
    h(
      'button',
      { class: 'sess', onclick: () => start('pick', s.id) },
      h('span', { class: 'first' }, s.first || '(no message yet)'),
      h('span', { class: 'meta' }, s.setUp ? h('span', { class: 'tag' }, 'Set up Task Desk · ') : '', `${dateOf(s.at)}  ·  ${s.cwd}`)
    )
  );
  o.replaceChildren(
    h(
      'div',
      { class: 'inner' },
      h('b', { class: 't' }, none ? `No main chat found for ${name}` : 'Which session is the main chat?'),
      h(
        'p',
        {},
        none
          ? "The main chat is the Claude Code session you pasted Task Desk's instructions into (the box's \"Copy for another AI chat\" button). Pick it below, or start a new one in the project's folder."
          : "Pick the Claude Code session that makes this project's tasks. Task Desk remembers it on this computer."
      ),
      ...rows,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn primary', html: `${icon('plus')}<span>Start a new main chat</span>`, onclick: () => start('new') }),
        ...(none ? [] : [h('button', { class: 'btn', html: '<span>Cancel</span>', onclick: () => (o.hidden = true) })])
      )
    )
  );
}

$('#cother').onclick = () => choose();
$('#cnew').onclick = () => start('new');

// A refreshed window picks the running chat back up; otherwise it starts.
desk.mainInfo().then(showName);
start('attach');
