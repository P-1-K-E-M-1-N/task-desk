// The only factory file this app ever writes: ops/FROM_NICK.md (append-only).
// Plus the optional .env write for signup keys, which always asks Nick first.
const fs = require('fs');
const path = require('path');

const HEADER = '# From Nick\n\n_Appended by Nick\'s Task Desk when Nick finishes or skips a task. Newest at the bottom. The factory reads this on every daily tick._\n\n';

function appendFromNick(root, { lane, text, status, notes, results, ticked }) {
  const file = path.join(root, 'ops', 'FROM_NICK.md');
  if (!fs.existsSync(file)) fs.writeFileSync(file, HEADER);
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 5);
  let entry = `## ${stamp} · ${lane} · ${status.toUpperCase()}\n\n`;
  entry += `**Task:** ${text}\n\n`;
  if (ticked) entry += `**Steps ticked:** ${ticked}\n\n`;
  entry += `**Nick's notes:** ${notes && notes.trim() ? notes.trim() : '(none)'}\n\n`;
  if (results && results.length) {
    entry += '**Pasted results:**\n\n';
    for (const r of results) entry += `- ${r.label}:\n\n${indent(r.value.trim())}\n\n`;
  }
  entry += '---\n\n';
  fs.appendFileSync(file, entry);
  return file;
}

const indent = (s) => s.split(/\r?\n/).map((l) => '    ' + l).join('\n');

// Sets VAR=value in the named .env file, replacing an existing line if present.
function writeEnv(envPath, name, value) {
  const base = path.basename(envPath).toLowerCase();
  if (!(base === '.env' || base.startsWith('.env.') || base.endsWith('.env'))) {
    throw new Error('Refusing to write: target is not a .env file');
  }
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(name)) throw new Error('Bad variable name');
  const clean = String(value).trim().replace(/\r?\n/g, '');
  let body = '';
  try { body = fs.readFileSync(envPath, 'utf8'); } catch {}
  const re = new RegExp(`^${name}=.*$`, 'm');
  body = re.test(body) ? body.replace(re, `${name}=${clean}`) : body + (body && !body.endsWith('\n') ? '\n' : '') + `${name}=${clean}\n`;
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, body);
}

module.exports = { appendFromNick, writeEnv };
