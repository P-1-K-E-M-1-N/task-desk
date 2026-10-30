// A pretend `claude` (or other AI app) for tests (TASKDESK_FAKE_CLAUDE / _AI):
// says hello with its process id, the options it was given and whether it got
// a hand-over note from another AI, then repeats back each line typed.
const handover = process.argv.some((a) => /switched this task over to you/.test(a));
process.stdout.write(
  `FAKE CLAUDE pid=${process.pid}\r\nargs: ${process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .join(' ')}\r\nhandover: ${handover ? 'yes' : 'no'}\r\n> `
);
let line = '';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('data', (d) => {
  for (const ch of d.toString()) {
    if (ch === '\r' || ch === '\n') {
      if (line) process.stdout.write(`\r\nyou said: ${line}\r\n> `);
      line = '';
    } else if (ch === '\x03') process.exit(0);
    else {
      line += ch;
      process.stdout.write(ch);
    }
  }
});
