// A pretend `claude` for tests (TASKDESK_FAKE_CLAUDE): says hello with its
// process id and the options it was given, then repeats back each line typed.
process.stdout.write(`FAKE CLAUDE pid=${process.pid}\r\nargs: ${process.argv.slice(2).filter((a) => a.startsWith('--')).join(' ')}\r\n> `);
let line = '';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('data', (d) => {
  for (const ch of d.toString()) {
    if (ch === '\r' || ch === '\n') { if (line) process.stdout.write(`\r\nyou said: ${line}\r\n> `); line = ''; }
    else if (ch === '\x03') process.exit(0);
    else { line += ch; process.stdout.write(ch); }
  }
});
