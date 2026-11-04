// The only factory file this app ever writes: ops/FROM_NICK.md (append-only).
// Other projects get the same kind of entry in the results file they chose.
// Plus the optional .env write for signup keys, which always asks first.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const from = () => (config.userName() ? `From ${config.userName()}` : 'Task Desk results');
const header = () =>
  `# ${from()}\n\n_Appended by Task Desk when ${config.who()} finishes or skips a task. Newest at the bottom. The workspace's agents read this._\n\n`;
const projectHeader = (name) =>
  `# ${from()}\n\n_Appended by Task Desk when ${config.who()} finishes or skips a task in "${name}". Newest at the bottom._\n\n`;

// Safety net: inside the lanes workspace, only ops/FROM_NICK.md may ever be written.
function guard(file) {
  if (!config.inFactory(file)) return;
  const rel = path.relative(path.resolve(config.livePath()), path.resolve(file));
  if (rel.toLowerCase() !== path.join('ops', 'from_nick.md')) {
    throw new Error(`The ${config.factoryName()} folder is read-only (only ops\\FROM_NICK.md may be added to).`);
  }
}

function appendFromNick(root, entry) {
  return appendResults(path.join(root, 'ops', 'FROM_NICK.md'), entry, header());
}

function appendResults(file, { lane, text, status, notes, results, ticked }, head = header()) {
  guard(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, head);
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 5);
  let entry = `## ${stamp} · ${lane} · ${status.toUpperCase()}\n\n`;
  entry += `**Task:** ${text}\n\n`;
  if (ticked) entry += `**Steps ticked:** ${ticked}\n\n`;
  entry += `**${config.userName() ? `${config.userName()}'s notes` : 'Notes'}:** ${notes && notes.trim() ? notes.trim() : '(none)'}\n\n`;
  if (results && results.length) {
    entry += '**Pasted results:**\n\n';
    for (const r of results) entry += `- ${r.label}:\n\n${indent(r.value.trim())}\n\n`;
  }
  entry += '---\n\n';
  fs.appendFileSync(file, entry);
  return file;
}

const indent = (s) =>
  s
    .split(/\r?\n/)
    .map((l) => '    ' + l)
    .join('\n');

// Sets VAR=value in the named .env file, replacing an existing line if present.
// Only a file called .env or .env.local, never through a link, and only a
// value that is one plain line (an API key): anything with spaces, quotes, #,
// $ or backslashes is refused rather than written in a way some tool might
// read differently. The new file is written next to the old one and swapped in.
function writeEnv(envPath, name, value) {
  const base = path.basename(envPath).toLowerCase();
  if (base !== '.env' && base !== '.env.local') throw new Error('Refusing to write: target is not a .env file');
  if (!/^[A-Z_][A-Z0-9_]{0,99}$/.test(name)) throw new Error('Bad variable name');
  // (Where it may be is checked by the caller: inside the task's own folder, after asking.)
  const clean = String(value).trim();
  if (!clean) throw new Error('The key is empty');
  if (!/^[\x21-\x7e]+$/.test(clean) || /["'`#$\\]/.test(clean))
    throw new Error("That key has spaces, quotes or other characters a .env file can't hold safely. Check you copied only the key.");
  let body = '';
  try {
    if (fs.lstatSync(envPath).isSymbolicLink()) throw new Error('Refusing to write: that .env file is a link to somewhere else');
    body = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const re = new RegExp(`^${name}=.*$`, 'm');
  const line = `${name}=${clean}`;
  body = re.test(body) ? body.replace(re, () => line) : body + (body && !body.endsWith('\n') ? '\n' : '') + `${line}\n`;
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const tmp = `${envPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body, { mode: 0o600 });
  fs.renameSync(tmp, envPath);
}

module.exports = { appendFromNick, appendResults, projectHeader, guard, writeEnv };
