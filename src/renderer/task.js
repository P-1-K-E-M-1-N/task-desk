/* global esc, safeColor */ // from ui.js
const $ = (s) => document.querySelector(s);
const ID = new URLSearchParams(location.search).get('id');
let T = null; // task
let P = null; // plan
let ST = null; // saved state for this task
let chatStarted = false;

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
saveStatus();
$('#avatar').innerHTML = icon('sparkle');
$('#bdone').innerHTML = `${icon('check')}<span>Done</span>`;
$('#bnext').innerHTML = `<span>Done &amp; next</span>${icon('send')}`;
$('#bskip').innerHTML = `${icon('skip')}<span>Skip</span>`;
$('#bsnooze').innerHTML = `${icon('moon')}<span>Snooze</span>${icon('chevDown')}`;
$('#cclear').innerHTML = `${icon('eraser')}<span>Clear</span>`;
$('#cfresh').innerHTML = `${icon('plus')}<span>Fresh chat</span>`;
$('#cmore').innerHTML = icon('more');

const rich = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const base = (p) => String(p).split(/[\\/]/).filter(Boolean).pop();
const isFactory = () => !T || T.project === 'factory';
let RESULTS_TO = 'factory';

// ---------- data ----------
async function load() {
  const r = await desk.getTask(ID);
  if (!r) {
    $('#scroll').innerHTML =
      '<div class="warn">This task is no longer on its list (it may have been finished or removed). You can close this window.</div>';
    return;
  }
  T = r.task;
  P = r.plan;
  ST = r.st;
  RESULTS_TO = r.resultsTo;
  document.title = T.title;
  $('#aiName').textContent = T.aiName || 'Claude Code';
  showChrome(T.chrome, T.chromeLocked);
  $('#cchrome').hidden = !/claude/i.test(T.aiName || 'Claude Code');
  $('#ttile').className = tileClass(T.type);
  $('#ttile').title = typeHint(T.type);
  $('#ttile').innerHTML = icon(T.type);
  $('#tname').textContent = `${isFactory() ? laneName(T.lane) : T.projectName}  ·  ${T.title}`;
  if (isFactory()) {
    $('#notesHead').textContent = `Notes for ${T.projectName}`;
    $('#notes').placeholder = `Notes and results for ${T.projectName}: what you did, replies you got, anything it should know…`;
  } else {
    $('#notesHead').textContent = 'Notes and results';
    $('#notes').placeholder =
      RESULTS_TO === 'file'
        ? 'What you did, replies you got, anything the project should know… (goes to its results file when you press Done)'
        : 'What you did, replies you got, anything worth keeping… (kept in Task Desk when you press Done)';
  }
  if (document.activeElement !== $('#notes')) {
    $('#notes').value = ST.notes || '';
    if (ST.notes) notesSaved.markSaved();
  }
  renderPlan(r.planOk);
  // 'attach' reconnects to a chat that is still running (the window was refreshed by an update).
  if (!chatStarted && (P || T.planStatus === 'ready' || T.chatLive)) startChat('attach');
}

function renderPlan(planOk) {
  const s = $('#scroll');
  const top = s.scrollTop;
  s.replaceChildren();
  const eyebrow = h(
    'div',
    { class: 'eyebrow' },
    h('span', {
      class: 'pill',
      title: typeHint(T.type),
      html: `${icon(T.type)}${esc(TYPE_LABEL[T.type] || T.type)}`,
      style: `color:var(--t-${String(T.type).replace(/[^\w-]/g, '')})`,
    }),
    isFactory()
      ? null
      : h('span', {
          class: 'pill',
          html: `<span class="dot" style="background:${safeColor(T.projectColor)}"></span>${esc(T.projectName)}`,
        }),
    isFactory() || T.lane !== 'general'
      ? h('span', { class: 'pill lane', html: `<span class="dot" style="background:${laneColor(T.lane)}"></span>${esc(laneName(T.lane))}` })
      : null,
    h('span', { class: 'pill', html: `${icon('clock')}~${esc(fmtMin(T.minutes))}` }),
    T.date ? h('span', { class: 'pill' }, T.date) : null
  );
  s.append(eyebrow, h('h1', {}, T.title));

  if (!P) {
    s.append(
      h('p', { class: 'summary', html: rich(T.text) }),
      h('div', {
        class: 'drafting-note',
        html: `${icon('sparkle')}Claude is reading the ${isFactory() ? 'lane' : 'project'} and drafting your plan. About 30 seconds.`,
      }),
      h(
        'div',
        { class: 'skel' },
        [0, 1, 2, 3].map(() => h('div', { class: 'shimmer' }))
      ),
      h(
        'div',
        { class: 'sect' },
        h('button', { class: 'link', html: `${icon('chat')}Start the chat now without a plan`, onclick: () => startChat('auto') })
      )
    );
    return;
  }

  if (planOk === false)
    s.append(
      h(
        'div',
        { class: 'warn' },
        "Claude couldn't build a plan for this one, so here's the raw task. Ask in the chat, or try regenerating."
      )
    );
  s.append(h('p', { class: 'summary', html: rich(P.summary) }));
  if (T.updatedAfter)
    s.append(
      h(
        'div',
        { class: 'updated' },
        h('span', { html: icon('refresh') }),
        h('span', {}, `Updated after you finished "${T.updatedAfter.title}": ${T.updatedAfter.why}`)
      )
    );

  const done = P.steps.filter((_, i) => ST.ticks['s' + i]).length;
  s.append(
    h('div', {
      class: 'progress',
      html: `<div class="bar"><i style="width:${(done / P.steps.length) * 100}%"></i></div><span>${done} of ${P.steps.length} steps</span>`,
    })
  );

  s.append(
    h(
      'div',
      { class: 'sect' },
      'The plan',
      h('span', { class: 'sp' }),
      h('button', {
        class: 'link',
        html: `${icon('refresh')}Regenerate`,
        onclick: async () => {
          await desk.replan(ID);
          P = null;
          renderPlan();
        },
      })
    )
  );
  const list = h('div', { class: 'steps' });
  P.steps.forEach((step, i) => list.append(stepEl(step, i)));
  s.append(list);

  const extra = isFactory() ? (T.lane !== 'factory' ? `${T.laneDir}\\LANE.md` : null) : T.sourceFile;
  const files = [...new Set([...(P.files || []), extra].filter(Boolean))];
  if (files.length) {
    s.append(h('div', { class: 'sect' }, 'Files'));
    s.append(
      h(
        'div',
        { class: 'files' },
        files.map((f) =>
          actBtn(base(f), /\.\w+$/.test(f) ? 'file' : 'folder', () => (/\.\w+$/.test(f) ? desk.openFile(f) : desk.openFolder(f)), {
            done: 'Opened',
          })
        )
      )
    );
  }
  s.append(h('details', { class: 'raw' }, h('summary', {}, 'Original task text'), h('p', { html: rich(T.rawText) })));
  s.scrollTop = top;
}

function stepEl(step, i) {
  const key = 's' + i;
  const el = h('div', { class: 'step' + (ST.ticks[key] ? ' done' : ''), style: `animation-delay:${i * 35}ms`, 'data-key': key });
  const check = h('button', { class: 'check', title: 'Mark this step done', html: icon('check') });
  check.onclick = async () => {
    ST.ticks[key] = !ST.ticks[key];
    el.classList.toggle('done', ST.ticks[key]);
    await desk.tick(ID, key, ST.ticks[key]);
    updateProgress();
    checkAllDone();
  };
  const body = h(
    'div',
    {},
    h('div', { class: 'stext', html: `<span class="num">${i + 1}</span>${rich(step.text)}` }),
    commentEl(key),
    actions(step, i)
  );
  const ask = h('button', { class: 'iconbtn ask', title: 'Send this step to the chat', html: icon('chat') });
  ask.onclick = () => sendToChat(`About step ${i + 1} of my plan: "${step.text}" How do I do this? Keep it short.`);
  el.append(check, body, ask);
  return el;
}

function updateProgress() {
  if (!P || !$('.progress')) return;
  const d = P.steps.filter((_, j) => ST.ticks['s' + j]).length;
  $('.progress .bar i').style.width = `${(d / P.steps.length) * 100}%`;
  $('.progress span').textContent = `${d} of ${P.steps.length} steps`;
}

// ---------- all steps ticked: finish and move on ----------
// Ticking the last step (you or the chat) starts a short countdown to
// "Done & next". "Not yet" stops it until a step is unticked and ticked again;
// typing anywhere pauses it.
const COUNTDOWN = 5;
let finishing = false;
let notYet = false;
let countdown = null;
const allTicked = () => !!(P && P.steps.length && P.steps.every((_, i) => ST.ticks['s' + i]));

function checkAllDone() {
  if (!allTicked()) {
    notYet = false;
    stopCountdown();
    return;
  }
  if (!finishing && !notYet && !countdown) startCountdown();
}
function startCountdown() {
  let left = COUNTDOWN;
  const bar = $('#alldone');
  const msg = h('span', { class: 'msg' });
  const say = () => (msg.textContent = `All steps done. Finishing and moving to the next task in ${left}…`);
  say();
  bar.style.setProperty('--secs', COUNTDOWN + 's');
  bar.replaceChildren(
    msg,
    h('span', { class: 'bar' }, h('i')),
    h('button', { class: 'btn sm', onclick: () => ((notYet = true), stopCountdown()) }, 'Not yet'),
    h('button', { class: 'btn sm primary', html: `<span>Done &amp; next</span>${icon('send')}`, onclick: () => finish('done', true) })
  );
  bar.hidden = false;
  countdown = setInterval(() => {
    left -= 1;
    if (left > 0) return say();
    stopCountdown(true);
    finish('done', true);
  }, 1000);
}
function stopCountdown(keepBar) {
  clearInterval(countdown);
  countdown = null;
  if (!keepBar) $('#alldone').hidden = true;
}
// Typing pauses the countdown: the bar stays with its two buttons.
window.addEventListener(
  'keydown',
  () => {
    if (!countdown) return;
    stopCountdown(true);
    notYet = true;
    $('#alldone .msg').textContent = 'All steps done.';
    $('#alldone .bar')?.remove();
  },
  true
);

// "Did you finish it?" when you close a task you started (sent by the app).
desk.onAskFinish(({ ticked, steps }) => {
  if ($('.askfinish')) return;
  const close = () => ask.remove();
  const ask = h(
    'div',
    { class: 'askfinish' },
    h(
      'div',
      { class: 'card' },
      h('h2', {}, 'Did you finish it?'),
      h('p', {}, `You ticked ${ticked} of ${steps} steps on "${T ? T.title : 'this task'}" but didn't press Done.`),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn primary', html: `${icon('check')}<span>Done</span>`, onclick: () => (close(), finish('done', false)) }),
        h('button', { class: 'btn', html: `<span>Done &amp; next</span>${icon('send')}`, onclick: () => (close(), finish('done', true)) }),
        h('span', { class: 'sp', style: 'flex:1' }),
        h('button', { class: 'btn ghost', onclick: () => (close(), desk.closeAnyway(ID)) }, 'Close anyway'),
        h('button', { class: 'btn ghost', onclick: close }, 'Keep working')
      )
    )
  );
  document.body.append(ask);
});

// Comment Claude left on a step (through the chat's taskdesk tools).
function commentEl(key) {
  const text = (ST.stepNotes || {})[key];
  return h(
    'div',
    { class: 'scomment', hidden: !text },
    h('span', { class: 'who', html: `${icon('sparkle')}Claude` }),
    h('span', { class: 'ctext' }, text || '')
  );
}

// The chat updated this task: tick/untick a step, comment on it, or add to the notes.
desk.onTaskChanged((id, ch) => {
  if (id !== ID || !ST) return;
  if (ch.kind === 'step') {
    const el = document.querySelector(`.step[data-key="${ch.key}"]`);
    const n = Number(ch.key.slice(1)) + 1;
    if (typeof ch.done === 'boolean') {
      ST.ticks[ch.key] = ch.done;
      if (el) el.classList.toggle('done', ch.done);
    }
    if (typeof ch.comment === 'string') {
      ST.stepNotes = { ...(ST.stepNotes || {}), [ch.key]: ch.comment };
      const c = el && el.querySelector('.scomment');
      if (c) {
        c.hidden = !ch.comment;
        c.querySelector('.ctext').textContent = ch.comment;
      }
    }
    if (el) {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
    updateProgress();
    checkAllDone();
    toast(
      ch.done === true ? `Claude ticked step ${n}` : ch.done === false ? `Claude un-ticked step ${n}` : `Claude commented on step ${n}`
    );
  }
  if (ch.kind === 'note') {
    const ta = $('#notes');
    // Keep anything typed but not saved yet, then add Claude's line and save it all.
    const cur = ta.value.trimEnd();
    ta.value = cur ? (cur.includes(ch.text) ? cur : cur + String.fromCharCode(10) + ch.text) : ch.notes;
    ta.dispatchEvent(new Event('input'));
    toast('Claude added to your notes');
  }
});

// ---------- step actions ----------
function pasteBox(key, label, placeholder) {
  const saved = ST.pastes[key];
  const ta = h('textarea', { class: 'box', rows: 3, placeholder: placeholder || 'Paste here…' });
  ta.value = saved ? saved.value : '';
  const note = autosave(
    ta,
    (v) => {
      ST.pastes[key] = { label, value: v };
      return desk.paste(ID, key, label, v);
    },
    (v) => desk.saveSync(ID, 'paste', v, key, label)
  );
  return [h('div', { class: 'field-head' }, h('div', { class: 'field-label' }, label), note), ta];
}

function actions(step, i) {
  const d = step.data || {};
  const box = h('div', { class: 'sact' });
  const add = (...els) => box.append(...els.flat());
  switch (step.action) {
    case 'gmail_draft':
      add(actBtn('Open Gmail draft', 'email', () => desk.gmail(d), { done: 'Opened' }));
      if (d.body) add(actBtn('Copy message', 'copy', () => desk.copy(d.body), { done: 'Copied' }));
      break;
    case 'open_url':
      if (d.url) add(actBtn(`Open ${hostOf(d.url)}`, 'external', () => desk.openUrl(d.url), { done: 'Opened' }));
      break;
    case 'copy_text':
      if (d.text) {
        add(actBtn('Copy', 'copy', () => desk.copy(d.text), { done: 'Copied' }));
        const pv = h('div', { class: 'preview', title: 'Click to expand' }, d.text);
        pv.onclick = () => pv.classList.toggle('open');
        add(pv);
      }
      break;
    case 'open_file':
      if (d.path) add(actBtn(`Open ${base(d.path)}`, 'file', () => desk.openFile(d.path), { done: 'Opened' }));
      break;
    case 'open_folder':
      if (d.path) add(actBtn(`Open ${base(d.path)} folder`, 'folder', () => desk.openFolder(d.path), { done: 'Opened' }));
      break;
    case 'paste_box':
      add(pasteBox('p' + i, d.label || step.text.slice(0, 60)));
      break;
    case 'keyword_planner': {
      const qs = Array.isArray(d.queries) ? d.queries : [];
      if (qs.length) add(actBtn(`Copy ${qs.length} queries`, 'copy', () => desk.copy(qs.join('\n')), { done: 'Copied' }));
      add(
        actBtn('Open Keyword Planner', 'external', () => desk.openUrl('https://ads.google.com/aw/keywordplanner/home'), { done: 'Opened' })
      );
      add(pasteBox('kw' + i, 'Keyword Planner results', 'Paste the results table (or a summary of the volumes) here…'));
      break;
    }
    case 'decision': {
      const key = 'd' + i;
      const opts = h('div', { class: 'opts' });
      for (const o of d.options || []) {
        const chosen = ST.pastes[key] && ST.pastes[key].value === o;
        const b = h('button', {
          class: `btn opt${o === d.recommended ? ' rec' : ''}${chosen ? ' chosen' : ''}`,
          html: `${esc(o)}${o === d.recommended ? `<span class="rectag">${icon('star')}recommended</span>` : ''}`,
        });
        b.onclick = async () => {
          ST.pastes[key] = { label: `Decision (${step.text.slice(0, 80)})`, value: o };
          await desk.paste(ID, key, ST.pastes[key].label, o);
          opts.querySelectorAll('.opt').forEach((x) => x.classList.remove('chosen'));
          b.classList.add('chosen');
          toast(`Choice saved. It goes ${isFactory() ? `to ${T.projectName}` : 'with your notes'} when you press Done.`);
        };
        opts.append(b);
      }
      add(opts);
      break;
    }
    case 'env_key': {
      if (d.signup_url) add(actBtn('Open signup page', 'external', () => desk.openUrl(d.signup_url), { done: 'Opened' }));
      if (d.env_path && d.var_name) {
        const inp = h('input', { class: 'box', type: 'password', placeholder: `Paste ${d.var_name} here` });
        add(
          h(
            'div',
            { class: 'field-label' },
            `Goes only into ${d.env_path} as ${d.var_name}, after you confirm. The app never stores it anywhere else, so this box isn't auto-saved.`
          ),
          inp,
          actBtn(
            'Save key to .env',
            'key',
            async () => {
              if (!inp.value.trim()) return { ok: false, error: 'Paste the key first' };
              const r = await desk.writeEnv(ID, d.env_path, d.var_name, inp.value);
              if (r.ok) inp.value = '';
              return r.cancelled ? { ok: false, error: 'Not saved' } : r;
            },
            { done: 'Saved' }
          )
        );
      }
      break;
    }
    case 'email_list':
      if (d.file) add(emailList(d.file));
      break;
    case 'ask_claude':
      add(actBtn('Ask Claude', 'chat', () => sendToChat(`Help me get this task done: ${T.text}`), { done: 'Sent' }));
      break;
  }
  return box;
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return 'page';
  }
}

function emailList(file) {
  const wrap = h('div', { class: 'emails' }, h('div', { class: 'ehead' }, h('b', {}, 'Loading drafts…')));
  desk.emails(file).then((r) => {
    if (!r.emails || !r.emails.length) {
      wrap.replaceChildren(h('div', { class: 'ehead' }, h('b', {}, 'No drafts found in ' + base(file))));
      return;
    }
    const count = () => r.emails.filter((_, j) => ST.ticks['e' + j]).length;
    const label = h('b', {});
    const setLabel = () => (label.textContent = `${count()} of ${r.emails.length} sent`);
    setLabel();
    const head = h(
      'div',
      { class: 'ehead' },
      label,
      r.attachPath ? actBtn('Attachment folder', 'folder', () => desk.openFolder(r.attachPath), { done: 'Opened' }) : null,
      actBtn(base(r.file), 'file', () => desk.openFile(r.file), { done: 'Opened' })
    );
    wrap.replaceChildren(head);
    if (r.attach)
      wrap.append(
        h(
          'div',
          { class: 'erow', style: 'grid-template-columns:1fr' },
          h('span', { class: 'muted-note' }, `Attach ${base(r.attach)} to each one. Tick a row once it's sent.`)
        )
      );
    r.emails.forEach((m, j) => {
      const k = 'e' + j;
      const row = h('div', { class: 'erow' + (ST.ticks[k] ? ' done' : '') });
      const c = h('button', { class: 'check', html: icon('check'), title: 'Mark as sent' });
      c.onclick = async () => {
        ST.ticks[k] = !ST.ticks[k];
        row.classList.toggle('done', ST.ticks[k]);
        await desk.tick(ID, k, ST.ticks[k]);
        setLabel();
      };
      const [nm, ...rest] = m.name.split(' (');
      row.append(
        c,
        h(
          'div',
          { class: 'ename', title: m.name },
          nm,
          h('small', {}, rest.length ? rest.join(' (').replace(/\)$/, '') : hostOf(m.contact))
        ),
        h(
          'div',
          { class: 'ebtns' },
          m.contact ? iconAct('external', 'Open their contact page', () => desk.openUrl(m.contact)) : null,
          iconAct('copy', 'Copy subject and message', () => desk.copy(`Subject: ${m.subject}\n\n${m.body}`)),
          actBtn('Gmail', 'email', () => desk.gmail({ subject: m.subject, body: m.body }), { done: 'Opened' })
        )
      );
      wrap.append(row);
    });
  });
  return wrap;
}

// Compact icon-only button with a tooltip and a brief check mark after clicking.
function iconAct(ic, title, fn) {
  const b = h('button', { class: 'btn sm iconly', title, html: icon(ic) });
  b.onclick = async (e) => {
    e.stopPropagation();
    await fn();
    b.innerHTML = icon('check');
    b.classList.add('done-flash');
    setTimeout(() => {
      b.innerHTML = icon(ic);
      b.classList.remove('done-flash');
    }, 1200);
  };
  return b;
}

// ---------- finish ----------
const notesSaved = autosave(
  $('#notes'),
  (v) => {
    if (ST) ST.notes = v;
    return desk.notes(ID, v);
  },
  (v) => desk.saveSync(ID, 'notes', v)
);
$('#notesSaved').replaceWith(notesSaved);

async function finish(status, next) {
  if (finishing) return;
  finishing = true;
  stopCountdown();
  const r = await desk.finish(ID, status, $('#notes').value, next);
  if (!r.ok) {
    finishing = false;
    toast(r.error || "Couldn't save");
    return;
  }
  const where =
    { factory: `Sent to ${T.projectName}.`, file: `Saved to ${base(r.file)}.`, app: 'Saved in Task Desk.' }[r.resultsTo] || 'Saved.';
  const msg = status === 'done' ? `Nice. ${where}` : r.resultsTo === 'factory' ? `Skipped. ${T.projectName} will know.` : 'Skipped.';
  document.body.append(
    h('div', { class: 'celebrate' }, h('div', { html: `<div class="tile">${icon(status === 'done' ? 'check' : 'skip')}</div>${esc(msg)}` }))
  );
}
$('#bdone').onclick = () => finish('done', false);
$('#bnext').onclick = () => finish('done', true);
$('#bskip').onclick = () => finish('skipped', false);
$('#bsnooze').onclick = (e) =>
  popMenu(e.currentTarget, [
    { label: 'Tomorrow morning', icon: 'moon', run: () => snooze('tomorrow') },
    { label: 'Next week', icon: 'clock', run: () => snooze('week') },
  ]);
async function snooze(when) {
  const until = await desk.snooze(ID, when);
  toast(`Snoozed until ${new Date(until).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`);
  setTimeout(() => desk.close(), 900);
}

// ---------- chat ----------
const css = getComputedStyle(document.documentElement);
const v = (n) => css.getPropertyValue(n).trim();
const term = new Terminal({
  fontFamily: v('--mono'),
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
term.onData((d) => desk.chatWrite(ID, d));
const refit = () => {
  try {
    fit.fit();
    desk.chatResize(ID, term.cols, term.rows);
  } catch {}
};
new ResizeObserver(() => requestAnimationFrame(refit)).observe($('#term'));

function setStat(kind, text) {
  $('#cstat').className = 'cstat ' + kind;
  $('#cstatText').textContent = text;
}

// ---------- switch AI for this task ----------
// Like a model picker: the new AI gets the task brief plus the end of the last
// conversation, and each AI keeps its own chat here, so switching back resumes it.
$('#aiSwitch').onclick = async (e) => {
  e.stopPropagation();
  const c = await desk.aiChoices(ID);
  const cur = c.current.id;
  const base = c.project || c.desk;
  const baseName = (c.list.find((x) => x.id === base) || {}).name;
  const items = c.list.map((x) => ({
    label: `${x.name} (${x.app})`,
    icon: x.id === cur ? 'check' : 'sparkle',
    hint: x.installed ? '' : 'not installed',
    run: () => switchTo(x.id === base ? '' : x.id, x),
  }));
  popMenu($('#aiSwitch'), items, {
    head: 'AI for this task',
    notes: [
      `Default: ${baseName}${c.project ? " (this project's choice)" : ' (set in the task box)'}. Switching hands over the plan and the recent conversation.`,
    ],
  });
};
async function switchTo(id, x) {
  if (x.id === (await desk.aiChoices(ID)).current.id) return;
  const r = await desk.switchAI(ID, id);
  if (!r) return;
  T.aiName = r.app;
  $('#aiName').textContent = r.app;
  startChat('auto');
  toast(
    r.installed
      ? `Switched to ${r.name}. It got the plan and the recent conversation.`
      : `${r.app} isn't installed yet: see the chat panel.`
  );
}

function startChat(mode) {
  chatStarted = true;
  $('#overlay').hidden = true;
  term.reset();
  refit();
  setStat('connecting', `Starting ${(T && T.aiName) || 'the chat'}…`);
  desk.chatStart(ID, mode, term.cols, term.rows);
  // Don't steal the keyboard from a notes or paste box you're typing in.
  setTimeout(() => {
    const a = document.activeElement;
    if (!a || a === term.textarea || !/^(TEXTAREA|INPUT)$/.test(a.tagName)) term.focus();
  }, 300);
}

function sendToChat(text) {
  if (!chatStarted) startChat('auto');
  desk.chatSend(ID, text).then((ok) => {
    if (ok) {
      toast('Sent to the chat');
      term.focus();
    } else toast("Chat isn't running yet. Try again in a moment.");
  });
}

let gotData = false;
desk.onChatData((id, d) => {
  if (id !== ID) return;
  term.write(d);
  if (!gotData) {
    gotData = true;
    setStat('live', $('#cstatText').dataset.label || 'Live');
  }
});
desk.onChatInfo((id, info) => {
  if (id !== ID) return;
  gotData = false;
  $('#cstatText').dataset.label = `Live · ${info.label.toLowerCase()}`;
  setStat('connecting', info.label + '…');
});
desk.onChatExit((id, code) => {
  if (id !== ID) return;
  // The AI app isn't installed: keep the how-to in the chat panel readable.
  if (code === -2) {
    setStat('', 'Not installed: see below');
    return;
  }
  showEnded('The chat ended');
});
function showEnded(title) {
  setStat('', title);
  const o = $('#overlay');
  o.replaceChildren(
    h(
      'div',
      { class: 'inner' },
      h('b', {}, title),
      'Pick up where you left off, or start clean for the next thing.',
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn primary', html: `${icon('play')}<span>Resume</span>`, onclick: () => startChat('auto') }),
        h('button', { class: 'btn', html: `${icon('plus')}<span>Fresh chat</span>`, onclick: () => startChat('fresh') })
      )
    )
  );
  o.hidden = false;
}
desk.onChatReset((id) => {
  if (id === ID) startChat('fresh');
});

$('#cclear').onclick = () => {
  if (!chatStarted) return;
  desk.chatWrite(ID, '/clear');
  setTimeout(() => desk.chatWrite(ID, '\r'), 150);
  toast('Conversation cleared');
  term.focus();
};
$('#cfresh').onclick = () => startChat('fresh');
$('#cmore').onclick = (e) =>
  popMenu(e.currentTarget, [
    { label: 'Fresh chat (clean slate)', icon: 'plus', run: () => startChat('fresh') },
    {
      label: isFactory() ? `Restart from ${T.projectName}'s latest session` : "Restart from project's latest session",
      icon: 'refresh',
      run: () => startChat('fork'),
    },
    {
      label: 'Re-send the task brief',
      icon: 'send',
      run: () =>
        sendToChat(
          `Reminder of what we're doing. Task: ${T.text}${P ? ' Plan: ' + P.steps.map((s, i) => `${i + 1}) ${s.text}`).join(' ') : ''}`
        ),
    },
    { label: 'Stop the chat', icon: 'x', run: () => desk.chatStop(ID).then(() => showEnded('Chat stopped')) },
  ]);

// Chrome: off by default (the chat has no access to your browser). Each click
// moves on: off -> look only (Claude reads the pages you open from the plan,
// when asked) -> working (it may click and type there too, more tokens) -> off.
// Company-safe mode keeps it off.
const CHROME_NEXT = { off: 'look', look: 'work', work: 'off' };
const CHROME_TEXT = {
  off: ['Chrome: off', "Claude can't see or use your Chrome browser in this chat. Click to let it look at pages you open from the plan."],
  look: [
    'Chrome: look only',
    'Claude can look at pages you open from the plan when you ask. Click to let it click and type there too (uses more tokens).',
  ],
  work: [
    'Chrome: working',
    'Claude may click and type in Chrome for the steps (you press send, submit or pay yourself). Uses more tokens. Click to turn Chrome off.',
  ],
};
function showChrome(mode, locked) {
  const m = CHROME_TEXT[mode] ? mode : 'off';
  $('#cchrome').classList.toggle('on', m !== 'off');
  $('#cchrome').innerHTML = `${icon('external')}<span>${esc(CHROME_TEXT[m][0])}</span>`;
  $('#cchrome').title = locked ? 'Company-safe mode is on, so chats never get your Chrome browser.' : CHROME_TEXT[m][1];
  $('#cchrome').disabled = !!locked;
}
$('#cchrome').onclick = async () => {
  const r = await desk.setChrome(ID, CHROME_NEXT[(T && T.chrome) || 'off']);
  if (!r) return;
  if (T) T.chrome = r.mode;
  showChrome(r.mode, r.locked);
  toast(
    {
      off: 'Chrome is off for this task',
      look: 'Claude can look at Chrome for this task',
      work: 'Claude can work in Chrome for this task',
    }[r.mode] + (r.restarted ? ' (the chat picked up where it was)' : '')
  );
  if (r.restart) startChat('auto');
};
showChrome('off');

// ---------- live updates ----------
desk.onPlan((id) => {
  if (id === ID) load();
});
desk.onTasks((p) => {
  const t = p.tasks.find((x) => x.id === ID);
  if (t && T && t.planStatus === 'ready' && !P) load();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.activeElement !== term.textarea) document.querySelectorAll('.popmenu').forEach((m) => m.remove());
});

load();
