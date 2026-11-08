// Local link between each task's chat and the app. The app listens on
// 127.0.0.1 (a random port, never the network). Each chat gets its own secret
// token, made when the chat starts and dropped when it stops, and the app
// decides which task a request is for from that token alone: a chat can only
// update the task it was opened for, whatever the request says.
//
// The token reaches the chat's Task Desk tools (src/mcp/taskdesk-mcp.js) in a
// small file in data\mcp (per computer, never synced), so it never shows up on
// a command line. Requests must also come with the right Host header and as
// JSON, which keeps web pages in a browser from reaching it.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { safeId } = require('./safety');

const MCP_DIR = path.join(config.LOCAL_DIR, 'mcp');
const SCRIPT = path.join(__dirname, '..', 'mcp', 'taskdesk-mcp.js');
const HOOK = path.join(__dirname, '..', 'mcp', 'taskdesk-hook.js');
let port = 0;
// sha256(token) -> task id, and task id -> its token
const byHash = new Map();
const tokens = new Map();
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const key = (s) => hash(s).toString('hex');

// The task a token belongs to, compared in constant time.
function taskFor(token) {
  if (typeof token !== 'string' || token.length !== 48) return null;
  const k = key(token);
  const id = byHash.get(k);
  if (!id) return null;
  return crypto.timingSafeEqual(hash(tokens.get(id)), hash(token)) ? id : null;
}

// Files from earlier runs (a crash, or an older version that never deleted them).
// At most 120 tool calls a minute per chat (a chat uses a few); more means something's wrong.
const LIMIT = 120;
const recent = new Map(); // task id -> times of its calls in the last minute
function tooMany(task) {
  const now = Date.now();
  const list = (recent.get(task) || []).filter((t) => now - t < 60 * 1000);
  list.push(now);
  recent.set(task, list);
  return list.length > LIMIT;
}

// The folder holding the chats' tokens is readable by this Windows user only
// (and Windows itself), not by other accounts on the computer. Done once per start.
let locked = false;
function lockFolder() {
  if (locked || process.platform !== 'win32') return;
  locked = true;
  const icacls = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe');
  const user = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME;
  if (!user || !fs.existsSync(icacls)) return;
  try {
    require('child_process').execFileSync(icacls, [MCP_DIR, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 10000,
    });
  } catch {}
}

function clearOld() {
  try {
    for (const f of fs.readdirSync(MCP_DIR)) if (/\.(json|token)$/.test(f)) fs.rmSync(path.join(MCP_DIR, f), { force: true });
  } catch {}
}

function start(handle) {
  clearOld();
  const server = http.createServer((req, res) => {
    const reply = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST' || req.url !== '/call') return reply(404, { ok: false, error: 'Not found' });
    // Only the chat's tools on this computer: the exact Host, JSON, and no browser Origin.
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(403, { ok: false, error: 'Not allowed' });
    if (req.headers.origin) return reply(403, { ok: false, error: 'Not allowed' });
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return reply(415, { ok: false, error: 'JSON only' });
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
      const task = taskFor(msg && msg.token);
      if (!task) return reply(403, { ok: false, error: 'Not allowed' });
      if (tooMany(task)) return reply(429, { ok: false, error: 'Too many requests; wait a moment.' });
      try {
        reply(200, await handle(task, String(msg.tool || ''), msg.args && typeof msg.args === 'object' ? msg.args : {}));
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

// A fresh token for one task's chat, saved where its tools read it.
function tokenFile(taskId) {
  if (!safeId(taskId)) throw new Error('Bad task id');
  forget(taskId);
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(taskId, token);
  byHash.set(key(token), taskId);
  fs.mkdirSync(MCP_DIR, { recursive: true });
  lockFolder();
  const file = path.join(MCP_DIR, `${taskId}.token`);
  fs.writeFileSync(file, token, { mode: 0o600 });
  return file;
}

// How to start the tools for one task's chat (any AI app that speaks MCP).
function spec(taskId) {
  return {
    command: process.execPath,
    args: [SCRIPT],
    env: { ELECTRON_RUN_AS_NODE: '1', TASKDESK_PORT: String(port), TASKDESK_TOKEN_FILE: tokenFile(taskId), TASKDESK_TASK: taskId },
  };
}

// Writes Claude Code's MCP config for one task's chat and returns its path.
function configFor(taskId) {
  const s = spec(taskId);
  const file = path.join(MCP_DIR, `${taskId}.json`);
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { taskdesk: { type: 'stdio', ...s } } }, null, 2), { mode: 0o600 });
  return file;
}

// Claude Code's settings for one task's chat: before every edit, ask the app
// (src/mcp/taskdesk-hook.js) whether another task's chat holds that file.
// The hook runs through a small .cmd so Electron runs it as Node. Returns the
// settings file's path, for --settings. Call after configFor (same token).
function hooksFor(taskId) {
  if (!safeId(taskId)) throw new Error('Bad task id');
  fs.mkdirSync(MCP_DIR, { recursive: true });
  const cmd = path.join(MCP_DIR, 'taskdesk-hook.cmd');
  fs.writeFileSync(cmd, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${HOOK}"\r\n`, { mode: 0o600 });
  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Edit|Write|MultiEdit|NotebookEdit',
          hooks: [{ type: 'command', command: `"${cmd.replace(/\\/g, '/')}"`, timeout: 10 }],
        },
      ],
    },
  };
  const file = path.join(MCP_DIR, `${taskId}.hooks.json`);
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 });
  return file;
}

// What the hook needs from the chat's environment: where the app listens, and
// where this chat's token is (the file, never the token itself).
function hookEnv(taskId) {
  if (!safeId(taskId) || !port) return {};
  return { TASKDESK_PORT: String(port), TASKDESK_TOKEN_FILE: path.join(MCP_DIR, `${taskId}.token`), TASKDESK_TASK: taskId };
}

// The chat stopped: its token no longer works and its files are deleted.
function forget(taskId) {
  const t = tokens.get(taskId);
  if (t) byHash.delete(key(t));
  tokens.delete(taskId);
  recent.delete(taskId);
  if (!safeId(taskId)) return;
  for (const f of [`${taskId}.json`, `${taskId}.token`, `${taskId}.gemini.json`, `${taskId}.hooks.json`])
    fs.rmSync(path.join(MCP_DIR, f), { force: true });
}

module.exports = { start, configFor, hooksFor, hookEnv, spec, forget, taskFor, MCP_DIR, ready: () => port > 0 };
