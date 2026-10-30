// Projects test: add a project through the editor, quick add, the "All projects"
// view, a real plan and chat for a project task, Done notes going to the
// project's own file, editing (autosave), the Idea Factory guard, a missing
// folder, and the OneDrive-style data folder. Uses a throwaway project folder.
// Run: node test/projects.js   (Claude plans 3 small tasks, about a minute)
const { _electron } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { useTestSettings, launchOpts, DATA } = require('./env');

const BASE = path.dirname(DATA);
const PROJ = path.join(BASE, 'rental-houses');
const SHOTS = path.join(__dirname, 'shots');
const FACTORY_FROM_NICK = path.join(__dirname, '..', 'test-fixtures', 'ops', 'FROM_NICK.md');
const results = [];
const ok = (name, cond, extra = '') => { results.push(cond); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const settings = () => JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8'));

async function launch(env) {
  const app = await _electron.launch(launchOpts(env));
  await app.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async () => {}; shell.openPath = async (p) => { global.__opened.push(p); return ''; }; });
  const box = await app.firstWindow();
  box.on('pageerror', (e) => ok('no box page errors', false, e.message));
  await box.waitForSelector('#pname');
  return { app, box };
}
const until = async (page, fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await page.waitForTimeout(800); } return null; };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  useTestSettings({ look: { theme: 'clay', material: 'paper', appearance: 'light', size: 'm' } });
  fs.mkdirSync(PROJ, { recursive: true });
  fs.writeFileSync(path.join(PROJ, 'README.md'), '# Rental houses\n\nTwo houses: 12 Elm St and 40 Oak Ave. Repairs go through Mike (mike@example.com).\n');
  fs.writeFileSync(path.join(PROJ, 'TODO.md'), '# To do\n\n## Repairs\n- [ ] **Ask Mike for a quote on the Elm St faucet** (2026-10-30)\n- [x] Replace the Oak Ave smoke detector\n\n## Rent\n- [ ] Draft the November rent reminder for the Oak Ave tenant\n');
  const factoryBefore = fs.existsSync(FACTORY_FROM_NICK) ? fs.readFileSync(FACTORY_FROM_NICK, 'utf8') : null;

  let { app, box } = await launch();
  ok('switcher shows the Idea Factory when it is the only project', (await box.locator('#pname').innerText()) === 'Idea Factory');
  ok('no quick add for the Idea Factory', await box.locator('#quickadd').isHidden());

  // ---- add a project through the editor ----
  await box.locator('#switch').click();
  ok('switcher menu offers "Add a project"', await box.locator('.popmenu.projects button', { hasText: 'Add a project' }).isVisible());
  const [ed] = await Promise.all([app.waitForEvent('window'), box.locator('.popmenu.projects button', { hasText: 'Add a project' }).click()]);
  ed.on('pageerror', (e) => ok('no editor page errors', false, e.message));
  await ed.waitForSelector('#folder');
  await ed.locator('#add').click();
  ok('editor asks for a name first', /name/i.test(await ed.locator('.err').innerText()));
  await ed.locator('#folder').fill(PROJ);
  await ed.locator('#folder').dispatchEvent('change');
  await until(ed, async () => (await ed.locator('#name').inputValue()) !== '', 5000);
  ok('picking a folder suggests a name', (await ed.locator('#name').inputValue()) === 'Rental Houses', await ed.locator('#name').inputValue());
  ok('picking a folder finds its checklist', (await ed.locator('#tasksFile').inputValue()) === 'TODO.md');
  await until(ed, () => ed.locator('#found').isVisible(), 5000);
  const found = await ed.locator('#found').innerText();
  ok('editor previews the tasks it found', /Found 2 open tasks/.test(found), found);
  await ed.locator('.choice[data-value=file][data-name=results]').click();
  await ed.locator('#resultsFile').fill('FROM_NICK.md');
  await ed.locator('#notes').fill('Keep it short. Mike prefers text messages.');
  await ed.screenshot({ path: path.join(SHOTS, 'project-editor.png') });
  await Promise.all([ed.waitForEvent('close'), ed.locator('#add').click()]);
  ok('Add project closes the editor', true);

  await until(box, async () => (await box.locator('#pname').innerText()) === 'Rental Houses', 5000);
  ok('box switches to the new project', (await box.locator('#pname').innerText()) === 'Rental Houses');
  await until(box, async () => (await box.locator('.card').count()) === 2, 5000);
  ok('project tasks show in the box (ticked lines skipped)', (await box.locator('.card').count()) === 2);
  ok('lane chips come from ## headings', await box.locator('.chip', { hasText: 'Repairs' }).count() === 1 && await box.locator('.chip', { hasText: 'Rent' }).count() === 1);
  const pid = settings().projects[0].id;
  ok('project saved in settings', settings().projects.length === 1 && settings().projects[0].tasksFile === 'TODO.md' && settings().view === pid);

  // ---- quick add ----
  ok('quick add shows for the project', await box.locator('#quickadd').isVisible());
  await box.locator('#qtext').fill('Order a new mailbox for 12 Elm St');
  await box.locator('#qtext').press('Enter');
  await until(box, async () => (await box.locator('.card').count()) === 3, 5000);
  ok('quick add puts the task in the box', await box.locator('.card', { hasText: 'Order a new mailbox' }).count() === 1);
  ok('quick-added task is under "My list"', await box.locator('.chip', { hasText: /my list/i }).count() === 1);
  const st = JSON.parse(fs.readFileSync(path.join(DATA, 'projects', pid, 'state.json'), 'utf8'));
  ok('quick-added task saved in the project\'s own memory', (st.added || []).some((a) => /mailbox/.test(a.text)));
  ok('the checklist file was not changed', !/mailbox/.test(fs.readFileSync(path.join(PROJ, 'TODO.md'), 'utf8')));

  // ---- all projects ----
  await box.locator('#switch').click();
  await box.locator('.popmenu.projects button', { hasText: 'All projects' }).click();
  await until(box, async () => (await box.locator('#pname').innerText()) === 'All projects', 5000);
  const allCount = await box.locator('.card').count();
  ok('"All projects" lists both projects\' tasks', allCount >= 14, `${allCount} cards`);
  ok('"All projects" chips are projects', await box.locator('.chip', { hasText: 'Rental Houses' }).count() === 1 && await box.locator('.chip', { hasText: 'Idea Factory' }).count() === 1);
  ok('cards say which project they belong to', await box.locator('.card .lane', { hasText: 'Rental Houses' }).count() === 3);
  await box.locator('.chip', { hasText: 'Rental Houses' }).click();
  ok('project chip filters the list', (await box.locator('.card').count()) === 3);
  await box.screenshot({ path: path.join(SHOTS, 'projects-all.png') });

  // ---- plan, chat and Done for a project task ----
  const card = box.locator('.card', { hasText: 'Ask Mike for a quote' });
  const planned = await until(box, async () => (await card.locator('.drafting').count()) === 0, 240000);
  ok('Claude drafts a plan for the project task', !!planned);
  const [win] = await Promise.all([app.waitForEvent('window'), card.click()]);
  win.on('pageerror', (e) => ok('no task page errors', false, e.message));
  await win.waitForSelector('.step', { timeout: 20000 });
  ok('task window shows the project name', /Rental Houses/.test(await win.locator('#tname').innerText()));
  ok('notes box is labelled for the project', /^notes and results$/i.test(await win.locator('#notesHead').innerText()));
  const term = () => win.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');
  let trusted = false;
  const chatText = await until(win, async () => {
    const t = await term();
    if (/trust this folder/i.test(t) && !trusted) { trusted = true; await win.locator('.term').click(); await win.keyboard.press('ArrowDown'); await win.keyboard.press('Enter'); }
    return /his project "Rental Houses"/.test(t.replace(/\s+/g, ' ')) ? t : null;
  }, 120000);
  ok('chat starts with the project brief', !!chatText);
  await win.screenshot({ path: path.join(SHOTS, 'project-task.png') });
  await win.locator('#notes').fill('Texted Mike, quote is $140.');
  await win.waitForTimeout(600);
  await win.locator('#bdone').click();
  await box.waitForTimeout(1500);
  const projFrom = fs.existsSync(path.join(PROJ, 'FROM_NICK.md')) ? fs.readFileSync(path.join(PROJ, 'FROM_NICK.md'), 'utf8') : '';
  ok('Done writes to the project\'s results file', /Ask Mike for a quote/.test(projFrom) && /quote is \$140/.test(projFrom) && /Rental Houses/.test(projFrom));
  const factoryNow = fs.existsSync(FACTORY_FROM_NICK) ? fs.readFileSync(FACTORY_FROM_NICK, 'utf8') : null;
  ok('Idea Factory FROM_NICK.md untouched by project work', factoryNow === factoryBefore);
  ok('done project task leaves the box', await box.locator('.card', { hasText: 'Ask Mike for a quote' }).count() === 0);

  // ---- edit (autosave) ----
  await box.locator('#switch').click();
  await box.locator('.popmenu.projects button', { hasText: 'Rental Houses' }).click();
  await box.locator('#switch').click();
  // ---- a project with its own look ----
  const deskLook = await box.evaluate(() => document.documentElement.dataset.material);
  await box.locator('#look').click();
  ok('look panel says which project is showing', /uses the desk's look/.test(await box.locator('.lookpanel .scope').innerText()));
  await box.locator('.lookpanel .scope button').click();
  await box.waitForTimeout(300);
  ok('project gets its own look in its color', /Styling .* only/.test(await box.locator('.lookpanel .scope').innerText())
    && (await box.evaluate(() => getComputedStyle(document.body).getPropertyValue('--clay').trim())) !== '');
  await box.locator('.lookpanel .grid button', { hasText: 'Stars' }).click();
  await box.waitForTimeout(300);
  ok('frame change goes to the project only', (await box.evaluate(() => document.documentElement.dataset.material)) === 'stars'
    && (JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8')).look.material) === deskLook);
  await box.mouse.click(5, 5);
  await box.locator('#switch').click();
  await box.locator('.popmenu.projects button', { hasText: 'All projects' }).click();
  await box.waitForTimeout(400);
  ok('other views keep the desk look', (await box.evaluate(() => document.documentElement.dataset.material)) === deskLook);
  await box.locator('#switch').click();
  await box.locator('.popmenu.projects button', { hasText: 'Rental Houses' }).click();
  await box.waitForTimeout(400);
  ok('switching back brings the project look', (await box.evaluate(() => document.documentElement.dataset.material)) === 'stars');
  await box.screenshot({ path: path.join(__dirname, 'shots', 'project-own-look.png') });
  await box.locator('#switch').click();

  const [ed2] = await Promise.all([app.waitForEvent('window'), box.locator('.popmenu.projects button', { hasText: 'Edit this project' }).click()]);
  await ed2.waitForSelector('#remove:not([hidden])');
  ok('editor opens with the project filled in', (await ed2.locator('#name').inputValue()) === 'Rental Houses' && (await ed2.locator('#notes').inputValue()).includes('Mike prefers'));
  await ed2.locator('#name').fill('Rentals');
  const saved = await until(ed2, async () => (await ed2.locator('#savestate').getAttribute('data-s')) === 'saved' && settings().projects[0].name === 'Rentals', 5000);
  ok('editing a project saves itself', !!saved);
  await until(box, async () => (await box.locator('#pname').innerText()) === 'Rentals', 5000);
  ok('box shows the new name', (await box.locator('#pname').innerText()) === 'Rentals');
  await ed2.locator('#cancel').click();

  // ---- safety ----
  const guard = await box.evaluate((f) => desk.saveProject({ name: 'Factory copy', folder: f, source: 'list', results: 'file', resultsFile: 'ops/NOTES.md' }), require('./env').WORKSPACE);
  ok('a project can\'t write into the Idea Factory', guard.ok === false && /read-only/.test(guard.error), guard.error);
  const outside = await box.evaluate((f) => desk.saveProject({ name: 'Sneaky', folder: f, source: 'list', results: 'file', resultsFile: '..\\escape.md' }), PROJ);
  ok('results file must stay inside the project folder', outside.ok === false);
  ok('nothing was created by the refused saves', settings().projects.length === 1);

  // ---- missing folder ----
  const gone = path.join(BASE, 'old-laptop-folder');
  fs.mkdirSync(gone);
  const r2 = await box.evaluate((f) => desk.saveProject({ name: 'Old project', folder: f, source: 'list', results: 'app' }), gone);
  fs.rmSync(gone, { recursive: true });
  await box.evaluate((id) => desk.setView(id), r2.project.id);
  await until(box, () => box.locator('#warn').isVisible(), 5000);
  ok('a missing folder shows a fix-it note', /isn't on this computer/.test(await box.locator('#warn').innerText()));

  // ---- remembered after restart ----
  await app.close();
  ({ app, box } = await launch());
  await until(box, async () => (await box.locator('#pname').innerText()) === 'Old project', 8000);
  ok('projects and the chosen view survive a restart', (await box.locator('#pname').innerText()) === 'Old project' && settings().projects.length === 2);
  await app.close();

  // ---- OneDrive-style data folder ----
  const cloud = path.join(BASE, 'OneDrive', 'Task Desk');
  fs.mkdirSync(cloud, { recursive: true });
  for (const n of ['settings.json', 'projects', 'plans']) fs.cpSync(path.join(DATA, n), path.join(cloud, n), { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(DATA, 'machine.json'), 'utf8'));
  fs.writeFileSync(path.join(DATA, 'machine.json'), JSON.stringify({ ...m, dataDir: cloud }, null, 2));
  ({ app, box } = await launch({ TASKDESK_LOCAL_DATA: '' }));
  await box.waitForTimeout(1500);
  ok('app reads its data from the synced folder', (await box.locator('#pname').innerText()) === 'Old project');
  ok('synced folder gets an in-use note while open', fs.existsSync(path.join(cloud, 'in-use.json')));
  ok('chat tool configs stay on this computer', !fs.existsSync(path.join(cloud, 'mcp')));
  await box.evaluate(() => desk.setView('all'));
  await box.waitForTimeout(500);
  ok('changes are saved to the synced folder', JSON.parse(fs.readFileSync(path.join(cloud, 'settings.json'), 'utf8')).view === 'all');
  ok('window position stays per computer', !('boxBounds' in JSON.parse(fs.readFileSync(path.join(cloud, 'settings.json'), 'utf8'))));
  await app.close();
  ok('in-use note removed on quit', !fs.existsSync(path.join(cloud, 'in-use.json')));

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
