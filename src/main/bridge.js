// Local link between each task's chat and the app. The app listens on
// 127.0.0.1 (a random port, never the network) and every request must carry a
// secret token made fresh each time the app starts. Each chat gets an MCP config
// naming its own task, so Claude can only update the task it was opened for.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const TOKEN = crypto.randomBytes(24).toString('hex');
const MCP_DIR = path.join(config.LOCAL_DIR, 'mcp'); // per computer, never synced
const SCRIPT = path.join(__dirname, '..', 'mcp', 'taskdesk-mcp.js');
let port = 0;

function start(handle) {
  const server = http.createServer((req, res) => {
    const reply = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST' || req.url !== '/call') return reply(404, { ok: false, error: 'Not found' });
    let body = '';
    req.on('data', (d) => {
      body += d;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', async () => {
      let msg;
      try {
        msg = JSON.parse(body);
      } catch {
        return reply(400, { ok: false, error: 'Bad request' });
      }
      if (msg.token !== TOKEN) return reply(403, { ok: false, error: 'Not allowed' });
      try {
        reply(200, await handle(msg.task, msg.tool, msg.args || {}));
      } catch (e) {
        reply(200, { ok: false, error: e.message });
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve(port);
    })
  );
}

// How to start the tools for one task's chat (any AI app that speaks MCP).
function spec(taskId) {
  return {
    command: process.execPath,
    args: [SCRIPT],
    env: { ELECTRON_RUN_AS_NODE: '1', TASKDESK_PORT: String(port), TASKDESK_TOKEN: TOKEN, TASKDESK_TASK: taskId },
  };
}

// Writes Claude Code's MCP config for one task's chat and returns its path.
function configFor(taskId) {
  fs.mkdirSync(MCP_DIR, { recursive: true });
  const file = path.join(MCP_DIR, `${taskId}.json`);
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { taskdesk: { type: 'stdio', ...spec(taskId) } } }, null, 2));
  return file;
}

module.exports = { start, configFor, spec, ready: () => port > 0 };
