// Small shared helpers: icons, element builder, lane colors, toasts.
const ICONS = {
  email: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7.5 8.5 6 8.5-6"/>',
  keywords: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  decision: '<path d="M12 4v16M8 20h8M5 8h14M5 8l-2.5 5.5a2.5 2.5 0 0 0 5 0zM19 8l-2.5 5.5a2.5 2.5 0 0 0 5 0zM12 4l-1 1M12 4l1 1"/>',
  signup: '<circle cx="8" cy="15" r="4"/><path d="m10.9 12.1 8.6-8.6M16 7l2.5 2.5M13.8 9.2l2 2"/>',
  review: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.6M12 16.8v.01"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2A1.7 1.7 0 0 0 13.8 4.5H6.2A1.7 1.7 0 0 0 4.5 6.2v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.3a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 18.3V7.7A1.7 1.7 0 0 1 5.7 6H10"/>',
  folder: '<path d="M3.5 7.2A1.7 1.7 0 0 1 5.2 5.5h4l2 2.2h7.6a1.7 1.7 0 0 1 1.7 1.7v8.4a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z"/>',
  file: '<path d="M14 3.5H7.2a1.7 1.7 0 0 0-1.7 1.7v13.6a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
  send: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>',
  chat: '<path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4.5 20l1-4A7.5 7.5 0 1 1 20 12.5z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  minus: '<path d="M6 12h12"/>',
  square: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  chevDown: '<path d="m7 10 5 5 5-5"/>',
  chevUp: '<path d="m7 14 5-5 5 5"/>',
  sparkle: '<path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5z"/><path d="M18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  eraser: '<path d="m8.5 19.5-4-4a1.5 1.5 0 0 1 0-2.1l8.9-8.9a1.5 1.5 0 0 1 2.1 0l4 4a1.5 1.5 0 0 1 0 2.1L12 18.1M8.5 19.5h11M9.5 8.5l6 6"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  unlock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
  bolt: '<path d="M13 3.5 5.5 13.5h6l-1 7 7.5-10h-6z"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  skip: '<path d="m6 6.5 7 5.5-7 5.5zM16.5 6.5v11"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.9 12.1 8.6-8.6M16 7l2.5 2.5"/>',
  paste: '<rect x="5.5" y="5" width="13" height="15.5" rx="2"/><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 14.5h4"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.7 0-.9.7-1.6 1.7-1.6h2.1a4 4 0 0 0 4-4C20.5 6.6 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1.1"/><circle cx="10.5" cy="7.4" r="1.1"/><circle cx="15" cy="7.6" r="1.1"/>',
};

function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}

function laneColor(lane) {
  if (lane === 'factory') return 'var(--ink-3)';
  let n = 0;
  for (const c of lane) n = (n * 31 + c.charCodeAt(0)) % 360;
  const hues = [18, 42, 150, 190, 222, 268, 320, 95];
  return `hsl(${hues[n % hues.length]} 48% 52%)`;
}

const TYPE_LABEL = { email: 'Email', keywords: 'Keywords', decision: 'Decision', signup: 'Key / signup', review: 'Review', question: 'Question' };
const laneName = (l) => (l === 'factory' ? 'Factory-wide' : l.replace(/-/g, ' '));

function fmtMin(m) {
  if (!m) return '';
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = h('div', { class: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// Button that briefly shows a confirmation label after it runs.
function actBtn(label, ic, fn, { cls = '', done = 'Done' } = {}) {
  const b = h('button', { class: `btn sm ${cls}`, html: `${icon(ic)}<span>${label}</span>` });
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const r = await fn();
    if (r && r.ok === false) { toast(r.error || 'That didn\'t work'); return; }
    if (done) {
      b.classList.add('done-flash');
      b.innerHTML = `${icon('check')}<span>${done}</span>`;
      setTimeout(() => { b.classList.remove('done-flash'); b.innerHTML = `${icon(ic)}<span>${label}</span>`; }, 1400);
    }
  });
  return b;
}

// head: an optional title line; notes: optional small print under the items.
function popMenu(anchor, items, { head, notes = [] } = {}) {
  const m = h('div', { class: 'popmenu' },
    head ? h('div', { class: 'pophead' }, head) : null,
    items.map((it) => h('button', { onclick: () => { m.remove(); it.run(); }, html: `${icon(it.icon)}<span>${it.label}</span>${it.hint ? `<small>${it.hint}</small>` : ''}` })),
    ...notes.filter(Boolean).map((n) => h('div', { class: 'popnote' }, n)));
  placePopup(anchor, m);
}

// Show a popup under (or above) a button; clicking outside closes it.
function placePopup(anchor, m) {
  document.querySelectorAll('.popmenu').forEach((x) => x.remove());
  const r = anchor.getBoundingClientRect();
  document.body.append(m);
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  m.style.top = top + 'px';
  m.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
  setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  // Esc closes it too.
  document.addEventListener('keydown', function esc(e) {
    if (!m.isConnected) { document.removeEventListener('keydown', esc); return; }
    if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', esc); }
  });
}

// ---------- look: theme, frame material, light/dark, text size ----------
const THEMES = [['clay', 'Clay'], ['sage', 'Sage'], ['ocean', 'Ocean'], ['plum', 'Plum'], ['honey', 'Honey'], ['graphite', 'Graphite']];
const MATERIALS = [['paper', 'Paper'], ['glass', 'Glass'], ['linen', 'Linen'], ['wood', 'Wood'], ['leather', 'Leather'], ['metal', 'Metal'], ['neon', 'Neon'],
  ['aurora', 'Aurora'], ['lava', 'Magma'], ['stars', 'Stars'], ['rainbow', 'Rainbow'], ['bubbler', 'Bubbler'], ['lavalamp', 'Lava lamp'], ['picture', 'My picture']];
// Frames that move (a picture can be a GIF).
const MOVING = ['aurora', 'lava', 'stars', 'rainbow', 'bubbler', 'lavalamp', 'picture'];
let LOOK = desk.lookNow();
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const stillQuery = matchMedia('(prefers-reduced-motion: reduce)');

function applyLook(look = LOOK) {
  LOOK = look;
  const root = document.documentElement;
  root.dataset.theme = look.theme;
  root.dataset.material = look.material;
  if (MOVING.includes(look.material)) root.dataset.motion = ''; else delete root.dataset.motion;
  if (look.motion === 'off') root.dataset.still = ''; else delete root.dataset.still;
  if (look.pictureUrl) root.style.setProperty('--frame-pic', `url("${look.pictureUrl}")`);
  else root.style.removeProperty('--frame-pic');
  // The bubbler and lava lamp are drawn live (liveframe.js); they hold still with "Keep still" or Windows' animations off.
  root.classList.toggle('dark', look.appearance === 'dark' || (look.appearance === 'system' && darkQuery.matches));
  window.liveFrame.set(look.material, root.classList.contains('dark'), look.motion !== 'off' && !stillQuery.matches);
  applyColors(look);
  document.dispatchEvent(new Event('lookchange'));
}

// Your own colors on top of the theme: the accent (buttons, highlights), the
// task cards and the background. Cards and background are blended into the
// theme's own color by the strength you pick, so text stays readable. They're
// set on <body>, blending with the theme colors kept in --surface-0 etc.
const ROUND = { sharp: [4, 3], normal: [14, 9], round: [20, 13], extra: [26, 17] };
function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? '#1b1b1f' : '#ffffff';
}
function applyColors(look) {
  const b = document.body && document.body.style;
  if (!b) return;
  const put = (k, v) => (v ? b.setProperty(k, v) : b.removeProperty(k));
  const ok = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  const a = ok(look.accent) && look.accent;
  put('--clay', a);
  put('--clay-2', a && `color-mix(in srgb, ${a} 80%, white)`);
  put('--clay-soft', a && `color-mix(in srgb, ${a} 22%, var(--bg-0))`);
  put('--clay-ink', a && inkFor(a));
  const c = ok(look.card) && look.card, ck = clampN(look.cardMix, 35);
  put('--surface', c && `color-mix(in srgb, ${c} ${ck}%, var(--surface-0))`);
  put('--surface-2', c && `color-mix(in srgb, ${c} ${Math.round(ck * 0.75)}%, var(--surface2-0))`);
  const g = ok(look.bg) && look.bg, gk = clampN(look.bgMix, 25);
  put('--bg', g && `color-mix(in srgb, ${g} ${gk}%, var(--bg-0))`);
  put('--bg-2', g && `color-mix(in srgb, ${g} ${Math.round(gk * 1.15)}%, var(--bg2-0))`);
  const r = ROUND[look.round];
  put('--r', r && r[0] + 'px');
  put('--r-sm', r && r[1] + 'px');
}
const clampN = (v, d) => Math.max(5, Math.min(100, Number.isFinite(+v) && v !== '' && v != null ? +v : d));
applyLook();
darkQuery.addEventListener('change', () => applyLook());
stillQuery.addEventListener('change', () => applyLook());
desk.onLook((look) => applyLook(look));

const PALETTE = ['#ff5fa8', '#ff7a59', '#ffc94d', '#5fcf86', '#3fb8c9', '#4d8dff', '#8f74ff', '#c26bd8'];

function lookPanel(anchor) {
  const set = (patch) => { applyLook({ ...LOOK, ...patch }); desk.setLook(patch); draw(); };
  // Sliders and the color picker: show it at once, save a moment later, don't redraw (keeps the drag).
  let soonT = null, soon = {};
  const setSoon = (patch) => {
    applyLook({ ...LOOK, ...patch });
    Object.assign(soon, patch);
    clearTimeout(soonT);
    soonT = setTimeout(() => { desk.setLook(soon); soon = {}; }, 180);
  };
  const stop = (e) => e.stopPropagation();
  const colorRow = (label, key, mixKey, def) => {
    const cur = LOOK[key] || '';
    return h('div', { class: 'colorrow' },
      h('span', { class: 'clabel' }, label),
      h('div', { class: 'crow' },
        h('button', { class: 'cnone' + (cur ? '' : ' on'), title: 'Theme color', onclick: (e) => { stop(e); set({ [key]: '' }); } }, 'Theme'),
        ...PALETTE.map((c) => h('button', { class: 'cdot' + (cur.toLowerCase() === c ? ' on' : ''), style: `background:${c}`, title: c, onclick: (e) => { stop(e); set({ [key]: c }); } })),
        h('label', { class: 'cpick' + (cur && !PALETTE.includes(cur.toLowerCase()) ? ' on' : ''), title: 'Pick any color', style: cur ? `--pick:${cur}` : '', onclick: stop },
          h('input', { type: 'color', value: cur || '#ff5fa8', oninput: (e) => setSoon({ [key]: e.target.value }), onchange: () => draw() }))),
      mixKey && cur ? h('div', { class: 'crow mix' },
        h('span', { class: 'clabel' }, 'Strength'),
        h('input', { type: 'range', min: 5, max: 100, step: 1, value: clampN(LOOK[mixKey], def), onclick: stop, oninput: (e) => setSoon({ [mixKey]: +e.target.value }) })) : null);
  };
  const scopeBar = () => {
    if (!LOOK.scopeId) return null;
    const own = LOOK.scopeOwn;
    const flip = async (e) => { stop(e); applyLook(await desk.ownLook(!own)); draw(); };
    return h('div', { class: 'scope' + (own ? ' own' : '') },
      h('span', {}, own ? `Styling ${LOOK.scopeName} only.` : `${LOOK.scopeName} uses the desk's look.`),
      h('button', { onclick: flip }, own ? 'Use the desk\'s look' : 'Give it its own look'));
  };
  const tile = (on, kids, run) => h('button', { class: on ? 'on' : '', onclick: (e) => { e.stopPropagation(); run(); } }, kids);
  const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, label]) => tile(LOOK[key] === v, label, () => set({ [key]: v }))));
  const m = h('div', { class: 'popmenu lookpanel' });
  const close = (e) => { if (e) stop(e); m.remove(); };
  const draw = () => m.replaceChildren(...[
    h('div', { class: 'lphead' },
      h('b', {}, 'Customize the look'),
      h('button', { class: 'lpclose', title: 'Close (Esc)', html: icon('x'), onclick: close })),
    scopeBar(),
    h('h4', {}, 'Theme'),
    h('div', { class: 'grid' }, THEMES.map(([v, label]) => tile(LOOK.theme === v, [h('span', { class: 'swatch', 'data-theme': v }), label], () => set({ theme: v })))),
    h('h4', {}, 'Frame'),
    h('div', { class: 'grid' }, MATERIALS.map(([v, label]) => tile(LOOK.material === v, [h('span', { class: 'mat', 'data-material': v }), label],
      () => (v === 'picture' && !LOOK.pictureUrl ? pickPicture() : set({ material: v }))))),
    LOOK.material === 'picture' ? h('div', { class: 'pic' },
      h('button', { onclick: (e) => { e.stopPropagation(); pickPicture(); }, html: `${icon('image')}<span>${LOOK.pictureUrl ? 'Change picture…' : 'Choose a picture…'}</span>` }),
      h('span', {}, 'Any picture, or a GIF to make it move.')) : null,
    h('h4', {}, 'Motion'),
    seg('motion', [['on', 'Moving frames'], ['off', 'Keep still']]),
    h('h4', {}, 'Your colors'),
    colorRow('Accent', 'accent'),
    colorRow('Task cards', 'card', 'cardMix', 35),
    colorRow('Background', 'bg', 'bgMix', 25),
    h('h4', {}, 'Corners'),
    seg('round', [['sharp', 'Sharp'], ['normal', 'Normal'], ['round', 'Round'], ['extra', 'Extra round']]),
    h('h4', {}, 'Light or dark'),
    seg('appearance', [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]),
    h('h4', {}, 'Text size'),
    seg('size', [['s', 'Small'], ['m', 'Normal'], ['l', 'Large'], ['xl', 'Larger']]),
    h('label', { class: 'newown', onclick: stop },
      h('input', { type: 'checkbox', checked: !!LOOK.newOwn, onchange: async (e) => { applyLook(await desk.newProjectsOwnLook(e.target.checked)); } }),
      h('span', {}, 'New projects start with their own look')),
    h('div', { class: 'foot' }, LOOK.scopeOwn ? `Changes apply to ${LOOK.scopeName} and are saved.` : 'Changes apply to every window and are saved.'),
    h('button', { class: 'lpdone', onclick: close }, 'Done'),
  ].filter(Boolean));
  // A copy of the chosen file goes in the app's data folder.
  const pickPicture = async () => {
    const r = await desk.pickFramePicture();
    if (!r) return;
    if (!r.ok) { toast(r.error); return; }
    applyLook(r.look);
    draw();
  };
  draw();
  placePopup(anchor, m);
}

// ---------- autosave ----------
// Every text box saves itself as you type (and again when you click away or
// close the window). The little "Saved" note next to it shows it happened.
const pendingSaves = new Set();
function saveStatus() {
  const el = document.getElementById('savestate');
  if (!el) return;
  const busy = pendingSaves.size > 0;
  el.dataset.s = busy ? 'saving' : 'saved';
  el.innerHTML = busy ? 'Saving…' : `${icon('check')}All changes saved`;
}

function autosave(el, save, saveSync) {
  const note = h('span', { class: 'saved' });
  let timer = null;
  const mark = (s) => {
    note.dataset.s = s;
    note.innerHTML = s === 'saving' ? 'Saving…' : `${icon('check')}Saved`;
    if (s === 'saved') note.title = 'Saved at ' + new Date().toLocaleTimeString();
  };
  const run = async () => {
    clearTimeout(timer);
    if (!pendingSaves.has(flush)) return;
    pendingSaves.delete(flush);
    await save(el.value);
    if (!pendingSaves.has(flush)) mark('saved');
    saveStatus();
  };
  const flush = () => { clearTimeout(timer); saveSync(el.value); };
  el.addEventListener('input', () => { pendingSaves.add(flush); mark('saving'); saveStatus(); clearTimeout(timer); timer = setTimeout(run, 350); });
  el.addEventListener('blur', run);
  if (el.value) mark('saved');
  note.markSaved = () => mark('saved');
  return note;
}
// Closing the window mid-typing still saves: flush synchronously.
window.addEventListener('beforeunload', () => { for (const f of pendingSaves) f(); pendingSaves.clear(); });
