// snooze.until: when a snoozed task comes back (8 in the morning of the chosen day).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { until, dayName } = require('../../src/main/snooze');

// A Tuesday afternoon.
const now = new Date(2026, 10, 10, 15, 30); // Nov 10, 2026 15:30 local
const at8 = (y, m, d) => new Date(y, m - 1, d, 8, 0, 0, 0).getTime();

test('until: tomorrow, next week and a given day all come back at 8 in the morning', () => {
  assert.equal(until('tomorrow', now).getTime(), at8(2026, 11, 11));
  assert.equal(until('day', now).getTime(), at8(2026, 11, 11));
  assert.equal(until('week', now).getTime(), at8(2026, 11, 17));
  assert.equal(until(' Next Week ', now).getTime(), at8(2026, 11, 17));
  assert.equal(until('2026-11-14', now).getTime(), at8(2026, 11, 14));
  assert.equal(until('2027-02-01', now).getTime(), at8(2027, 2, 1));
  // Today counts only while 8 in the morning is still ahead.
  assert.equal(until('2026-11-10', now), null);
  assert.equal(until('2026-11-10', new Date(2026, 10, 10, 6, 0)).getTime(), at8(2026, 11, 10));
});

test('until: refuses what it cannot use', () => {
  for (const bad of [
    '',
    null,
    undefined,
    'soon',
    'Friday',
    '14/11/2026',
    '2026-11-9',
    '2026-02-31',
    '2026-13-01',
    '2025-01-01',
    '2028-01-01',
  ])
    assert.equal(until(bad, now), null, String(bad));
});

test('dayName reads like a calendar', () => {
  assert.equal(dayName(new Date(2026, 10, 14, 8)), 'Sat, Nov 14');
});
