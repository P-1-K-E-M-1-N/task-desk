// src/main/tasks.js: turning checklists into tasks. Pure parsing, no app needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scratch } = require('./setup');
const config = require('../../src/main/config');
const { parseNeedsNick, toTasks, readChecklist, parseEmails, guessType, normType, TYPES } = require('../../src/main/tasks');

const NEEDS = `# What I need

## factory-wide
- [ ] **Pick a name** (2026-10-24): decide between the two options in the doc.
  Either is fine.

## storm-lead
- [ ] **Send the outreach email** to the three roofers (45 min)
- [x] Already done, should not show
* [ ] Optional: decide only if we ever want a newsletter
`;

test('parseNeedsNick: headings become lanes, continuation lines join, ticked lines are skipped', () => {
  const items = parseNeedsNick(NEEDS);
  assert.deepEqual(
    items.map((i) => i.lane),
    ['factory', 'storm-lead', 'storm-lead']
  );
  assert.equal(items[0].text, '**Pick a name** (2026-10-24): decide between the two options in the doc. Either is fine.');
  assert.ok(items.every((i) => !/Already done/.test(i.text)));
});

test('toTasks: title, type, minutes, priority and date are read from the text', () => {
  const tasks = toTasks(parseNeedsNick(NEEDS), () => ({ laneDir: 'L', workDir: 'W' }), 'p1_');
  const [pick, email, optional] = tasks;
  assert.equal(pick.title, 'Pick a name');
  assert.equal(pick.type, 'decide');
  assert.equal(pick.date, '2026-10-24');
  assert.equal(pick.important, true);
  assert.ok(pick.id.startsWith('p1_'));
  assert.equal(email.type, 'outreach');
  assert.equal(email.minutes, 45, 'a "(45 min)" hint wins over the default for the type');
  assert.equal(optional.low, true);
  assert.equal(optional.important, false);
  assert.equal(pick.laneDir, 'L');
});

test('toTasks: the same task listed twice is shown once, and the id is stable', () => {
  const raw = [
    { lane: 'a', text: '**Call the bank**' },
    { lane: 'a', text: '**Call the bank**' },
  ];
  const one = toTasks(raw, () => ({}));
  assert.equal(one.length, 1);
  assert.equal(one[0].id, toTasks([raw[0]], () => ({}))[0].id);
});

test('readChecklist: a plain TODO.md works, and "only mine" keeps lines with my name', () => {
  const dir = scratch('checklist');
  const file = path.join(dir, 'TODO.md');
  fs.writeFileSync(file, '## Shop\n- [ ] Alex: order the sign\n- [ ] Pay the invoice\n\n## Later\n- [ ] Ask Alexander about the van\n');
  const all = readChecklist(file, false);
  assert.equal(all.length, 3);
  assert.deepEqual(
    all.map((t) => t.lane),
    ['Shop', 'Shop', 'Later']
  );

  config.set({ userName: 'Alex' });
  const mine = readChecklist(file, true);
  assert.deepEqual(
    mine.map((t) => t.text),
    ['Alex: order the sign'],
    'whole-word match: "Alexander" is not me'
  );
  assert.deepEqual(readChecklist(path.join(dir, 'missing.md'), false), [], 'a missing file is just empty');
});

test('parseEmails: one draft per ### heading, with subject, body and contact page', () => {
  const md = [
    'Attach: `flyer.pdf`',
    '',
    '### Roof Co',
    'Contact page: https://roof.example/contact',
    '```',
    'Subject: Hello',
    '',
    'Body line 1',
    'Body line 2',
    '```',
    '',
    '### Empty',
    '```',
    '```',
  ].join('\n');
  const r = parseEmails(md);
  assert.equal(r.attach, 'flyer.pdf');
  assert.equal(r.emails.length, 1, 'a draft without a body is skipped');
  assert.deepEqual(r.emails[0], {
    name: 'Roof Co',
    contact: 'https://roof.example/contact',
    subject: 'Hello',
    body: 'Body line 1\nBody line 2',
  });
});

test('guessType: real task wording lands in the right one of the eight kinds', () => {
  const cases = {
    'Send the outreach emails to 20 roofers': 'outreach',
    'Fill in the contact form on each site': 'outreach',
    'Ask the Detroit open data office if commercial use is allowed': 'ask',
    'Send me the support email for the app listing': 'info',
    'Tell me your Play developer name': 'info',
    'Pick an Android package prefix': 'decide',
    'Decide whether to pay for Open-Meteo': 'decide',
    'Create a RevenueCat account': 'account',
    'Sign up for PostHog': 'account',
    'Finish the Play Console identity check and verify your ID': 'account',
    'Enable the Google Play Developer API': 'setup',
    'Invite the service account and grant release permissions': 'setup',
    'Get a Census API key into the .env': 'setup',
    'Test the three prototype apps on your phone': 'qa',
    'Spot-check the competitor list': 'qa',
    'Pull search volumes from Keyword Planner': 'research',
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(guessType(text), want, text);
});

test('normType: plans saved with the six old names move to the closest new one', () => {
  assert.ok(
    TYPES.every((t) => normType(t) === t),
    'new names stay as they are'
  );
  assert.equal(normType('email', 'Send the drafts'), 'outreach');
  assert.equal(normType('keywords', 'anything'), 'research');
  assert.equal(normType('review', 'Look over the copy'), 'qa');
  assert.equal(normType('signup', 'Create a RevenueCat account'), 'account');
  assert.equal(normType('signup', 'Enable the Play Developer API'), 'setup');
  assert.equal(normType('decision', 'Send me the support email'), 'info', 'a "decision" that is really giving info');
  assert.equal(normType('decision', 'Pick a package prefix'), 'decide');
  assert.equal(normType('question', 'Ask the city data office about reuse'), 'ask');
  assert.equal(normType('question', 'Your Gmail on the test phone'), 'info');
  assert.equal(normType('question', 'something vague'), 'info', 'falls back to the closest new name');
});
