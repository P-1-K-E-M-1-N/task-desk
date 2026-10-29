// "Add a project" / "Edit project" window. New projects are created with the
// Add button; changes to an existing project save themselves as you go.
const $ = (s) => document.querySelector(s);
const ID = new URLSearchParams(location.search).get('id') || '';
const COLORS = ['#c96442', '#2f6fae', '#4f7a5a', '#8a4a87', '#a87414', '#2f8580', '#b0587a', '#6a68b0'];
let color = COLORS[0];
let resultsPath = '';

$('#wclose').innerHTML = icon('x');
$('#ttile').className = 'tile';
$('#ttile').innerHTML = icon('folder');
$('#pickFolder').innerHTML = `${icon('folder')}<span>Choose…</span>`;
$('#pickFile').innerHTML = `${icon('file')}<span>Choose…</span>`;

// ---------- form ----------
const radio = (name) => (document.querySelector(`input[name=${name}]:checked`) || {}).value;
function setRadio(name, value) {
  document.querySelectorAll(`input[name=${name}]`).forEach((r) => { r.checked = r.value === value; });
  document.querySelectorAll(`.choice[data-name=${name}]`).forEach((c) => c.classList.toggle('on', c.dataset.value === value));
}
document.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => { setRadio(r.name, r.value); changed(); }));

function drawColors() {
  $('#colors').replaceChildren(...COLORS.map((c) => h('button', {
    class: c === color ? 'on' : '', style: `background:${c}`, title: 'Use this color',
    onclick: () => { color = c; drawColors(); changed(); },
  })));
}

const draft = () => ({
  id: ID || undefined,
  name: $('#name').value,
  folder: $('#folder').value.trim(),
  source: radio('source'),
  tasksFile: $('#tasksFile').value.trim(),
  onlyMine: $('#onlyMine').checked,
  results: radio('results'),
  resultsFile: $('#resultsFile').value.trim(),
  allowEdits: $('#allowEdits').checked,
  ownLook: $('#ownLook').checked,
  ai: $('#ai').value,
  notes: $('#notes').value,
  color,
});

function showError(r) {
  document.querySelectorAll('.err').forEach((e) => e.remove());
  document.querySelectorAll('.bad').forEach((e) => e.classList.remove('bad'));
  if (!r || r.ok) return;
  const field = { name: '#f-name', folder: '#f-folder', tasksFile: '#f-tasksFile', results: '#f-results', resultsFile: '#f-results' }[r.field] || '#f-name';
  const f = $(field);
  f.classList.add('bad');
  f.append(h('div', { class: 'err' }, r.error));
}

// ---------- checklist preview ----------
let previewTimer = null;
function preview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const d = draft();
    if (d.source !== 'file' || !d.tasksFile) { $('#found').hidden = true; return; }
    const r = await desk.previewProject({ ...d, name: d.name || 'x' });
    const f = $('#found');
    f.hidden = false;
    f.className = 'found' + (r.ok && r.count ? '' : ' warn');
    if (!r.ok) { f.innerHTML = `${icon('x')}<span></span>`; f.querySelector('span').textContent = r.error; return; }
    f.innerHTML = `${icon(r.count ? 'check' : 'x')}<span></span>`;
    f.querySelector('span').textContent = r.count
      ? `Found ${r.count} open task${r.count === 1 ? '' : 's'}: ${r.titles.join(' · ')}${r.count > 3 ? ' …' : ''}`
      : 'No open "- [ ]" lines in that file yet. Tasks appear as soon as some are added.';
  }, 250);
}

// ---------- pickers ----------
async function useFolder(folder) {
  $('#folder').value = folder;
  const s = await desk.suggestProject(folder);
  if (!$('#name').value.trim() && s.name) $('#name').value = s.name;
  if (s.tasksFile && !$('#tasksFile').value.trim()) { $('#tasksFile').value = s.tasksFile; setRadio('source', 'file'); }
  if (s.factory) { setRadio('results', 'app'); toast('That\'s inside the Idea Factory: it stays read-only.'); }
  preview();
  changed();
}
$('#pickFolder').onclick = async (e) => { e.preventDefault(); const f = await desk.pick('folder', $('#folder').value.trim()); if (f) useFolder(f); };
$('#pickFile').onclick = async (e) => {
  e.preventDefault();
  const f = await desk.pick('file', $('#tasksFile').value.trim() || $('#folder').value.trim());
  if (!f) return;
  const folder = $('#folder').value.trim();
  $('#tasksFile').value = folder && f.toLowerCase().startsWith(folder.toLowerCase() + '\\') ? f.slice(folder.length + 1) : f;
  setRadio('source', 'file');
  preview();
  changed();
};
$('#folder').addEventListener('change', () => { if ($('#folder').value.trim()) useFolder($('#folder').value.trim()); });
['#tasksFile', '#onlyMine'].forEach((s) => $(s).addEventListener('input', preview));
document.querySelectorAll('input.box, textarea.box, input[type=checkbox]').forEach((el) => el.addEventListener('input', changed));

// ---------- saving ----------
// Existing project: saves itself a moment after each change. New project: the Add button.
let saveTimer = null;
let dirty = false;
const mark = (s, text) => {
  const el = $('#savestate');
  el.hidden = false;
  el.dataset.s = s;
  el.innerHTML = s === 'saving' ? 'Saving…' : s === 'saved' ? `${icon('check')}Saved` : text;
};
function changed() {
  if (!ID) { showError(null); return; }
  dirty = true;
  mark('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 450);
}
async function saveNow() {
  clearTimeout(saveTimer);
  if (!ID || !dirty) return true;
  dirty = false;
  const r = await desk.saveProject(draft());
  showError(r);
  if (!r.ok) { mark('error', 'Not saved yet: fix the note below'); return false; }
  resultsPath = r.resultsPath;
  mark('saved');
  return true;
}
document.addEventListener('focusout', () => { if (dirty) saveNow(); });

$('#add').onclick = async () => {
  const r = await desk.saveProject(draft());
  showError(r);
  if (!r.ok) { $(`.bad`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  document.body.append(h('div', { class: 'celebrate' }, h('div', { html: `<div class="tile">${icon('check')}</div>Project added` })));
  setTimeout(() => desk.close(), 700);
};
const closeWin = async () => { if (await saveNow()) desk.close(); };
$('#cancel').onclick = closeWin;
$('#wclose').onclick = closeWin;
$('#remove').onclick = async () => { if (await desk.removeProject(ID)) desk.close(); };
$('#openResults').onclick = async () => { const r = await desk.openResults(resultsPath); if (r && r.ok === false) toast(r.error); };

// ---------- start ----------
async function init() {
  drawColors();
  setRadio('source', 'file');
  setRadio('results', 'app');
  if (!ID) { $('#ownLook').checked = !!LOOK.newOwn; $('#name').focus(); return; }
  const p = await desk.getProject(ID);
  if (!p) { $('.scroll').innerHTML = '<p class="lead">This project was removed. You can close this window.</p>'; return; }
  document.title = `Edit ${p.name}`;
  $('#tname').textContent = `Edit project · ${p.name}`;
  $('#title').textContent = p.name;
  $('#name').value = p.name;
  $('#folder').value = p.folder || '';
  $('#tasksFile').value = p.tasksFile || '';
  $('#onlyMine').checked = !!p.onlyMine;
  $('#resultsFile').value = p.resultsFile || 'FROM_NICK.md';
  $('#allowEdits').checked = !!p.allowEdits;
  $('#ownLook').checked = !!p.ownLook;
  $('#ai').value = p.ai || '';
  $('#notes').value = p.notes || '';
  color = p.color || COLORS[0];
  resultsPath = p.resultsPath;
  setRadio('source', p.source);
  setRadio('results', p.results);
  drawColors();
  $('#add').hidden = true;
  $('#cancel').textContent = 'Close';
  $('#remove').hidden = false;
  $('#openResults').hidden = false;
  mark('saved');
  if (p.missing) showError({ ok: false, field: 'folder', error: 'This folder isn\'t on this computer. Choose where the project lives here.' });
  preview();
}
init();
