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
      // "ask" shows a Claude Code-style yes/no; "work" is busy for a moment, then done.
      if (line === 'ask')
        process.stdout.write(
          '\r\n\x1b[1mDo you want to proceed?\x1b[0m\r\n \x1b[36m❯ 1. Yes\x1b[0m\r\n   2. No\r\n \x1b[2mEsc to cancel\x1b[0m'
        );
      else if (line === 'work') {
        process.stdout.write('\r\n✻ Working… \x1b[2m(esc to interrupt)\x1b[0m');
        setTimeout(() => process.stdout.write('\r\ndone\r\n> \r\n\x1b[2m? for shortcuts\x1b[0m'), 900);
      } else if (line) process.stdout.write(`\r\nyou said: ${line}\r\n> `);
      line = '';
    } else if (ch === '\x03') process.exit(0);
    else {
      line += ch;
      process.stdout.write(ch);
    }
  }
});
