// Which AI runs the task chats and writes the plans.
//
// Each one is that company's own terminal app, signed in with your own account,
// so there are no API keys:
//   claude  Claude Code (Anthropic)  - the default, with every feature
//   codex   Codex (OpenAI)           - sign in with a ChatGPT account
//   gemini  Gemini CLI (Google)      - sign in with a Google account
// The desk has one choice (⋯ menu), and a project can pick its own (box 9).
//
// Claude Code's chats fork the factory's newest session (see chat.js); the
// others start fresh with the task brief and resume their own last chat. All of
// them get the Task Desk tools (tick a step, comment, add a note) over MCP.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('./config');
const state = require('./state');
const { claudeExe } = require('./sessions');

const PROVIDERS = {
  claude: {
    id: 'claude', name: 'Claude', app: 'Claude Code', cmd: 'claude',
    install: 'npm install -g @anthropic-ai/claude-code', signin: 'claude', signinNote: 'then follow the sign-in steps',
  },
  codex: {
    id: 'codex', name: 'OpenAI', app: 'Codex', cmd: 'codex',
    install: 'npm install -g @openai/codex', signin: 'codex login', signinNote: 'sign in with your ChatGPT account',
  },
  gemini: {
    id: 'gemini', name: 'Google Gemini', app: 'Gemini CLI', cmd: 'gemini',
    install: 'npm install -g @google/gemini-cli', signin: 'gemini', signinNote: 'choose "Sign in with Google"',
  },
};
const IDS = Object.keys(PROVIDERS);

// The AI for a task, first match wins:
//   1. switched for this task in its chat panel   (task state .ai)
//   2. its project's choice                        (Edit project, box 9)
//   3. the desk's default                          (mini window footer / ⋯ menu)
function pick(task) {
  return PROVIDERS[source(task).id] || PROVIDERS.claude;
}
function source(task) {
  const st = task && state.has(task.id) ? state.task(task.id) : {};
  if (PROVIDERS[st.ai]) return { id: st.ai, from: 'task' };
  if (task && PROVIDERS[task.ai]) return { id: task.ai, from: 'project' };
  return { id: PROVIDERS[config.get().ai] ? config.get().ai : 'claude', from: 'desk' };
}

// Each AI keeps its own chat per task, so switching back resumes it.
// (Older tasks only have chatSessionId, from before there was a choice.)
function sessionFor(st, id) {
  if (st.chats && st.chats[id]) return st.chats[id];
  return (st.chatAi || 'claude') === id ? st.chatSessionId || null : null;
}

// ---------- handing a task over to another AI ----------
// When you switch AI mid-task, the new one is told what the last one and the
// user said. It comes from the saved conversation where possible (clean text), else
// from what the chat panel showed. The plan's ticks, comments and notes travel
// anyway: every AI reads them with the get_task tool.
const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b[=>78]/g;
function screenText(buf) {
  const lines = String(buf || '').replace(ANSI, '').replace(/\r(?!\n)/g, '\n').split(/\r?\n/)
    .map((l) => l.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trimEnd())
    .filter((l, i, a) => l.trim() && l !== a[i - 1]);
  return lines.join('\n');
}
function savedConversation(p, sid, workDir) {
  let file = null;
  if (p.id === 'claude' && sid) file = require('./sessions').sessionFile(workDir, sid);
  if (p.id === 'codex' && sid) file = codexFile(sid);
  if (!file) return '';
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return ''; }
  const out = [];
  for (const line of text.split('\n')) {
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    let role = null, content = null;
    if (p.id === 'claude' && (j.type === 'user' || j.type === 'assistant') && j.message) { role = j.type; content = j.message.content; }
    if (p.id === 'codex' && j.type === 'response_item' && j.payload && j.payload.type === 'message') { role = j.payload.role; content = j.payload.content; }
    if (!role || role === 'system' || role === 'developer') continue;
    const said = typeof content === 'string' ? content
      : Array.isArray(content) ? content.filter((c) => c && typeof c.text === 'string' && /text/.test(c.type || 'text')).map((c) => c.text).join('\n') : '';
    if (said.trim()) out.push(`${role === 'user' ? config.userName() || 'User' : p.name}: ${said.trim()}`);
  }
  return out.slice(1).join('\n\n'); // the first message is the task brief, which the new AI gets anyway
}
function codexFile(sid) {
  const root = path.join(codexHome(), 'sessions');
  const walk = (dir, depth) => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return null; }
    for (const n of names.sort().reverse()) {
      const f = path.join(dir, n);
      if (depth < 3) { const r = walk(f, depth + 1); if (r) return r; } else if (n.includes(sid)) return f;
    }
    return null;
  };
  return walk(root, 0);
}
// The hand-over note for the next AI (empty when there's nothing to pass on).
function handover(from, sid, workDir, screen) {
  let said = savedConversation(from, sid, workDir);
  if (!said) said = screenText(screen);
  said = said.trim();
  if (!said) return '';
  if (said.length > 6000) said = '…' + said.slice(-6000);
  return `${config.userName() || 'The user'} just switched this task over to you from ${from.name} (${from.app}). The plan's ticks, comments and notes are up to date (check them with get_task). Here is the end of that conversation, so you can carry on where it left off:\n---\n${said}\n---`;
}

// Tests swap in a pretend AI: TASKDESK_FAKE_AI (or TASKDESK_FAKE_CLAUDE) = "<node.exe>|<script.js>".
function fake() {
  const f = process.env.TASKDESK_FAKE_AI || process.env.TASKDESK_FAKE_CLAUDE;
  if (!f) return null;
  const [exe, script] = f.split('|');
  return { exe, pre: [script], env: {} };
}

// How to start a provider's app on this computer: { exe, pre (arguments that
// go first), env }, or null if it isn't installed. npm installs a .cmd shim on
// Windows, and starting that through cmd.exe would mangle our arguments, so
// we start the real program the shim points at.
const found = new Map();
const missing = new Map(); // id -> when we last looked and it wasn't there (look again after a minute)
function locate(p) {
  const f = fake();
  if (f) return f;
  if (found.has(p.id)) return found.get(p.id);
  if (Date.now() - (missing.get(p.id) || 0) < 60 * 1000) return null;
  let r = null;
  if (p.id === 'claude') {
    const exe = claudeExe();
    r = exe === 'claude.exe' && !onPath('claude') ? null : { exe, pre: [], env: {} };
  } else {
    r = fromPath(p.cmd);
  }
  if (r) found.set(p.id, r); else missing.set(p.id, Date.now());
  return r;
}
const forget = () => { found.clear(); missing.clear(); };

function onPath(cmd) {
  try { return execFileSync('where', [cmd], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).filter(Boolean); } catch { return null; }
}
function fromPath(cmd) {
  const hits = onPath(cmd);
  if (!hits) return null;
  const exe = hits.find((h) => /\.exe$/i.test(h));
  if (exe) return { exe, pre: [], env: {} };
  const shim = hits.find((h) => /\.cmd$/i.test(h));
  if (!shim) return null;
  let text = '';
  try { text = fs.readFileSync(shim, 'utf8'); } catch { return null; }
  const m = text.match(/"%dp0%\\([^"]+\.(exe|js|cjs|mjs))"/i);
  if (!m) return null;
  const target = path.join(path.dirname(shim), m[1]);
  if (!fs.existsSync(target)) return null;
  if (/\.exe$/i.test(target)) return { exe: target, pre: [], env: {} };
  // A Node.js script: the system Node if there is one, else Electron's own.
  const node = (onPath('node') || []).find((h) => /\.exe$/i.test(h));
  return node ? { exe: node, pre: [target], env: {} } : { exe: process.execPath, pre: [target], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

// What to show in the chat panel when the app isn't installed.
function missingText(p) {
  return [
    `\x1b[1m${p.app} (${p.name}) isn't installed on this computer.\x1b[0m`,
    '',
    'To use it, open a terminal (PowerShell) and run:',
    `   ${p.install}`,
    `   ${p.signin}      (${p.signinNote})`,
    '',
    'Then press Fresh chat (top right of this panel).',
    '',
    'Or pick another AI: in the ⋯ menu (AI for chats and plans),',
    'or for one project in its Edit project form (box 9).',
  ].join('\r\n');
}

// ---------- chats ----------

// TOML literal string: no escaping inside single quotes (fine for Windows paths).
const toml = (s) => `'${String(s).replace(/'/g, '')}'`;

// Arguments that give a chat the Task Desk tools. spec = { command, args, env }.
function toolArgs(p, spec, taskId) {
  if (!spec) return { args: [], env: {} };
  if (p.id === 'codex') {
    const env = Object.entries(spec.env).map(([k, v]) => `${k}=${toml(v)}`).join(',');
    return {
      args: ['-c', `mcp_servers.taskdesk.command=${toml(spec.command)}`,
        '-c', `mcp_servers.taskdesk.args=[${spec.args.map(toml).join(',')}]`,
        '-c', `mcp_servers.taskdesk.env={${env}}`],
      env: {},
    };
  }
  if (p.id === 'gemini') {
    // Gemini reads MCP servers from a settings file; this one is just for this task's chat.
    const file = path.join(config.LOCAL_DIR, 'mcp', `${taskId}.gemini.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { taskdesk: { ...spec, trust: true } } }, null, 2));
    return { args: [], env: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: file } };
  }
  return { args: [], env: {} };
}

// How a Codex or Gemini chat starts: fresh with the task brief, or resuming.
// edits: may it change files in the folder (Codex enforces this; Gemini asks
// before every change and the brief says not to).
function chatArgs(p, { brief, resume, sessionId, edits }) {
  if (p.id === 'codex') {
    const opts = ['--sandbox', edits ? 'workspace-write' : 'read-only', '--ask-for-approval', 'on-request'];
    // On resume, `brief` is an optional note to send (e.g. what happened while another AI had the task).
    if (resume) return [...opts, 'resume', ...(sessionId ? [sessionId] : ['--last']), ...(brief ? [brief] : [])];
    return [...opts, brief];
  }
  if (p.id === 'gemini') {
    if (resume) return ['--resume', 'latest', ...(brief ? ['--prompt-interactive', brief] : [])];
    return ['--prompt-interactive', brief];
  }
  return [];
}

// Codex picks its own session ids. Find the one this chat just started: the
// newest session file for this folder made after `since`.
function codexHome() { return process.env.CODEX_HOME || path.join(os.homedir(), '.codex'); }
function findCodexSession(workDir, since) {
  const root = path.join(codexHome(), 'sessions');
  const days = [];
  for (const d of [new Date(since), new Date()]) {
    const dir = path.join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    if (!days.includes(dir)) days.push(dir);
  }
  const want = path.resolve(workDir).toLowerCase();
  let best = null;
  for (const dir of days) {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')); } catch { continue; }
    for (const n of names) {
      const f = path.join(dir, n);
      let st;
      try { st = fs.statSync(f); } catch { continue; }
      if (st.birthtimeMs < since - 2000 && st.mtimeMs < since) continue;
      let meta = null;
      try { meta = JSON.parse(fs.readFileSync(f, 'utf8').split('\n')[0]); } catch { continue; }
      const m = (meta && meta.payload) || meta || {};
      if (!m.cwd || path.resolve(m.cwd).toLowerCase() !== want) continue;
      const id = m.id || (n.match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i) || [])[1];
      if (id && (!best || st.birthtimeMs > best.t)) best = { id, t: st.birthtimeMs };
    }
  }
  return best && best.id;
}

// ---------- plans ----------

// The plan writer's command for Codex and Gemini (Claude's is in planner.js).
// Both get the prompt on stdin and only read files.
function planArgs(p, outFile) {
  if (p.id === 'codex') return ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', '--output-last-message', outFile, '-'];
  if (p.id === 'gemini') return ['--prompt', 'Follow the instructions above and reply with the JSON only.', '--output-format', 'json'];
  return [];
}
const PLAN_TAIL = (schema) => `\n\nReply with ONLY the plan as one JSON object (no other text, no code fences). It must match this JSON schema:\n${JSON.stringify(schema)}`;

// The plan from what the app printed (Gemini) or saved (Codex).
function readPlan(p, stdout, outFile) {
  let text = stdout;
  if (p.id === 'codex') { try { text = fs.readFileSync(outFile, 'utf8'); } catch { text = ''; } }
  if (p.id === 'gemini') { try { const j = JSON.parse(stdout); text = j.response || ''; } catch {} }
  return jsonIn(text);
}

// The first JSON object in some text (models sometimes wrap it in ``` fences).
function jsonIn(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

// What the AI pickers show: each AI, whether it's installed, and which is in use.
function choices(task) {
  const deskId = PROVIDERS[config.get().ai] ? config.get().ai : 'claude';
  return {
    desk: deskId,
    current: task ? source(task) : { id: deskId, from: 'desk' },
    project: task && PROVIDERS[task.ai] ? task.ai : null,
    list: IDS.map((id) => ({ id, name: PROVIDERS[id].name, app: PROVIDERS[id].app, installed: !!locate(PROVIDERS[id]) })),
  };
}

module.exports = { PROVIDERS, IDS, pick, source, sessionFor, handover, screenText, choices, locate, forget, missingText, toolArgs, chatArgs, findCodexSession, planArgs, PLAN_TAIL, readPlan, jsonIn };
