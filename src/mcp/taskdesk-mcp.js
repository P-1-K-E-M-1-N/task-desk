// Tiny MCP server that the chat's `claude` starts for one task. It gives Claude
// six tools to keep that task's plan up to date: read the plan, tick a step /
// comment on it, add to the user's notes, snooze the task until a day the
// user asked for, say what it's doing (for the project's other chats), and
// send a note to the project's main chat. Every call is forwarded to the Task
// Desk app over a local connection (127.0.0.1 + a secret token), and the app
// only lets it change the task it was started for.
// Runs under Electron's Node (ELECTRON_RUN_AS_NODE=1); no dependencies.
const http = require('http');
const readline = require('readline');

const PORT = Number(process.env.TASKDESK_PORT);
// The chat's own token, from the file the app made for it (never on a command line).
let TOKEN = '';
try {
  TOKEN = require('fs').readFileSync(process.env.TASKDESK_TOKEN_FILE, 'utf8').trim();
} catch {}
const TASK = process.env.TASKDESK_TASK;

const TOOLS = [
  {
    name: 'get_task',
    description:
      "Show the user's current task in Task Desk: the task text, the plan's numbered steps with which ones are already done and any comments on them, and his notes for the factory. Check this before picking the work up, so you know what's already done.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'update_step',
    description:
      "Update one step of this task's plan in Task Desk: tick it done (or un-tick it) and/or leave a short comment on it (what happened, what's left, a result). Use it as soon as a step is finished or the user says they did it. They see the change right away.",
    inputSchema: {
      type: 'object',
      properties: {
        step: { type: 'integer', minimum: 1, description: 'Step number as shown in the plan (1 = first step).' },
        done: { type: 'boolean', description: 'true = done, false = not done. Leave out to keep it as it is.' },
        comment: {
          type: 'string',
          description:
            'Short comment shown under the step. Replaces the previous comment; an empty string removes it. Leave out to keep it.',
        },
      },
      required: ['step'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_note',
    description:
      "Add a line to this task's notes box in Task Desk (results, replies, dates, anything worth keeping). It's appended, never replaces what's there. The user still presses Done themselves.",
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The text to add.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'snooze_task',
    description:
      'Put this task away until a day, when the user asks for that (for example the work is done for now and something is due back on a date). Agree the day with the user first, then call this. The task leaves their box and comes back that morning at 8; this window stays open until they close it. Never snooze on your own.',
    inputSchema: {
      type: 'object',
      properties: {
        until: { type: 'string', description: 'The day it comes back: YYYY-MM-DD, or "tomorrow" or "next week".' },
        reason: { type: 'string', description: 'Optional one line for their notes, e.g. "Waiting for the quote from Mike, due Nov 14".' },
      },
      required: ['until'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_status',
    description:
      "One line on what this chat is doing now, or just finished (e.g. 'Editing src/app.js: adding the login form', 'Login form done, tests pass'). The project's other task chats see it (get_task, under others) and so does the user's box. Call it when you start on something and when it's done, so nobody does the same work twice.",
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'What you are doing or just did, one line.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'tell_main_chat',
    description:
      "Send a short note (two or three lines) to the project's main chat: the user's own Claude Code session that plans this project and writes its task list. Use it when this task changed or found something the plan should know (a decision, a file that moved, a blocker), not for routine progress. Task Desk delivers it when that chat is open and free, else keeps it until it opens. Task Desk sends its own note when the task is finished, so don't repeat the Done summary.",
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The note, as plain text.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
];

function callApp(tool, args) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ token: TOKEN, task: TASK, tool, args: args || {} });
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: '/call',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: false, error: 'Bad reply from Task Desk' });
          }
        });
      }
    );
    req.on('error', () => resolve({ ok: false, error: 'Task Desk is not reachable (is the task window still open?)' }));
    req.setTimeout(10000, () => req.destroy());
    req.end(body);
  });
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notifications need no reply
  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: (params && params.protocolVersion) || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'taskdesk', version: '1.0.0' },
      },
    });
  }
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  if (method === 'tools/call') {
    const r = await callApp(params.name, params.arguments);
    const text = r.ok ? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2)) : r.error || 'Failed';
    return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: !r.ok } });
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method ${method}` } });
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  handle(msg).catch((e) => msg.id !== undefined && send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } }));
});
