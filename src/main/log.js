// The app's log: data\taskdesk.log, next to the app and never synced. One line
// per event with a timestamp and a level. The file is kept small: past about a
// megabyte it is renamed to taskdesk.log.1 and a fresh one is started, so it
// can't grow forever. Errors the user never saw (a watcher that couldn't start,
// a state file that couldn't be written, an unexpected exception) go here, so a
// bug report can come with the log. Nothing secret is ever logged.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const FILE = path.join(config.LOCAL_DIR, 'taskdesk.log');
const MAX = 1024 * 1024;

function rotate() {
  try {
    if (fs.statSync(FILE).size > MAX) fs.renameSync(FILE, FILE + '.1');
  } catch {}
}

// A one-line text for anything thrown: message plus the first line of the stack.
function describe(err) {
  if (!err) return '';
  if (err instanceof Error) {
    const where = (err.stack || '').split('\n')[1];
    return `${err.message}${where ? ` (${where.trim()})` : ''}`;
  }
  return typeof err === 'string' ? err : JSON.stringify(err);
}

function write(level, msg, err) {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${msg}${err ? `: ${describe(err)}` : ''}\n`;
  try {
    rotate();
    fs.appendFileSync(FILE, line);
  } catch {
    // If even the log can't be written there is nowhere left to say so.
  }
  if (level === 'error' && process.stderr.writable) process.stderr.write(line);
}

module.exports = {
  info: (msg, err) => write('info', msg, err),
  warn: (msg, err) => write('warn', msg, err),
  error: (msg, err) => write('error', msg, err),
  describe,
  file: FILE,
};
