// Generates a step-by-step plan per task by running Claude Code headless
// (`claude -p`) with read-only tools. Plans are cached in data/plans/<mode>/
// and regenerated only when the task's text changes.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const config = require('./config');
const { claudeExe, cleanEnv } = require('./sessions');

const ACTIONS = ['gmail_draft', 'open_folder', 'copy_text', 'open_url', 'paste_box', 'decision', 'open_file',
  'keyword_planner', 'email_list', 'env_key', 'ask_claude', 'none'];
const TYPES = ['email', 'keywords', 'decision', 'signup', 'review', 'question'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'type', 'est_minutes', 'steps', 'files'],
  properties: {
    summary: { type: 'string' },
    type: { type: 'string', enum: TYPES },
    est_minutes: { type: 'integer' },
    steps: {
      type: 'array', minItems: 1, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false, required: ['text'],
        properties: { text: { type: 'string' }, action: { type: 'string', enum: ACTIONS }, data: { type: 'object' } },
      },
    },
    files: { type: 'array', items: { type: 'string' } },
  },
};

const events = new EventEmitter();
const queue = [];
const running = new Set();
const MAX_PARALLEL = 2;

// Idea Factory plans go in plans/<mode>/, other projects' plans in plans/projects/.
const isProject = (task) => !!task.project && task.project !== 'factory';
const dir = (task) => {
  const d = path.join(config.PLANS_DIR, isProject(task) ? 'projects' : config.get().mode);
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const file = (task) => path.join(dir(task), task.id + '.json');

function cached(task) {
  try {
    const c = JSON.parse(fs.readFileSync(file(task), 'utf8'));
    return c.textHash === task.textHash ? c : null;
  } catch {
    return null;
  }
}

function status(task) {
  if (running.has(task.id)) return 'drafting';
  if (queue.some((t) => t.id === task.id)) return 'queued';
  return cached(task) ? 'ready' : 'missing';
}

function ensure(tasks) {
  for (const t of tasks) if (status(t) === 'missing') queue.push(t);
  pump();
}

function regenerate(task) {
  try { fs.unlinkSync(file(task)); } catch {}
  if (!running.has(task.id) && !queue.some((t) => t.id === task.id)) queue.unshift(task);
  pump();
}

function pump() {
  while (running.size < MAX_PARALLEL && queue.length) {
    const t = queue.shift();
    running.add(t.id);
    events.emit('status', t.id, 'drafting');
    make(t).finally(() => {
      running.delete(t.id);
      events.emit('status', t.id, 'ready');
      pump();
    });
  }
}

function listFiles(laneDir) {
  const out = [];
  const walk = (d, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 1 && e.name !== 'data') walk(p, depth + 1); } else out.push(p);
    }
  };
  walk(laneDir, 0);
  return out.slice(0, 80);
}

const INTRO = 'You are planning one task for Nick, a solo builder who directs AI agents and does not write code. Read any files the task mentions (read-only; never change anything). Then return the plan as JSON matching the schema.';

function prompt(task) {
  if (isProject(task)) return projectPrompt(task);
  let laneMd = '';
  try { laneMd = fs.readFileSync(path.join(task.laneDir, 'LANE.md'), 'utf8').slice(0, 15000); } catch {}
  return `${INTRO}

TASK (from ops/NEEDS_NICK.md, lane: ${task.lane}):
${task.rawText}

LANE FOLDER: ${task.laneDir}
FACTORY ROOT: ${config.root()}
(Relative paths in the task like lanes/x/... are relative to the factory root.)

FILES IN THE LANE FOLDER:
${listFiles(task.laneDir).join('\n')}

LANE.md:
${laneMd || '(none)'}

${rules('Never plan to edit factory files: results go back through the Done notes.')}`;
}

function projectPrompt(task) {
  const folder = task.projectFolder;
  let readme = '';
  for (const f of ['CLAUDE.md', 'README.md']) {
    try { readme = fs.readFileSync(path.join(folder, f), 'utf8').slice(0, 8000); if (readme) { readme = `${f}:\n${readme}`; break; } } catch {}
  }
  const from = task.lane === 'my-list' ? 'typed into Task Desk' : `from ${task.sourceFile}${task.lane !== 'general' ? `, section: ${task.lane}` : ''}`;
  return `${INTRO}

TASK (project "${task.projectName}", ${from}):
${task.rawText}

PROJECT FOLDER: ${folder || '(none: this project is just a list)'}
${folder ? `(Relative paths in the task are relative to this folder.)\n\nFILES IN THE PROJECT FOLDER:\n${listFiles(folder).join('\n')}` : ''}
${task.planNotes ? `\nNICK'S NOTES FOR PLANNING THIS PROJECT:\n${task.planNotes}\n` : ''}
${readme || ''}

${rules(task.allowEdits ? 'The chat beside the plan may change files in the project folder when a step needs it.' : 'Never plan to change project files without Nick asking: results go back through the Done notes.')}`;
}

function rules(last) {
  return `RULES FOR THE PLAN
- summary: 2-3 plain sentences: what this is and what "done" looks like. Talk to Nick as "you".
- type: email (sending messages), keywords (keyword research), decision (pick an option), signup (create an account or get an API key), review (read or check something), question (ask someone a question).
- est_minutes: honest estimate for Nick.
- steps: 3-7 concrete steps in order, each one short. Attach ONE action where a click helps:
  gmail_draft {to, subject, body}: one email with a known address. Write the full ready-to-send text.
  email_list {file}: the task is sending a batch of drafts from an outreach emails.md. file = absolute path to that emails.md. The app shows one row per draft with copy and Gmail buttons, so do NOT copy the drafts into the plan.
  open_folder {path}: e.g. the folder holding attachments.
  copy_text {text}: a message, subject line or list Nick will paste somewhere (e.g. a web form).
  open_url {url}
  keyword_planner {queries: [..]}: the exact keyword queries, copied in full from the source file.
  paste_box {label}: Nick pastes results or a reply. The app keeps it and hands it back with the Done notes. Never add a save path.
  decision {options: [..], recommended}: options as short labels; recommended must equal one option.
  env_key {signup_url, env_path, var_name}: only when the task explicitly names the .env file and variable.
  open_file {path}: absolute path to a draft, sample or LANE.md.
- files: absolute paths worth opening.
- Nick sends, submits, signs up and pays for things himself. Never plan for an agent to do that. ${last}`;
}

function runClaude(task) {
  return new Promise((resolve) => {
    const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA),
      '--tools', 'Read', 'Glob', 'Grep', '--no-session-persistence'];
    if (config.get().plannerModel) args.push('--model', config.get().plannerModel);
    let out = '';
    let err = '';
    const p = spawn(claudeExe(), args, { cwd: task.laneDir, windowsHide: true, env: cleanEnv() });
    const kill = setTimeout(() => p.kill(), 5 * 60 * 1000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(kill); resolve({ error: e.message }); });
    p.on('close', () => {
      clearTimeout(kill);
      try {
        const j = JSON.parse(out);
        resolve({ plan: j.structured_output || JSON.parse(j.result), cost: j.total_cost_usd });
      } catch {
        resolve({ error: (err || out).slice(0, 500) || 'no output' });
      }
    });
    p.stdin.end(prompt(task));
  });
}

function validate(p) {
  if (!p || typeof p.summary !== 'string' || !Array.isArray(p.steps) || !p.steps.length) return null;
  const steps = p.steps
    .filter((s) => s && typeof s.text === 'string' && s.text.trim())
    .slice(0, 10)
    .map((s) => {
      const action = ACTIONS.includes(s.action) ? s.action : 'none';
      const data = s.data && typeof s.data === 'object' ? { ...s.data } : {};
      delete data.save_to;
      if (action === 'decision' && !Array.isArray(data.options)) return { text: s.text, action: 'none', data: {} };
      return { text: s.text.trim(), action, data };
    });
  if (!steps.length) return null;
  return {
    summary: p.summary.trim(),
    type: TYPES.includes(p.type) ? p.type : null,
    est_minutes: Number.isFinite(p.est_minutes) ? Math.max(1, Math.round(p.est_minutes)) : null,
    steps,
    files: Array.isArray(p.files) ? p.files.filter((f) => typeof f === 'string') : [],
  };
}

function fallback(task, error) {
  return {
    summary: task.text,
    type: task.type,
    est_minutes: task.minutes,
    steps: [{ text: 'Ask Claude in the chat panel how to get this done.', action: 'ask_claude', data: {} }],
    files: [],
    error,
  };
}

async function make(task) {
  let plan = null;
  let error = null;
  for (let attempt = 0; attempt < 2 && !plan; attempt++) {
    const r = await runClaude(task);
    plan = validate(r.plan);
    if (!plan) error = r.error || 'invalid plan JSON';
  }
  const rec = { id: task.id, textHash: task.textHash, generatedAt: new Date().toISOString(), ok: !!plan, plan: plan || fallback(task, error) };
  fs.writeFileSync(file(task), JSON.stringify(rec, null, 2));
  events.emit('ready', task.id);
}

module.exports = { ensure, cached, status, regenerate, events, prompt };
