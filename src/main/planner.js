// Generates a step-by-step plan per task by running the task's AI headless
// with read-only tools: Claude Code (`claude -p`), or Codex / Gemini (see ai.js).
// Plans are cached in data/plans/<mode>/ and regenerated only when the task's
// text changes.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const config = require('./config');
const { cleanEnv } = require('./sessions');
const ai = require('./ai');
const { TYPES } = require('./tasks');

const ACTIONS = [
  'gmail_draft',
  'open_folder',
  'copy_text',
  'open_url',
  'paste_box',
  'decision',
  'open_file',
  'keyword_planner',
  'email_list',
  'env_key',
  'ask_claude',
  'none',
];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'type', 'est_minutes', 'steps', 'files'],
  properties: {
    summary: { type: 'string' },
    type: { type: 'string', enum: TYPES },
    est_minutes: { type: 'integer' },
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
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

// Lanes-workspace plans go in plans/<mode>/, other projects' plans in plans/projects/.
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
  try {
    fs.unlinkSync(file(task));
  } catch {}
  // A redraft with news (task.recentChange) replaces a queued plain one.
  const i = queue.findIndex((t) => t.id === task.id);
  if (i >= 0) queue.splice(i, 1);
  if (!running.has(task.id)) queue.unshift(task);
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
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depth < 1 && e.name !== 'data') walk(p, depth + 1);
      } else out.push(p);
    }
  };
  walk(laneDir, 0);
  return out.slice(0, 80);
}

// Who the plan is for: their name and, if they gave one, a line about them.
const intro = () => {
  const about = String(config.get().userAbout || '').trim();
  return `You are planning one task for ${config.who()}${about ? `, ${about.replace(/^[,\s]+|[.\s]+$/g, '')}` : ''}. Read any files the task mentions (read-only; never change anything). Then return the plan as JSON matching the schema.`;
};

function prompt(task) {
  if (isProject(task)) return projectPrompt(task);
  let laneMd = '';
  try {
    laneMd = fs.readFileSync(path.join(task.laneDir, 'LANE.md'), 'utf8').slice(0, 15000);
  } catch {}
  return `${intro()}

TASK (from the ${config.factoryName()} workspace's ops/NEEDS_NICK.md, lane: ${task.lane}):
${task.rawText}

LANE FOLDER: ${task.laneDir}
WORKSPACE ROOT: ${config.root()}
(Relative paths in the task like lanes/x/... are relative to the workspace root.)

FILES IN THE LANE FOLDER:
${listFiles(task.laneDir).join('\n')}

LANE.md:
${laneMd || '(none)'}
${recent(task)}
${rules('Never plan to edit workspace files: results go back through the Done notes.')}`;
}

function projectPrompt(task) {
  const folder = task.projectFolder;
  let readme = '';
  for (const f of ['CLAUDE.md', 'README.md']) {
    try {
      readme = fs.readFileSync(path.join(folder, f), 'utf8').slice(0, 8000);
      if (readme) {
        readme = `${f}:\n${readme}`;
        break;
      }
    } catch {}
  }
  const from =
    task.lane === 'my-list' ? 'typed into Task Desk' : `from ${task.sourceFile}${task.lane !== 'general' ? `, section: ${task.lane}` : ''}`;
  return `${intro()}

TASK (project "${task.projectName}", ${from}):
${task.rawText}

PROJECT FOLDER: ${folder || '(none: this project is just a list)'}
${folder ? `(Relative paths in the task are relative to this folder.)\n\nFILES IN THE PROJECT FOLDER:\n${listFiles(folder).join('\n')}` : ''}
${task.planNotes ? `\nNOTES FOR PLANNING THIS PROJECT:\n${task.planNotes}\n` : ''}
${readme || ''}
${recent(task)}
${rules(task.allowEdits ? 'The chat beside the plan may change files in the project folder when a step needs it.' : `Never plan to change project files without ${config.who()} asking: results go back through the Done notes.`)}`;
}

// A task finished just now that changes this one (see catchUp in main.js).
function recent(task) {
  const r = task.recentChange;
  if (!r) return '';
  return `
JUST FINISHED: ${config.who()} just finished the task "${r.title}".${r.notes ? ` Their notes: ${r.notes}` : ''}
Why this task changes: ${r.why}
Plan with that in mind: skip what is already done, use answers they gave, and say in the summary what changed.
`;
}

function rules(last) {
  const who = config.who();
  return `RULES FOR THE PLAN
- summary: 2-3 plain sentences: what this is and what "done" looks like. Talk to ${who} as "you".
- type: the kind of work ${who} does, one of:
  outreach (send emails or fill in contact forms to businesses or people),
  ask (put a question to an outside person or office and wait for the answer),
  info (${who} tells the agents a fact only they know: a name, an address, a login email, or types a reply),
  decide (a real choice between options),
  account (create an account, sign up, or prove identity on a website),
  setup (change settings on a website: turn on an API, get a key, give permissions, connect services),
  qa (check, look over or test something an agent made),
  research (look up numbers or facts on a website, e.g. keyword volumes).
- est_minutes: honest estimate for ${who}.
- steps: 3-7 concrete steps in order, each one short. Attach ONE action where a click helps:
  gmail_draft {to, subject, body}: one email with a known address. Write the full ready-to-send text.
  email_list {file}: the task is sending a batch of drafts from an outreach emails.md. file = absolute path to that emails.md. The app shows one row per draft with copy and Gmail buttons, so do NOT copy the drafts into the plan.
  open_folder {path}: e.g. the folder holding attachments.
  copy_text {text}: a message, subject line or list ${who} will paste somewhere (e.g. a web form).
  open_url {url}
  keyword_planner {queries: [..]}: the exact keyword queries, copied in full from the source file.
  paste_box {label}: ${who} pastes results or a reply. The app keeps it and hands it back with the Done notes. Never add a save path.
  decision {options: [..], recommended}: options as short labels; recommended must equal one option.
  env_key {signup_url, env_path, var_name}: only when the task explicitly names the .env file and variable.
  open_file {path}: absolute path to a draft, sample or LANE.md.
- files: absolute paths worth opening.
- ${who} sends, submits, signs up and pays for things themselves. Never plan for an agent to do that. ${last}`;
}

// One run of the plan writer. Claude Code returns the plan checked against the
// schema; Codex and Gemini are asked for the JSON and it's checked in validate().
function runAI(task, input = prompt(task), schema = SCHEMA) {
  const p = ai.pick(task);
  const loc = ai.locate(p);
  if (!loc) return Promise.resolve({ error: `${p.app} (${p.name}) isn't installed on this computer` });
  if (p.id !== 'claude') return runOther(p, loc, task, input, schema);
  return new Promise((resolve) => {
    const args = [
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
      '--tools',
      'Read',
      'Glob',
      'Grep',
      '--no-session-persistence',
    ];
    if (config.get().plannerModel) args.push('--model', config.get().plannerModel);
    let out = '';
    let err = '';
    const p = spawn(loc.exe, [...loc.pre, ...args], { cwd: task.laneDir, windowsHide: true, env: cleanEnv(loc.env) });
    const kill = setTimeout(() => p.kill(), 5 * 60 * 1000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      clearTimeout(kill);
      resolve({ error: e.message });
    });
    p.on('close', () => {
      clearTimeout(kill);
      try {
        const j = JSON.parse(out);
        resolve({ plan: j.structured_output || JSON.parse(j.result), cost: j.total_cost_usd });
      } catch {
        resolve({ error: (err || out).slice(0, 500) || 'no output' });
      }
    });
    p.stdin.end(input);
  });
}

function runOther(p, loc, task, input, schema) {
  return new Promise((resolve) => {
    const outFile = path.join(config.LOCAL_DIR, 'mcp', `plan-${task.id}.txt`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    try {
      fs.unlinkSync(outFile);
    } catch {}
    let out = '';
    let err = '';
    const proc = spawn(loc.exe, [...loc.pre, ...ai.planArgs(p, outFile)], { cwd: task.laneDir, windowsHide: true, env: cleanEnv(loc.env) });
    const kill = setTimeout(() => proc.kill(), 5 * 60 * 1000);
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', (e) => {
      clearTimeout(kill);
      resolve({ error: e.message });
    });
    proc.on('close', () => {
      clearTimeout(kill);
      const plan = ai.readPlan(p, out, outFile);
      try {
        fs.unlinkSync(outFile);
      } catch {}
      resolve(plan ? { plan } : { error: (err || out).slice(0, 500) || 'no output' });
    });
    proc.stdin.end(input + ai.PLAN_TAIL(schema));
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
    steps: [{ text: 'Ask the chat panel how to get this done.', action: 'ask_claude', data: {} }],
    files: [],
    error,
  };
}

async function make(task) {
  let plan = null;
  let error = null;
  for (let attempt = 0; attempt < 2 && !plan; attempt++) {
    const r = await runAI(task);
    plan = validate(r.plan);
    if (!plan) error = r.error || 'invalid plan JSON';
  }
  const rec = {
    id: task.id,
    textHash: task.textHash,
    generatedAt: new Date().toISOString(),
    ok: !!plan,
    plan: plan || fallback(task, error),
  };
  if (task.recentChange) rec.updatedAfter = { title: task.recentChange.title, why: task.recentChange.why };
  fs.writeFileSync(file(task), JSON.stringify(rec, null, 2));
  events.emit('ready', task.id);
}

// After a task is finished: which of the other open tasks does it change?
// One AI run reads the finished task and the open tasks' plans and names the
// ones whose plan should be redrafted, with a one-line reason each.
const AFFECTED = {
  type: 'object',
  additionalProperties: false,
  required: ['affected'],
  properties: {
    affected: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'why'],
        properties: { id: { type: 'string' }, why: { type: 'string' } },
      },
    },
  },
};

function affectedPrompt(done, others) {
  const who = config.who();
  const list = others
    .map((t) => {
      const c = cached(t);
      const steps = c && c.plan ? c.plan.steps.map((s, i) => `${i + 1}) ${s.text}`).join(' ') : '(no plan yet)';
      return `- id: ${t.id}\n  task: ${t.text.slice(0, 400)}\n  plan: ${c && c.plan ? c.plan.summary : ''} ${steps}`.slice(0, 1500);
    })
    .join('\n');
  const notes = done.notes ? `THEIR NOTES: ${done.notes}\n` : '';
  const results = done.results.length
    ? `THEIR RESULTS:\n${done.results.map((r) => `- ${r.label}: ${String(r.value).slice(0, 500)}`).join('\n')}\n`
    : '';
  return `${who} just finished a task. Decide which of their other open tasks need a new plan because of it. Read files only if you must (read-only).

FINISHED TASK: ${done.text}
${notes}${results}
OPEN TASKS:
${list}

Include a task only when its plan is now wrong or out of date: a step is already done, it now has an answer or account it was waiting for, a decision changes what to do, or it is no longer needed. Leave out tasks that are merely related. Usually that is none or one or two.
why: one short sentence to ${who} as "you", e.g. "You already made the RevenueCat account, so step 1 is gone."`;
}

// run is the AI runner (tests pass a pretend one).
async function affected(done, others, run = runAI) {
  if (!others.length) return [];
  const r = await run(done, affectedPrompt(done, others), AFFECTED);
  const list = r.plan && Array.isArray(r.plan.affected) ? r.plan.affected : [];
  const ids = new Set(others.map((t) => t.id));
  const seen = new Set();
  return list
    .filter((a) => a && ids.has(a.id) && typeof a.why === 'string' && !seen.has(a.id) && seen.add(a.id))
    .map((a) => ({ id: a.id, why: a.why.trim().slice(0, 300) }));
}

module.exports = { ensure, cached, status, regenerate, events, prompt, affected, affectedPrompt };
