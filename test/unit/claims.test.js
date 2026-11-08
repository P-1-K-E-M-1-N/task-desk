// claims: which chat holds which file, and when a file changes hands.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const claims = require('../../src/main/claims');
const attention = require('../../src/main/attention');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const P = 'proj';
const F = 'C:\\p\\src\\app.js';

test('claim: free yes; held by a busy chat no; changes hands when the holder is idle; freed on release', async () => {
  assert.equal(claims.claim(P, 'a', F).ok, true);
  assert.equal(claims.claim(P, 'a', 'c:/P/SRC/App.js').ok, true, 'same file, any spelling');
  const r = claims.claim(P, 'b', F);
  assert.equal(r.ok, false);
  assert.equal(r.holder.task, 'a');
  assert.deepEqual(
    claims.held(P, 'b').map((h) => h.task),
    ['a']
  );
  assert.equal(claims.holdings('a').length, 1);
  assert.equal(claims.held('other-project', 'b').length, 0, 'projects are separate');

  // a's chat finishes its reply and waits for the user: b may take the file.
  attention.feed('a', 'Working (esc to interrupt)');
  await wait(attention.QUIET_MS + 150);
  attention.feed('a', 'done\r\n> ');
  await wait(attention.QUIET_MS + 150);
  assert.equal(attention.needs('a'), 'turn');
  const r2 = claims.claim(P, 'b', F);
  assert.equal(r2.ok, true);
  assert.equal(r2.tookOver, 'a');
  assert.equal(claims.claim(P, 'a', F).ok, false, 'b holds it now and is busy');

  claims.release('b');
  assert.equal(claims.claim(P, 'a', F).ok, true);
  assert.ok(claims.version(P) >= 4, 'every change bumps the version');
  attention.forget('a');
});
