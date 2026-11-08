// When a snoozed task comes back: 8 in the morning of the chosen day. Used by
// the Snooze button (ipc.js) and by the chat's snooze_task tool.
//
// `when` is one of:
//   'tomorrow' (or 'day')        the next morning
//   'week' (or 'next week')      a week from now
//   a day as YYYY-MM-DD          that morning (local time)
// Returns a Date, or null when it isn't a day we can use: not a date at all,
// already past, or more than a year away. The year cap keeps a typo (2062)
// from hiding a task for good.
const WAKE_HOUR = 8;
const MAX_DAYS = 366;

function until(when, now = new Date()) {
  const w = String(when || '')
    .trim()
    .toLowerCase();
  const d = new Date(now);
  if (w === 'tomorrow' || w === 'day') d.setDate(d.getDate() + 1);
  else if (w === 'week' || w === 'next week') d.setDate(d.getDate() + 7);
  else {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
    if (!m) return null;
    d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    // setFullYear rolls 2026-02-31 over into March: refuse days that don't exist.
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  }
  d.setHours(WAKE_HOUR, 0, 0, 0);
  if (d <= now) return null;
  if (d - now > MAX_DAYS * 24 * 60 * 60 * 1000) return null;
  return d;
}

// "Fri, Nov 14", for messages.
const dayName = (d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const HELP = 'Give a day from tomorrow up to a year away, as YYYY-MM-DD (or "tomorrow" / "next week").';

module.exports = { until, dayName, HELP, WAKE_HOUR };
