// Claude Code runs this before every edit in a task's chat (a PreToolUse hook,
// from the settings file Task Desk hands it). It asks the app whether this
// chat may edit the file: another task's chat may be in it right now. "No"
// stops the edit (exit 2) and the reason is shown to Claude, who then does its
// other steps or tells the user. If the app can't be reached, the edit goes
// ahead: this guards against two chats colliding, not against editing.
// Runs under Electron's Node (ELECTRON_RUN_AS_NODE=1); no dependencies.
const http = require('http');

const PORT = Number(process.env.TASKDESK_PORT);
const TASK = process.env.TASKDESK_TASK;
let TOKEN = '';
try {
  TOKEN = require('fs').readFileSync(process.env.TASKDESK_TOKEN_FILE, 'utf8').trim();
} catch {}

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let msg = {};
  try {
    msg = JSON.parse(input);
  } catch {}
  const ti = msg.tool_input || {};
  const file = ti.file_path || ti.notebook_path || '';
  if (!file || !PORT || !TASK || !TOKEN) return process.exit(0);
  const body = JSON.stringify({ token: TOKEN, task: TASK, tool: 'claim_file', args: { file, tool: msg.tool_name || '' } });
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
        let r = { ok: true };
        try {
          r = JSON.parse(data);
        } catch {}
        if (r.ok === false) {
          process.stderr.write(r.error || 'Another chat is editing this file right now.');
          process.exit(2);
        }
        process.exit(0);
      });
    }
  );
  req.on('error', () => process.exit(0));
  req.setTimeout(5000, () => {
    req.destroy();
    process.exit(0);
  });
  req.end(body);
});
