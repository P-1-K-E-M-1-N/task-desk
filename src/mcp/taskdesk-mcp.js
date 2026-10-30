// Tiny MCP server that the chat's `claude` starts for one task. It gives Claude
// three tools to keep that task's plan up to date: read the plan, tick a step /
// comment on it, and add to the user's notes. Every call is forwarded to the Task
// Desk app over a local connection (127.0.0.1 + a secret token), and the app
// only lets it change the task it was started for.
// Runs under Electron's Node (ELECTRON_RUN_AS_NODE=1); no dependencies.
const http = require('http');
const readline = require('readline');

const PORT = Number(process.env.TASKDESK_PORT);
const TOKEN = process.env.TASKDESK_TOKEN;
const TASK = process.env.TASKDESK_TASK;

const TOOLS = [
  {
    name: 'get_task',
    description: "Show the user's current task in Task Desk: the task text, the plan's numbered steps with which ones are already done and any comments on them, and his notes for the factory. Check this before picking the work up, so you know what's already done.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'update_step',
    description: "Update one step of this task's plan in Task Desk: tick it done (or un-tick it) and/or leave a short comment on it (what happened, what's left, a result). Use it as soon as a step is finished or the user says they did it. They see the change right away.",
    inputSchema: {
      type: 'object',
      properties: {
        step: { type: 'integer', minimum: 1, description: 'Step number as shown in the plan (1 = first step).' },
        done: { type: 'boolean', description: 'true = done, false = not done. Leave out to keep it as it is.' },
        comment: { type: 'string', description: 'Short comment shown under the step. Replaces the previous comment; an empty string removes it. Leave out to keep it.' },
      },
      required: ['step'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_note',
    description: "Add a line to this task's notes box in Task Desk (results, replies, dates, anything worth keeping). It's appended, never replaces what's there. The user still presses Done themselves.",
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The text to add.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
];

function callApp(tool, args) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ token: TOKEN, task: TASK, tool, args: args || {} });
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/call', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, error: 'Bad reply from Task Desk' }); } });
    });
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
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'taskdesk', version: '1.0.0' } } });
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
  try { msg = JSON.parse(line); } catch { return; }
  handle(msg).catch((e) => msg.id !== undefined && send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } }));
});
