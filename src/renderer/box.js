const $ = (s) => document.querySelector(s);
let data = null;
let lane = localStorage.getItem('lane') || 'all';
let updatedAt = Date.now();
let lastKey = '';

$('#menu').innerHTML = icon('more');
$('#hide').innerHTML = icon('x');
$('#hide').onclick = () => desk.hide();
$('#menu').onclick = () => desk.menu();
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
  document.body.classList.toggle('bar-mode', !!data.collapsed);
  $('#collapse').innerHTML = icon(data.collapsed ? 'chevDown' : 'chevUp');
  $('#mode').hidden = data.mode !== 'test';
  $('#hello').textContent = greeting();
  $('#count').textContent = `${counts.open} task${counts.open === 1 ? '' : 's'}`;
  $('#mins').textContent = counts.open ? `· ~${fmtMin(counts.minutes)}` : '';
  $('#barsum').innerHTML = `${counts.open} tasks<em>~${fmtMin(counts.minutes)}</em>`;
  const total = counts.open + counts.done;
  $('#prog').style.width = total ? `${(counts.done / total) * 100}%` : '0';
  $('#progtxt').textContent = counts.done ? `${counts.done} done` : 'none done yet';

  const lanes = {};
  for (const t of tasks) lanes[t.lane] = (lanes[t.lane] || 0) + 1;
  if (lane !== 'all' && !lanes[lane]) lane = 'all';
  const chips = $('#chips');
  chips.replaceChildren(
    chipEl('all', 'All', tasks.length),
    ...Object.keys(lanes).sort((a, b) => (a === 'factory') - (b === 'factory') || a.localeCompare(b)).map((l) => chipEl(l, laneName(l), lanes[l])),
  );

  const shown = tasks.filter((t) => lane === 'all' || t.lane === lane);
  const list = $('#list');
  if (!shown.length) {
    list.replaceChildren(h('div', { class: 'empty', html: `<div class="tile">${icon('check')}</div><b>All clear</b>Nothing needs you right now.` }));
  } else {
    // Only play the entry animation when the set of tasks changes, not on every refresh.
    const key = shown.map((t) => t.id).join();
    list.classList.toggle('still', key === lastKey);
    lastKey = key;
    list.replaceChildren(...shown.map((t, i) => card(t, i)));
  }
  drawBadge(counts.open);
}

function chipEl(key, label, n) {
  const dot = key === 'all' ? '' : `<span class="dot" style="background:${laneColor(key)}"></span>`;
  return h('button', {
    class: 'chip' + (lane === key ? ' on' : ''),
    html: `${dot}${label} <em>${n}</em>`,
    onclick: () => { lane = key; localStorage.setItem('lane', key); render(); },
  });
}

function card(t, i) {
  let right = '';
  if (t.chatLive) right = '<span class="live" title="Chat open"></span>';
  else if (t.planStatus === 'drafting' || t.planStatus === 'queued') right = `<span class="drafting" title="Claude is drafting the plan">${icon('sparkle')}</span>`;
  else if (t.ticked && t.steps) right = ring(t.ticked, t.steps);
  const quick = t.minutes && t.minutes <= 10 ? `<span class="quick" title="Quick win">${icon('bolt')}</span>` : '';
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
          <span class="lane"><span class="dot" style="background:${laneColor(t.lane)}"></span><span class="nm">${laneName(t.lane)}</span></span>
          <span class="sep">·</span><span>${fmtMin(t.minutes)}</span>${quick}
        </div>
      </div>
      <div class="right">${right}</div>`,
  });
  el.querySelector('.ttl').textContent = t.title;
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

desk.onTasks((p) => { data = p; updatedAt = Date.now(); render(); tickUpdated(); });
desk.listTasks().then((p) => { data = p; render(); tickUpdated(); });
