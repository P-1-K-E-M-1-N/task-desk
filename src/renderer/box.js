/* global esc, safeColor */ // from ui.js
const $ = (s) => document.querySelector(s);
let data = null;
let lane = 'all'; // the chip filter: a lane inside one project, or a project in "All projects"
let updatedAt = Date.now();
let lastKey = '';
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

// ---------- project switcher ----------
$('#pchev').innerHTML = icon('chevDown');
$('#switch').onclick = (e) => {
  e.stopPropagation();
  if (data && data.collapsed) desk.collapse(false);
  projectMenu($('#switch'));
};
const many = () => data && data.projects.length > 1;
const viewName = () => {
  if (!data) return 'Task Desk';
  if (data.view === 'all') return many() ? 'All projects' : (data.projects[0] || {}).name || 'Task Desk';
  return (data.projects.find((p) => p.id === data.view) || {}).name || 'Task Desk';
};
const userProject = () => (data && data.view !== 'all' && data.view !== 'factory' ? data.projects.find((p) => p.id === data.view) : null);

function projectMenu(anchor) {
  const m = h('div', { class: 'popmenu projects' });
  const row = (on, dot, name, count, run, extra = '') =>
    h('button', {
      class: on ? 'on' : '',
      onclick: () => {
        m.remove();
        run();
      },
      html: `${dot}<span class="nm"></span>${extra}<span class="cnt">${esc(count)}</span>`,
    });
  const set = (v) => {
    desk.setView(v);
    lane = 'all';
  };
  const all = row(data.view === 'all', icon('check'), 'All projects', data.totalOpen, () => set('all'));
  all.querySelector('.nm').textContent = 'All projects';
  const items = data.projects.map((p) => {
    const b = row(
      data.view === p.id,
      `<span class="dot" style="background:${safeColor(p.color)}"></span>`,
      p.name,
      p.open,
      () => set(p.id),
      p.missing ? '<span class="warnico" title="Folder not found on this computer">!</span>' : ''
    );
    b.querySelector('.nm').textContent = p.name;
    return b;
  });
  const up = userProject();
  m.append(
    h('div', { class: 'head' }, 'Projects'),
    all,
    ...items,
    h('hr'),
    h('button', {
      onclick: () => {
        m.remove();
        desk.editProject(null);
      },
      html: `${icon('plus')}<span class="nm">Add a project…</span>`,
    }),
    up
      ? h('button', {
          onclick: () => {
            m.remove();
            desk.editProject(up.id);
          },
          html: `${icon('more')}<span class="nm">Edit this project…</span>`,
        })
      : null
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
  if (!id) {
    toast("Couldn't add that");
    return;
  }
  $('#qtext').value = '';
  store.set('qdraft:' + data.view, '');
  toast('Added. Claude is drafting a plan for it.');
};

$('#menu').innerHTML = icon('more');
$('#hide').innerHTML = icon('x');
$('#hide').onclick = () => desk.hide();
$('#menu').onclick = () => desk.menu();
$('#look').innerHTML = icon('palette');
$('#look').onclick = (e) => {
  e.stopPropagation();
  if (data && data.collapsed) desk.collapse(false);
  lookPanel($('#look'));
};
desk.onLookOpen(() => {
  if (data && data.collapsed) desk.collapse(false);
  setTimeout(() => lookPanel($('#look')), 250);
});
$('#collapse').onclick = () => desk.collapse(!data.collapsed);

function greeting() {
  const hr = new Date().getHours();
  const name = data && data.me && data.me.name ? `, ${data.me.name}` : '';
  return (hr < 5 ? 'Late night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + name;
}

function ring(done, total) {
  const C = 2 * Math.PI * 9;
  return `<svg class="ring" viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9"/><circle class="fg" cx="12" cy="12" r="9" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - done / total)}"/></svg>`;
}

function render() {
  if (!data) return;
  const { tasks, counts } = data;
  if (data.view !== render.view) {
    lane = 'all';
    render.view = data.view;
  }
  document.body.classList.toggle('bar-mode', !!data.collapsed);
  document.body.classList.toggle('unlocked', !data.locked);
  $('#lockbtn').innerHTML = icon(data.locked ? 'lock' : 'unlock');
  $('#lockbtn').title = data.locked
    ? 'Size is locked. Click to unlock and stretch the box.'
    : 'Size is unlocked. Drag the corner to stretch the box, or click to lock it.';
  $('#collapse').innerHTML = icon(data.collapsed ? 'chevDown' : 'chevUp');
  $('#mode').hidden = data.mode !== 'test' || !data.factory; // test mode is the workspace's sample copy
  $('#hello').textContent = greeting();
  $('#count').textContent = `${counts.open} task${counts.open === 1 ? '' : 's'}`;
  $('#mins').textContent = counts.open ? `· ~${fmtMin(counts.minutes)}` : '';
  $('#barsum').innerHTML = `${esc(counts.open)} tasks<em>~${esc(fmtMin(counts.minutes))}</em>`;
  drawGoal();

  // Header: which project, a warning if its folder is missing, and quick add for your own projects.
  $('#pname').textContent = viewName();
  const up = userProject();
  const ws = data.view === 'factory' && data.projects.find((p) => p.id === 'factory');
  $('#warn').hidden = !((up && up.missing) || (ws && ws.missing));
  if (up && up.missing) {
    $('#warn').innerHTML = "This project's folder isn't on this computer. <button>Fix the folder</button>";
    $('#warn').querySelector('button').onclick = () => desk.editProject(up.id);
  } else if (ws && ws.missing) {
    $('#warn').innerHTML = "This workspace's folder isn't on this computer. <button>Pick its folder</button>";
    $('#warn').querySelector('button').onclick = () => desk.pickWorkspaceFolder();
  }
  $('#quickadd').hidden = !up;
  // The project's main chat: your own Claude Code session that writes its tasks.
  const mainFor = up ? up.name : data.view === 'factory' && data.factory ? data.factory.name : '';
  $('#mainchat').hidden = !mainFor;
  $('#mainchat').title = mainFor ? `Open ${mainFor}'s main chat (your own Claude Code session that writes its tasks)` : '';
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
  chips.hidden = !data.projects.length; // a new desk has nothing to filter yet
  const order = byProject
    ? data.projects.map((p) => p.id).filter((id) => groups[id])
    : Object.keys(groups).sort((a, b) => (a === 'factory') - (b === 'factory') || a.localeCompare(b));
  chips.replaceChildren(
    chipEl('all', 'All', tasks.length),
    ...order.map((k) => {
      const p = byProject && data.projects.find((x) => x.id === k);
      return chipEl(k, p ? p.name : laneName(k), groups[k], p ? p.color : laneColor(k), !!p);
    })
  );

  const shown = tasks.filter((t) => lane === 'all' || keyOf(t) === lane);
  const list = $('#list');
  if (!data.projects.length) {
    // A new desk: nothing to read yet.
    list.replaceChildren(
      h(
        'div',
        { class: 'empty welcome' },
        h('div', { class: 'tile', html: icon('sparkle') }),
        h('b', {}, 'Welcome to Task Desk'),
        'Add a project: a folder with a to-do list (any - [ ] checklist), or just a list you type here. Every task gets a plan and an AI chat.',
        h('button', {
          class: 'btn primary',
          onclick: () => desk.editProject(null),
          html: `${icon('plus')}<span>Add your first project</span>`,
        })
      )
    );
  } else if (!shown.length) {
    const hint = up
      ? up.kind === 'file'
        ? 'Nothing open in its checklist. Type a task above to add one.'
        : 'Type a task above to add one.'
      : 'Nothing needs you right now.';
    list.replaceChildren(h('div', { class: 'empty', html: `<div class="tile">${icon('check')}</div><b>All clear</b>${hint}` }));
  } else {
    // Only play the entry animation when the set of tasks changes, not on every refresh.
    const key = shown.map((t) => t.id).join();
    list.classList.toggle('still', key === lastKey);
    lastKey = key;
    list.replaceChildren(...shown.map((t, i) => card(t, i)));
  }
  drawBadge(data.totalOpen);
  drawAIPick();
  if (data.me && !data.me.asked && !render.askedOnce) {
    render.askedOnce = true;
    askName();
  }
}

function chipEl(key, label, n, color, plain) {
  const dot = key === 'all' ? '' : `<span class="dot" style="background:${safeColor(color)}"></span>`;
  const b = h('button', {
    class: 'chip' + (lane === key ? ' on' : ''),
    html: `${dot}<span class="cl"></span> <em>${esc(n)}</em>`,
    onclick: () => {
      lane = key;
      render();
    },
  });
  b.querySelector('.cl').textContent = label;
  if (plain) b.style.textTransform = 'none';
  return b;
}

function card(t, i) {
  let right = '';
  if (t.chatLive) right = '<span class="live" title="Chat open"></span>';
  else if (t.planStatus === 'drafting' || t.planStatus === 'queued')
    right = `<span class="drafting" title="Claude is drafting the plan">${icon('sparkle')}</span>`;
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
      <div class="${esc(tileClass(t.type))}" title="${esc(typeHint(t.type))}">${icon(t.type)}</div>
      <div class="body">
        <div class="ttl"></div>
        <div class="meta">
          <span class="lane"${showProject ? ' style="text-transform:none"' : ''}><span class="dot" style="background:${safeColor(tag.color)}"></span><span class="nm"></span></span>
          <span class="sep">·</span><span>${esc(fmtMin(t.minutes))}</span>${quick}${t.updatedAfter ? `<span class="upd">${icon('refresh')}Updated</span>` : ''}${t.waitsOn ? `<span class="waits">${icon('lock')}after ${t.waitsOn.titles.length === 1 ? '1 task' : `${t.waitsOn.titles.length} tasks`}</span>` : ''}${ownModel(t) ? `<span class="ownmodel">${esc(ownModel(t))}</span>` : ''}
        </div>
      </div>
      <div class="right">${right}</div>`,
  });
  el.querySelector('.ttl').textContent = t.title;
  el.querySelector('.lane .nm').textContent = tag.name;
  if (t.updatedAfter) el.querySelector('.upd').title = `Updated after you finished "${t.updatedAfter.title}": ${t.updatedAfter.why}`;
  if (t.waitsOn)
    el.querySelector('.waits').title =
      `Do this after: ${t.waitsOn.titles.map((x) => `"${x}"`).join(', ')}.${t.waitsOn.why ? ` ${t.waitsOn.why}` : ''}`;
  if (ownModel(t)) el.querySelector('.ownmodel').title = "This task's own Claude model and effort";
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    taskMenu(t, e);
  });
  return el;
}

// Tray icon with the open-task count drawn on it.
const badgeImg = new Image();
badgeImg.src = '../../assets/icon.png';
let lastBadge = null;
function drawBadge(n) {
  if (!badgeImg.complete) {
    badgeImg.onload = () => drawBadge(n);
    return;
  }
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

// ---------- copy instructions for another AI chat ----------
// Ready-to-paste text that tells another Claude Code (or Codex, Gemini…) chat
// how to work with Task Desk: where to put the tasks it needs you to do, and
// where your Done notes come back. Filled in for the project on show.
const FORM =
  '1 Name · 2 Folder · 3 Where its tasks come from · 4 When I press Done, my notes go to · 5 The chat (may it change files?) · 6 Anything the AI should know (optional) · 7 Color · 8 Look (optional) · 9 Which AI (optional)';
const CHECKLIST_RULES =
  'one task per line as "- [ ] what to do", grouped under "## Section" headings. Write each task so it can be done without this chat: what to do, where (links, file paths), and what "done" looks like. Only list things I have to do myself (send, sign up, decide, pay, check). Never tick my tasks yourself: I finish them in Task Desk.';
function setupText() {
  return [
    'I use Task Desk, a desktop app, for the hands-on tasks my projects need from me. Please set this project up for it:',
    '',
    `1. Keep a checklist of everything you need me to do in TODO.md in this project's folder (create it if it's missing): ${CHECKLIST_RULES}`,
    "2. When I finish or skip a task, Task Desk adds my notes and results to TASK_RESULTS.md in this folder. Read it at the start of every session and act on the entries you haven't handled yet. Don't edit or reorder it.",
    `3. Then tell me how to add this project to Task Desk. Its "Add a project" form has numbered boxes: ${FORM}. Give me the exact text to type or option to pick for each box, by number. For 3 that's "A checklist file" (TODO.md), and for 4 it's "A file in the project folder" (TASK_RESULTS.md).`,
  ].join('\n');
}
function projectText(p) {
  const where = p.folder ? ` (folder: ${p.folder})` : '';
  const lines = [`I track the hands-on tasks for this project, "${p.name}"${where}, in Task Desk, a desktop app.`, ''];
  if (p.source === 'file' && p.tasksPath)
    lines.push(`- Tasks for me: Task Desk reads ${p.tasksPath}. When you need me to do something, add it there: ${CHECKLIST_RULES}`);
  else
    lines.push(
      "- Tasks for me: this project's tasks live inside Task Desk (no file). When you need me to do something, tell me in one line and I'll add it there."
    );
  if (p.results === 'file' && p.resultsPath)
    lines.push(
      `- My results: when I finish or skip a task, Task Desk appends my notes and anything I pasted to ${p.resultsPath}. Read it at the start of every session and act on the new entries. Don't edit or reorder it.`
    );
  else lines.push("- My results: Task Desk keeps my notes. I'll paste anything you need from them.");
  lines.push(`- If I ask how to change the project's settings in Task Desk, answer by its form's numbered boxes: ${FORM}.`);
  return lines.join('\n');
}
function workspaceText() {
  const name = (data.factory && data.factory.name) || 'the workspace';
  return `I now finish NEEDS_NICK items for ${name} in a separate app (Task Desk). Every time I mark a task DONE or SKIP, it appends a dated entry to ops/FROM_NICK.md with the lane, the task text, my notes and any results I pasted. On every daily tick, read ops/FROM_NICK.md first. For each entry you haven't handled yet, continue that lane from my notes, tick the matching box in the lane's needs_nick.md (or ops/needs_nick_global.md) so it drops off NEEDS_NICK.md, and note in the lane log which FROM_NICK entry you acted on. Don't edit or reorder FROM_NICK.md itself: it's append-only and the app writes to it.`;
}
$('#mainchat').innerHTML = icon('chat');
$('#mainchat').onclick = (e) => {
  e.stopPropagation();
  if (data && data.view !== 'all') desk.openMainChat(data.view);
};
$('#copyfor').innerHTML = icon('paste');
$('#copyfor').onclick = async (e) => {
  e.stopPropagation();
  const up = userProject();
  const p = up ? await desk.getProject(up.id) : null;
  const copy = (text, what) => {
    desk.copy(text);
    toast(`Copied ${what}. Paste it into the other chat.`);
  };
  const items = [
    ...(p
      ? [
          {
            label: `How "${p.name}" works with Task Desk`,
            icon: 'copy',
            hint: 'for its AI',
            run: () => copy(projectText(p), `the "${p.name}" instructions`),
          },
        ]
      : []),
    {
      label: 'Set up a new project for Task Desk',
      icon: 'plus',
      hint: 'any AI chat',
      run: () => copy(setupText(), 'the setup instructions'),
    },
    ...(data.factory
      ? [
          {
            label: `${data.factory.name}: read my results`,
            icon: 'copy',
            hint: 'workspace',
            run: () => copy(workspaceText(), 'the workspace note'),
          },
        ]
      : []),
  ];
  popMenu($('#copyfor'), items, {
    head: 'Copy for another AI chat',
    notes: ['Paste it into Claude Code, Codex or any AI chat so it puts your tasks where Task Desk reads them.'],
  });
};

// ---------- your name ----------
// Asked once on a new desk (and from "Your name…" in the menu). The AI calls
// you by it, and "only lines that mention me" looks for it. Skipping is fine.
function askName() {
  if ($('#me')) return;
  const cur = (data && data.me) || {};
  const name = h('input', { class: 'box', id: 'meName', maxlength: 40, placeholder: 'Your first name', value: cur.name || '' });
  const about = h('input', {
    class: 'box',
    id: 'meAbout',
    maxlength: 200,
    placeholder: 'Optional: a line about you, e.g. "a solo builder who doesn\'t write code"',
    value: cur.about || '',
  });
  const done = async (save) => {
    const r = await desk.setMe(save ? { name: name.value, about: about.value } : { name: cur.name || '', about: cur.about || '' });
    $('#me').remove();
    if (save) toast(r.name ? `Hi, ${r.name}.` : 'Saved.');
  };
  const card = h(
    'form',
    {
      class: 'mecard',
      id: 'me',
      onsubmit: (e) => {
        e.preventDefault();
        done(true);
      },
    },
    h('b', {}, 'What should Task Desk call you?'),
    h('span', { class: 'hint' }, 'The AI uses it, and it lets a project show only the lines that mention you.'),
    name,
    about,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, cur.asked ? 'Cancel' : 'Skip'),
      h('button', { class: 'btn primary', type: 'submit' }, 'Save')
    )
  );
  $('#warn').after(card);
  setTimeout(() => name.focus(), 50);
}
desk.onAskMe(() => {
  if (data && data.collapsed) desk.collapse(false);
  askName();
});

// ---------- default AI ----------
// The footer pill shows the AI new task chats start with; click it to change.
// A task can still switch AI in its own chat panel, and a project can have its own (box 9).
function drawAIPick() {
  const a = data && data.ai;
  if (!a) return;
  const cur = a.list.find((x) => x.id === a.desk) || a.list[0];
  const own = data.models && data.models.own;
  const extra =
    own && (own.model || own.effort)
      ? ` · ${[optName(data.models.list, own.model), optName(data.models.efforts, own.effort)].filter(Boolean).join(' ')}`
      : '';
  $('#aipick').innerHTML = `${icon('sparkle')}<span></span><span class="chev">▾</span>`;
  $('#aipick span').textContent = cur.name + extra;
  document.body.classList.toggle('narrow', innerWidth < 360);
}
$('#aipick').onclick = (e) => {
  e.stopPropagation();
  const a = data.ai;
  const proj = a.project && data.projects.find((p) => p.id === data.view);
  const items = a.list.map((x) => ({
    label: `${x.name} (${x.app})`,
    icon: x.id === a.desk ? 'check' : 'sparkle',
    hint: x.installed ? '' : 'not installed',
    run: async () => {
      data.ai = { ...(await desk.setDefaultAI(x.id)), project: a.project };
      drawAIPick();
      toast(`New task chats use ${x.name}.`);
    },
  }));
  const M = data.models;
  items.push({
    label: `Claude model and effort${M.scope === 'desk' ? '' : ` for ${viewName()}`}…`,
    icon: 'bolt',
    hint: [optName(M.list, M.own.model), optName(M.efforts, M.own.effort)].filter(Boolean).join(' · '),
    run: () => scopeModelPanel(),
  });
  popMenu($('#aipick'), items, {
    head: 'Default AI for task chats',
    notes: [
      proj && `${proj.name} uses its own: ${(a.list.find((x) => x.id === a.project) || {}).name} (Edit project, box 9).`,
      'You can also switch AI inside any task.',
    ],
  });
};

// ---------- the goal line ----------
// Inside a project, the bar is a rough guess at how far the whole project is
// toward its end goal (the AI's, once it has looked; until then, the share of
// tasks done). In "All projects" it counts the tasks done.
function drawGoal() {
  const { counts, goal } = data;
  const meter = $('#meter');
  meter.classList.toggle('goal', !!(goal && goal.from === 'ai'));
  $('#goaltxt').hidden = !(goal && goal.goal);
  if (!goal || goal.from !== 'ai') {
    const total = counts.open + counts.done;
    $('#prog').style.width = total ? `${(counts.done / total) * 100}%` : '0';
    $('#progtxt').textContent = counts.done ? `${counts.done} done` : 'none done yet';
    meter.title = !goal
      ? ''
      : data.ordering
        ? "For now, the share of tasks done. The AI's rough guess at the whole project shows here once it has looked."
        : 'The share of tasks done. Turn on "Put my tasks in order (AI)" in the ⋯ menu for a guess at the whole project.';
    return;
  }
  $('#prog').style.width = `${goal.percent}%`;
  $('#progtxt').textContent = `~${goal.percent}% to the goal`;
  $('#goaltxt').textContent = `Goal: ${goal.goal}`;
  meter.title = `A rough guess by the AI, counting its work and yours.${goal.why ? ` ${goal.why}` : ''}${goal.stale ? ' It will look again after the latest changes.' : ''}`;
}

// ---------- right-click a task ----------
const optName = (list, v) => (list.find(([x]) => x === v) || [])[1] || '';
// "Opus · High" when the task has its own Claude model or effort (and per task is on).
function ownModel(t) {
  const M = data.models;
  if (!M || !M.perTask || !t.claude) return '';
  return [optName(M.list, t.claude.own.model), optName(M.efforts, t.claude.own.effort)].filter(Boolean).join(' · ');
}

function taskMenu(t, e) {
  const at = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
  const M = data.models;
  const items = [
    { label: 'Open', icon: 'send', run: () => desk.openTask(t.id) },
    ...(t.claude
      ? [
          {
            label: M.perTask ? 'Claude model and effort…' : 'Pick a Claude model for this task…',
            icon: 'bolt',
            hint: M.perTask ? ownModel(t) || 'usual' : 'turns on per task',
            run: async () => {
              if (!M.perTask) {
                await desk.setPerTaskModel(true);
                toast('Tasks can have their own model now. Turn it off from the AI button below.');
              }
              taskModelPanel(t, at);
            },
          },
        ]
      : []),
    {
      label: 'Snooze until tomorrow',
      icon: 'moon',
      run: async () => {
        await desk.snooze(t.id, 'day');
        toast('Snoozed until tomorrow morning.');
      },
    },
    {
      label: 'Snooze until a day…',
      icon: 'calendar',
      run: () =>
        pickDay(at, async (day) => {
          const until = await desk.snooze(t.id, day);
          toast(
            until
              ? `Snoozed until ${new Date(until).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.`
              : 'Pick a day from tomorrow on, up to a year away.'
          );
        }),
    },
    {
      label: 'Redraft its plan',
      icon: 'refresh',
      run: () => {
        desk.replan(t.id);
        toast('Drafting a new plan.');
      },
    },
    {
      label: 'Copy the task text',
      icon: 'copy',
      run: () => {
        desk.copy(t.text);
        toast('Copied.');
      },
    },
  ];
  const notes = t.waitsOn
    ? [`Do this after: ${t.waitsOn.titles.map((x) => `"${x}"`).join(', ')}.${t.waitsOn.why ? ` ${t.waitsOn.why}` : ''}`]
    : [];
  const m = popMenu(at, items, { notes });
  m.style.left = Math.max(8, Math.min(e.clientX, innerWidth - m.offsetWidth - 8)) + 'px';
}

// ---------- Claude's model and effort ----------
// One panel for the desk, a project, or one task: a row of models and a row of
// effort levels, each starting with "Usual" (what it falls back to).
function modelPanel(anchor, { title, scope, own, base, perTaskBox, notes }) {
  const M = data.models;
  let cur = { ...own };
  const m = h('div', { class: 'popmenu lookpanel modelpanel' });
  const stop = (e) => e.stopPropagation();
  const seg = (key, list) => {
    const usual = optName(list, base[key]);
    return h(
      'div',
      { class: 'seg wrap' },
      [['', usual ? `Usual (${usual})` : 'Usual'], ...list].map(([v, name]) =>
        h(
          'button',
          {
            class: (cur[key] || '') === v ? 'on' : '',
            onclick: async (e) => {
              stop(e);
              cur = (await desk.setModel(scope, { [key]: v })) || cur;
              draw();
            },
          },
          name
        )
      )
    );
  };
  const draw = () =>
    m.replaceChildren(
      h(
        'div',
        { class: 'lphead' },
        h('b', {}, title),
        h('button', {
          class: 'lpclose',
          title: 'Close (Esc)',
          html: icon('x'),
          onclick: (e) => {
            stop(e);
            m.remove();
          },
        })
      ),
      h('h4', {}, 'Model'),
      seg('model', M.list),
      h('h4', {}, 'Effort'),
      seg('effort', M.efforts),
      perTaskBox
        ? h(
            'label',
            { class: 'newown', onclick: stop },
            h('input', {
              type: 'checkbox',
              checked: !!M.perTask,
              onchange: async (e) => {
                await desk.setPerTaskModel(e.target.checked);
                toast(e.target.checked ? 'Right-click a task to give it its own model.' : "Every task uses its project's choice again.");
              },
            }),
            h('span', {}, 'Let a task have its own (right-click it)')
          )
        : null,
      ...notes.filter(Boolean).map((n) => h('div', { class: 'popnote' }, n))
    );
  draw();
  placePopup(anchor, m);
}

const PLAN_NOTE =
  'Bigger models and higher effort use more of your Claude plan. An open chat keeps its model until you close the task and open it again.';

// From the AI button: the desk's choice in "All projects", else the project's.
function scopeModelPanel() {
  const M = data.models;
  const forDesk = M.scope === 'desk';
  const other = data.ai.project && data.ai.project !== 'claude';
  modelPanel($('#aipick'), {
    title: forDesk ? 'Claude for every project' : `Claude for ${viewName()}`,
    scope: M.scope,
    own: M.own,
    base: forDesk ? {} : M.desk,
    perTaskBox: true,
    notes: [
      forDesk ? "Used by every project that doesn't pick its own." : 'Used by every task in this project, unless a task has its own.',
      other && "This project's chats use another AI, so this applies only to a task you switch to Claude.",
      PLAN_NOTE,
    ],
  });
}

function taskModelPanel(t, anchor) {
  modelPanel(anchor, {
    title: 'Claude for this task',
    scope: `task:${t.id}`,
    own: t.claude.own,
    base: t.claude.base,
    perTaskBox: false,
    notes: [`"Usual" is what ${t.projectName || 'its project'} uses.`, PLAN_NOTE],
  });
}

// ---------- size lock ----------
// Resting the mouse in the bottom-right corner for 3 seconds shows the lock.
// Unlocked, a grip appears next to it: drag it to make the box wider or taller.
{
  const corner = $('#corner');
  let arm = null,
    hideT = null;
  // The corner lets clicks through to the footer (the AI button sits there), so
  // the hover is worked out from the mouse position instead of the element.
  let over = false;
  const enter = () => {
    clearTimeout(hideT);
    if (corner.classList.contains('show')) return;
    corner.classList.add('arming');
    arm = setTimeout(() => {
      corner.classList.remove('arming');
      corner.classList.add('show');
    }, 3000);
  };
  const leave = () => {
    clearTimeout(arm);
    corner.classList.remove('arming');
    hideT = setTimeout(() => corner.classList.remove('show'), Math.max(1500, keepUntil - Date.now()));
  };
  document.addEventListener('mousemove', (e) => {
    const r = corner.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientY >= r.top;
    if (inside !== over) {
      over = inside;
      (inside ? enter : leave)();
    }
  });
  document.documentElement.addEventListener('mouseleave', () => {
    if (over) {
      over = false;
      leave();
    }
  });
  // Over remote desktop the hover may not register, so three quick right-clicks
  // near either bottom corner show the lock too, and keep it up for 8 seconds.
  // The corner zone reaches the window's very edge (past the frame).
  const nearCorner = (e) => e.clientY > innerHeight - 90 && (e.clientX > innerWidth - 120 || e.clientX < 120);
  let rights = [],
    keepUntil = 0;
  document.addEventListener('contextmenu', (e) => {
    if (!nearCorner(e) || document.body.classList.contains('bar-mode')) return;
    e.preventDefault();
    const now = Date.now();
    rights = rights.filter((t) => now - t < 1500).concat(now);
    if (rights.length < 3) return;
    rights = [];
    clearTimeout(arm);
    clearTimeout(hideT);
    keepUntil = now + 8000;
    corner.classList.remove('arming');
    corner.classList.add('show');
    hideT = setTimeout(() => {
      if (!over) corner.classList.remove('show');
    }, 8000);
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
    const move = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          desk.resizeBox('move');
        });
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('lostpointercapture', up);
      cancelAnimationFrame(raf);
      raf = 0;
      desk.resizeBox('end');
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('lostpointercapture', up);
  });
}

desk.onTasks((p) => {
  data = p;
  updatedAt = Date.now();
  render();
  tickUpdated();
});
desk.listTasks().then((p) => {
  data = p;
  render();
  tickUpdated();
});
