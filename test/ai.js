// Checks the "which AI" layer (src/main/ai.js): how Codex and Gemini chats and
// plan runs are started, that they get the Task Desk tools, and that the desk
// uses the AI you picked (with a pretend AI, so no other app or login is needed).
// Run: node test/ai.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('playwright-core');
const { useTestSettings, launchOpts, DATA } = require('./env');

const results = [];
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const FAKE = `${process.execPath}|${path.join(__dirname, 'fake-claude.js')}`;

(async () => {
  useTestSettings();
  process.env.TASKDESK_LOCAL_DIR = DATA;
  process.env.TASKDESK_LOCAL_DATA = '1';
  const ai = require('../src/main/ai');
  const { PROVIDERS: P } = ai;

  // ---- chats ----
  const spec = { command: 'C:\\App\\electron.exe', args: ['C:\\App\\mcp.js'], env: { TASKDESK_PORT: '123', TASKDESK_TASK: 't1' } };
  const codexTools = ai.toolArgs(P.codex, spec, 't1').args.join(' ');
  ok('Codex chats get the Task Desk tools', /mcp_servers\.taskdesk\.command='C:\\App\\electron\.exe'/.test(codexTools) && /mcp_servers\.taskdesk\.args=\['C:\\App\\mcp\.js'\]/.test(codexTools) && /TASKDESK_TASK='t1'/.test(codexTools), codexTools);
  const gem = ai.toolArgs(P.gemini, spec, 't1');
  const gemFile = gem.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
  ok('Gemini chats get the Task Desk tools', gemFile && JSON.parse(fs.readFileSync(gemFile, 'utf8')).mcpServers.taskdesk.command === spec.command);
  const fresh = ai.chatArgs(P.codex, { brief: 'Do the task', edits: false });
  ok('a Codex chat starts with the task brief, read-only', fresh.includes('read-only') && fresh[fresh.length - 1] === 'Do the task', fresh.join(' '));
  ok('with edits allowed it may change the folder', ai.chatArgs(P.codex, { brief: 'x', edits: true }).includes('workspace-write'));
  ok('a Codex chat resumes its own session', ai.chatArgs(P.codex, { resume: true, sessionId: 'abc' }).join(' ').endsWith('resume abc'));
  ok('a Gemini chat starts with the brief and resumes the latest', ai.chatArgs(P.gemini, { brief: 'Hi' }).join(' ') === '--prompt-interactive Hi' && ai.chatArgs(P.gemini, { resume: true }).join(' ') === '--resume latest');

  // Codex picks its own session ids: find the one just started in this folder.
  const home = path.join(os.tmpdir(), 'taskdesk-codex-test');
  fs.rmSync(home, { recursive: true, force: true });
  const d = new Date();
  const day = path.join(home, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
  fs.mkdirSync(day, { recursive: true });
  const since = Date.now() - 1000;
  fs.writeFileSync(path.join(day, 'rollout-x-11111111-2222-3333-4444-555555555555.jsonl'), JSON.stringify({ type: 'session_meta', payload: { id: '11111111-2222-3333-4444-555555555555', cwd: 'C:\\Other' } }) + '\n');
  fs.writeFileSync(path.join(day, 'rollout-y-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl'), JSON.stringify({ type: 'session_meta', payload: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', cwd: 'C:\\MrC\\proj' } }) + '\n');
  process.env.CODEX_HOME = home;
  ok('finds the Codex session for this folder', ai.findCodexSession('C:\\MrC\\proj', since) === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  ok('not one from another folder', ai.findCodexSession('C:\\MrC\\nothing', since) === null || ai.findCodexSession('C:\\MrC\\nothing', since) === undefined);

  // ---- plans ----
  ok('plan JSON is found even inside ``` fences', ai.jsonIn('Here:\n```json\n{"summary":"s","steps":[{"text":"a"}]}\n```')?.summary === 's');
  ok('Gemini plan is read from its JSON reply', ai.readPlan(P.gemini, JSON.stringify({ response: '{"summary":"g","steps":[]}' }))?.summary === 'g');
  const out = path.join(home, 'last.txt');
  fs.writeFileSync(out, '{"summary":"c","steps":[]}');
  ok('Codex plan is read from its last message', ai.readPlan(P.codex, '', out)?.summary === 'c');
  ok('the Codex plan run only reads files', ai.planArgs(P.codex, out).join(' ').includes('exec --sandbox read-only'));
  ok('the Gemini plan run asks for JSON', ai.planArgs(P.gemini, out).includes('json'));

  // ---- the desk uses the AI you pick ----
  try { fs.unlinkSync(path.join(DATA, 'state.test.json')); } catch {}
  useTestSettings();
  let app = await _electron.launch(launchOpts({ TASKDESK_FAKE_AI: FAKE }));
  let box = await app.firstWindow();
  await box.waitForSelector('.card', { timeout: 20000 });
  ok('the task box shows the default AI', /Claude/.test(await box.locator('#aipick').innerText()));
  await box.locator('#aipick').click();
  ok('it offers every AI', (await box.locator('.popmenu button').count()) === 3);
  await box.waitForTimeout(400);
  await box.screenshot({ path: path.join(__dirname, 'shots', 'ai-box-picker.png') });
  await box.locator('.popmenu button', { hasText: 'OpenAI' }).click();
  await box.waitForTimeout(300);
  ok('picking OpenAI makes it the default', /OpenAI/.test(await box.locator('#aipick').innerText()) && JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8')).ai === 'codex');
  await box.locator('.chip').first().click();
  let [win] = await Promise.all([app.waitForEvent('window'), box.locator('.card', { hasText: /Open Recipes Project/ }).first().click()]);
  await win.waitForSelector('.step', { timeout: 15000 });
  const term = () => win.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');
  const waitFor = async (re) => { let x = ''; for (let i = 0; i < 40 && !re.test(x); i++) { await win.waitForTimeout(250); x = await term(); } return x; };
  let t = await waitFor(/FAKE CLAUDE/);
  ok('a new task window opens with the default AI (Codex)', /--sandbox --ask-for-approval/.test(t), t.split('\n')[1]);
  ok('the chat panel says Codex', (await win.locator('#aiName').innerText()) === 'Codex');
  const stateNow = () => JSON.parse(fs.readFileSync(path.join(DATA, 'state.test.json'), 'utf8')).tasks || {};
  ok('the chat was remembered as a Codex chat', Object.values(stateNow()).some((x) => x.chats && 'codex' in x.chats));
  await win.locator('#term').click();
  await win.keyboard.type('the form is sent');
  await win.keyboard.press('Enter');
  await waitFor(/you said: the form is sent/);

  // ---- switching AI in the middle of a task ----
  await win.locator('#aiSwitch').click();
  ok('the chat panel offers every AI', (await win.locator('.popmenu button').count()) === 3);
  await win.waitForTimeout(400);
  await win.screenshot({ path: path.join(__dirname, 'shots', 'ai-task-switch.png') });
  await win.locator('.popmenu button', { hasText: 'Claude' }).click();
  t = await waitFor(/--mcp-config/);
  ok('switching starts Claude for this task', /--mcp-config/.test(t) && (await win.locator('#aiName').innerText()) === 'Claude Code', t.split('\n').find((l) => /args:/.test(l)));
  ok('Claude is told how the last chat ended', /handover: yes/.test(t));
  ok('only this task switched; the default stays OpenAI', /OpenAI/.test(await box.locator('#aipick').innerText()) && Object.values(stateNow()).some((x) => x.ai === 'claude'));
  await win.locator('#aiSwitch').click();
  await win.locator('.popmenu button', { hasText: 'OpenAI' }).click();
  t = await waitFor(/--sandbox/);
  ok('switching back goes to the default again', (await win.locator('#aiName').innerText()) === 'Codex' && !Object.values(stateNow()).some((x) => x.ai));
  await app.close();

  // An AI that isn't installed says how to get it, instead of failing.
  if (!ai.locate(P.gemini)) {
    useTestSettings({ ai: 'gemini' });
    app = await _electron.launch(launchOpts({ PATH: path.dirname(process.execPath) + ';C:\\Windows\\System32' }));
    box = await app.firstWindow();
    await box.waitForSelector('.card', { timeout: 20000 });
    await box.locator('.chip').first().click();
    [win] = await Promise.all([app.waitForEvent('window'), box.locator('.card', { hasText: /Open Recipes Project/ }).first().click()]);
    await win.waitForSelector('.step', { timeout: 15000 });
    t = '';
    for (let i = 0; i < 40 && !/isn't installed/.test(t); i++) { await win.waitForTimeout(250); t = await win.evaluate(() => document.querySelector('.xterm-rows')?.innerText || ''); }
    ok('a missing AI app explains how to install it', /isn't installed/.test(t) && /npm install -g @google\/gemini-cli/.test(t));
    ok('and the how-to stays readable', await win.locator('#overlay').isHidden());
    await win.screenshot({ path: path.join(__dirname, 'shots', 'ai-not-installed.png') });
    await app.close();
  }

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
