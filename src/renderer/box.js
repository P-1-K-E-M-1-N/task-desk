const $ = (s) => document.querySelector(s);
let data = null;
let lane = 'all'; // the chip filter: a lane inside one project, or a project in "All projects"
let updatedAt = Date.now();
let lastKey = '';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- project switcher ----------
$('#pchev').innerHTML = icon('chevDown');
$('#switch').onclick = (e) => { e.stopPropagation(); if (data && data.collapsed) desk.collapse(false); projectMenu($('#switch')); };
const many = () => data && data.projects.length > 1;
const viewName = () => {
  if (!data) return 'Task Desk';
  if (data.view === 'all') return many() ? 'All projects' : 'Workshop';
  return (data.projects.find((p) => p.id === data.view) || {}).name || 'Task Desk';
};
const userProject = () => data && data.view !== 'all' && data.view !== 'factory' ? data.projects.find((p) => p.id === data.view) : null;

function projectMenu(anchor) {
  const m = h('div', { class: 'popmenu projects' });
  const row = (on, dot, name, count, run, extra = '') => h('button', {
    class: on ? 'on' : '',
    onclick: () => { m.remove(); run(); },
    html: `${dot}<span class="nm"></span>${extra}<span class="cnt">${count}</span>`,
  });
  const set = (v) => { desk.setView(v); lane = 'all'; };
  const all = row(data.view === 'all', icon('check'), 'All projects', data.totalOpen, () => set('all'));
  all.querySelector('.nm').textContent = 'All projects';
  const items = data.projects.map((p) => {
    const b = row(data.view === p.id, `<span class="dot" style="background:${p.color}"></span>`, p.name, p.open, () => set(p.id),
      p.missing ? '<span class="warnico" title="Folder not found on this computer">!</span>' : '');
    b.querySelector('.nm').textContent = p.name;
    return b;
  });
  const up = userProject();
  m.append(
    h('div', { class: 'head' }, 'Projects'), all, ...items, h('hr'),
    h('button', { onclick: () => { m.remove(); desk.editProject(null); }, html: `${icon('plus')}<span class="nm">Add a project…</span>` }),
    up ? h('button', { onclick: () => { m.remove(); desk.editProject(up.id); }, html: `${icon('more')}<span class="nm">Edit this project…</span>` }) : null,
  );
  placePopup(anchor, m);
}

// ---------- quick add ----------
$('#qadd').innerHTML = icon('plus');
$('#qtext').addEventListener('input', () => store.set('qdraft:' + data.view, $('#qtext').value));
$('#quickadd').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('#qtext').value.trim();
  if (!text || !userProject()) return;
  const id = await desk.addTask(data.view, text);
  if (!id) { toast('Couldn\'t add that'); return; }
  $('#qtext').value = '';
  store.set('qdraft:' + data.view, '');
  toast('Added. Claude is drafting a plan for it.');
};

$('#menu').innerHTML = icon('more');
$('#hide').innerHTML = icon('x');
$('#hide').onclick = () => desk.hide();
$('#menu').onclick = () => desk.menu();
$('#look').innerHTML = icon('palette');
$('#look').onclick = (e) => { e.stopPropagation(); if (data && data.collapsed) desk.collapse(false); lookPanel($('#look')); };
desk.onLookOpen(() => { if (data && data.collapsed) desk.collapse(false); setTimeout(() => lookPanel($('#look')), 250); });
$('#collapse').onclick = () => desk.collapse(!data.collapsed);

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Late night, Nick' : hr < 12 ? 'Good morning, Nick' : hr < 17 ? 'Good afternoon, Nick' : 'Good evening, Nick';
}

function ring(done, total) {
  const C = 2 * Math.PI * 9;
  return `<svg class="ring" viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9"/><circle class="fg" cx="12" cy="12" r="9" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - done / total)}"/></svg>`;
}

function render() {
  if (!data) return;
  const { tasks, counts } = data;
  if (data.view !== render.view) { lane = 'all'; render.view = data.view; }
  document.body.classList.toggle('bar-mode', !!data.collapsed);
  document.body.classList.toggle('unlocked', !data.locked);
  $('#lockbtn').innerHTML = icon(data.locked ? 'lock' : 'unlock');
  $('#lockbtn').title = data.locked ? 'Size is locked. Click to unlock and stretch the box.' : 'Size is unlocked. Drag the corner to stretch the box, or click to lock it.';
  $('#collapse').innerHTML = icon(data.collapsed ? 'chevDown' : 'chevUp');
  $('#mode').hidden = data.mode !== 'test';
  $('#hello').textContent = greeting();
  $('#count').textContent = `${counts.open} task${counts.open === 1 ? '' : 's'}`;
  $('#mins').textContent = counts.open ? `· ~${fmtMin(counts.minutes)}` : '';
  $('#barsum').innerHTML = `${counts.open} tasks<em>~${fmtMin(counts.minutes)}</em>`;
  const total = counts.open + counts.done;
  $('#prog').style.width = total ? `${(counts.done / total) * 100}%` : '0';
  $('#progtxt').textContent = counts.done ? `${counts.done} done` : 'none done yet';

  // Header: which project, a warning if its folder is missing, and quick add for your own projects.
  $('#pname').textContent = viewName();
  const up = userProject();
  $('#warn').hidden = !(up && up.missing);
  if (up && up.missing) {
    $('#warn').innerHTML = 'This project\'s folder isn\'t on this computer. <button>Fix the folder</button>';
    $('#warn').querySelector('button').onclick = () => desk.editProject(up.id);
  }
  $('#quickadd').hidden = !up;
  if (up && $('#qtext').dataset.view !== data.view) {
    $('#qtext').dataset.view = data.view;
    $('#qtext').placeholder = `Add a task to ${up.name}…`;
    $('#qtext').value = store.get('qdraft:' + data.view) || '';
  }

  // Chips: projects in "All projects" (once there's more than one), otherwise the project's lanes.
  const byProject = data.view === 'all' && many();
  const keyOf = (t) => (byProject ? t.project : t.lane);
  const groups = {};
  for (const t of tasks) groups[keyOf(t)] = (groups[keyOf(t)] || 0) + 1;
  if (lane !== 'all' && !groups[lane]) lane = 'all';
  const chips = $('#chips');
  const order = byProject
    ? data.projects.map((p) => p.id).filter((id) => groups[id])
    : Object.keys(groups).sort((a, b) => (a === 'factory') - (b === 'factory') || a.localeCompare(b));
  chips.replaceChildren(
    chipEl('all', 'All', tasks.length),
    ...order.map((k) => {
      const p = byProject && data.projects.find((x) => x.id === k);
      return chipEl(k, p ? p.name : laneName(k), groups[k], p ? p.color : laneColor(k), !!p);
    }),
  );

  const shown = tasks.filter((t) => lane === 'all' || keyOf(t) === lane);
  const list = $('#list');
  if (!shown.length) {
    const hint = up ? (up.kind === 'file' ? 'Nothing open in its checklist. Type a task above to add one.' : 'Type a task above to add one.') : 'Nothing needs you right now.';
    list.replaceChildren(h('div', { class: 'empty', html: `<div class="tile">${icon('check')}</div><b>All clear</b>${hint}` }));
  } else {
    // Only play the entry animation when the set of tasks changes, not on every refresh.
    const key = shown.map((t) => t.id).join();
    list.classList.toggle('still', key === lastKey);
    lastKey = key;
    list.replaceChildren(...shown.map((t, i) => card(t, i)));
  }
  drawBadge(data.totalOpen);
}

function chipEl(key, label, n, color, plain) {
  const dot = key === 'all' ? '' : `<span class="dot" style="background:${color}"></span>`;
  const b = h('button', {
    class: 'chip' + (lane === key ? ' on' : ''),
    html: `${dot}<span class="cl"></span> <em>${n}</em>`,
    onclick: () => { lane = key; render(); },
  });
  b.querySelector('.cl').textContent = label;
  if (plain) b.style.textTransform = 'none';
  return b;
}

function card(t, i) {
  let right = '';
  if (t.chatLive) right = '<span class="live" title="Chat open"></span>';
  else if (t.planStatus === 'drafting' || t.planStatus === 'queued') right = `<span class="drafting" title="Claude is drafting the plan">${icon('sparkle')}</span>`;
  else if (t.ticked && t.steps) right = ring(t.ticked, t.steps);
  const quick = t.minutes && t.minutes <= 10 ? `<span class="quick" title="Quick win">${icon('bolt')}</span>` : '';
  // In "All projects" the card names its project; inside a project it names the lane.
  const showProject = data.view === 'all' && many();
  const tag = showProject ? { color: t.projectColor, name: t.projectName } : { color: laneColor(t.lane), name: laneName(t.lane) };
  const el = h('button', {
    class: `card${t.important ? ' urgent' : ''}${t.low ? ' low' : ''}`,
    style: `animation-delay:${Math.min(i, 10) * 25}ms`,
    title: t.text,
    onclick: () => desk.openTask(t.id),
    html: `
      <div class="tile t-${t.type}">${icon(t.type)}</div>
      <div class="body">
        <div class="ttl"></div>
        <div class="meta">
          <span class="lane"${showProject ? ' style="text-transform:none"' : ''}><span class="dot" style="background:${tag.color}"></span><span class="nm"></span></span>
          <span class="sep">·</span><span>${fmtMin(t.minutes)}</span>${quick}
        </div>
      </div>
      <div class="right">${right}</div>`,
  });
  el.querySelector('.ttl').textContent = t.title;
  el.querySelector('.lane .nm').textContent = tag.name;
  return el;
}

// Tray icon with the open-task count drawn on it.
const badgeImg = new Image();
badgeImg.src = '../../assets/icon.png';
let lastBadge = null;
function drawBadge(n) {
  if (!badgeImg.complete) { badgeImg.onload = () => drawBadge(n); return; }
  if (lastBadge === n) return;
  lastBadge = n;
  const c = $('#badge');
  const x = c.getContext('2d');
  x.clearRect(0, 0, 32, 32);
  x.drawImage(badgeImg, 0, 0, 32, 32);
  if (n > 0) {
    const label = n > 99 ? '99' : String(n);
    const w = label.length > 1 ? 22 : 17;
    x.fillStyle = '#1f1d1a';
    x.beginPath();
    x.roundRect(32 - w, 32 - 17, w, 17, 8.5);
    x.fill();
    x.fillStyle = '#fff';
    x.font = 'bold 13px Segoe UI, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(label, 32 - w / 2, 32 - 8);
  }
  desk.trayBadge(c.toDataURL('image/png'));
}

function tickUpdated() {
  const s = Math.round((Date.now() - updatedAt) / 1000);
  $('#updated').textContent = s < 10 ? 'Updated just now' : s < 60 ? `Updated ${s}s ago` : `Updated ${Math.round(s / 60)} min ago`;
}
setInterval(tickUpdated, 5000);

// ---------- size lock ----------
// Resting the mouse in the bottom-right corner for 3 seconds shows the lock.
// Unlocked, a grip appears next to it: drag it to make the box wider or taller.
{
  const corner = $('#corner');
  let arm = null, hideT = null;
  corner.addEventListener('mouseenter', () => {
    clearTimeout(hideT);
    if (corner.classList.contains('show')) return;
    corner.classList.add('arming');
    arm = setTimeout(() => { corner.classList.remove('arming'); corner.classList.add('show'); }, 3000);
  });
  corner.addEventListener('mouseleave', () => {
    clearTimeout(arm);
    corner.classList.remove('arming');
    hideT = setTimeout(() => corner.classList.remove('show'), Math.max(1500, keepUntil - Date.now()));
  });
  // Over remote desktop the hover may not register, so three quick right-clicks
  // near either bottom corner show the lock too, and keep it up for 8 seconds.
  // The corner zone reaches the window's very edge (past the frame).
  const nearCorner = (e) => e.clientY > innerHeight - 90 && (e.clientX > innerWidth - 120 || e.clientX < 120);
  let rights = [], keepUntil = 0;
  document.addEventListener('contextmenu', (e) => {
    if (!nearCorner(e) || document.body.classList.contains('bar-mode')) return;
    e.preventDefault();
    const now = Date.now();
    rights = rights.filter((t) => now - t < 1500).concat(now);
    if (rights.length < 3) return;
    rights = [];
    clearTimeout(arm); clearTimeout(hideT);
    keepUntil = now + 8000;
    corner.classList.remove('arming');
    corner.classList.add('show');
    hideT = setTimeout(() => { if (!corner.matches(':hover')) corner.classList.remove('show'); }, 8000);
  });
  $('#lockbtn').onclick = async () => {
    const locked = await desk.lockBox(!data.locked);
    toast(locked ? 'Size locked.' : 'Unlocked: drag the corner grip to stretch the box.');
  };
  const grip = $('#grip');
  let raf = 0;
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    desk.resizeBox('start');
    const move = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; desk.resizeBox('move'); }); };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('lostpointercapture', up);
      cancelAnimationFrame(raf); raf = 0;
      desk.resizeBox('end');
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('lostpointercapture', up);
  });
}

desk.onTasks((p) => { data = p; updatedAt = Date.now(); render(); tickUpdated(); });
desk.listTasks().then((p) => { data = p; render(); tickUpdated(); });
