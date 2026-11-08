// The before-every-edit hook (src/mcp/taskdesk-hook.js): asks the app, stops
// the edit on "no", lets it through on "yes", when there's no file, and when
// the app can't be reached.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { scratch } = require('./setup');

const HOOK = path.join(__dirname, '..', '..', 'src', 'mcp', 'taskdesk-hook.js');

function run(port, tokenFile, input) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [HOOK], {
      env: { ...process.env, TASKDESK_PORT: String(port), TASKDESK_TOKEN_FILE: tokenFile, TASKDESK_TASK: 't1' },
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, err }));
    p.stdin.end(input);
  });
}

test('hook: blocked edit exits 2 with the reason; allowed exits 0; no file or no app means go ahead', async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      const m = JSON.parse(b);
      calls.push(m);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(/blocked\.js$/.test(m.args.file) ? { ok: false, error: 'Taken by "Other task"' } : { ok: true }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const tokenFile = path.join(scratch('hook'), 't1.token');
  fs.writeFileSync(tokenFile, 'a'.repeat(48));
  const edit = (tool, file) => JSON.stringify({ tool_name: tool, tool_input: { file_path: file } });

  const blocked = await run(port, tokenFile, edit('Edit', 'C:\\p\\blocked.js'));
  assert.equal(blocked.code, 2);
  assert.match(blocked.err, /Taken by "Other task"/);
  const fine = await run(port, tokenFile, edit('Write', 'C:\\p\\fine.js'));
  assert.equal(fine.code, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].token, 'a'.repeat(48));
  assert.equal(calls[0].task, 't1');
  assert.equal(calls[0].tool, 'claim_file');
  assert.deepEqual(calls[0].args, { file: 'C:\\p\\blocked.js', tool: 'Edit' });

  const noFile = await run(port, tokenFile, JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'dir' } }));
  assert.equal(noFile.code, 0);
  assert.equal(calls.length, 2, 'nothing to ask about');

  await new Promise((r) => server.close(r));
  const down = await run(port, tokenFile, edit('Edit', 'C:\\p\\blocked.js'));
  assert.equal(down.code, 0, 'the app is gone: the edit goes ahead');
});
