// Reads a lanes workspace's ops/NEEDS_NICK.md (and checkboxes in lanes/*/LANE.md
// that mention the user), plus plain checklists, and turns them into task
// objects. Never writes anything.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const config = require('./config');

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
// Does a line mention the user? (needs their name; false until they've given it)
const mentionsMe = (text) => {
  const n = config.userName();
  if (!n) return false;
  const name = n.replace(/[^\w\s'-]/g, '');
  return new RegExp(`\\b${name}\\b`, 'i').test(text);
};
const norm = (s) => s.toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();

// NEEDS_NICK.md looks like:
//   ## lane-name
//   - [ ] **Bold title** (2026-10-24): details...
//     continuation lines indented by two spaces
function parseNeedsNick(md) {
  const items = [];
  let lane = 'factory';
  let cur = null;
  const flush = () => {
    if (cur) items.push(cur);
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      flush();
      lane = /factory-wide/i.test(h[1]) ? 'factory' : h[1].trim();
      continue;
    }
    const it = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (it) {
      flush();
      cur = { lane, done: it[1] !== ' ', lines: [it[2]] };
      continue;
    }
    if (cur && /^\s{2,}\S/.test(line)) cur.lines.push(line.trim());
    else if (cur && line.trim() === '') flush();
  }
  flush();
  return items.filter((i) => !i.done).map((i) => ({ lane: i.lane, text: i.lines.join(' ') }));
}

// Extra items: unchecked checkboxes in LANE.md that mention the user by name.
function parseLaneFlags(md, lane) {
  return md
    .split(/\r?\n/)
    .filter((l) => /^\s*[-*]\s+\[ \]/.test(l) && mentionsMe(l))
    .map((l) => ({ lane, text: l.replace(/^\s*[-*]\s+\[ \]\s*/, '').trim(), fromLaneMd: true }));
}

function titleOf(text) {
  const bold = text.match(/\*\*(.+?)\*\*/);
  if (bold) return bold[1].replace(/[.:]$/, '');
  const first = text.split(/(?<=[.:])\s/)[0];
  return first.length > 90 ? first.slice(0, 87) + '…' : first.replace(/[.:]$/, '');
}

function guessType(text) {
  const t = text.toLowerCase();
  if (/keyword/.test(t)) return 'keywords';
  if (/outreach|email|send .*draft/.test(t)) return 'email';
  if (/api key|sign ?up|signup|\.env|token|account/.test(t)) return 'signup';
  if (/decide|decision|approve|choose/.test(t)) return 'decision';
  if (/\bask\b|confirm|question/.test(t)) return 'question';
  return 'review';
}

function guessMinutes(text, type) {
  const m = text.match(/(\d+)[\s-]*min/i);
  if (m) return parseInt(m[1], 10);
  return { email: 45, keywords: 15, signup: 10, decision: 5, question: 10, review: 10 }[type];
}

// Low-priority wording: optional, informational, or "only if we ever want it".
const LOW = /optional|no action needed|decide only if|only if we ever/i;

function laneWorktrees(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8', timeout: 5000 });
    return out
      .split(/\r?\n/)
      .filter((l) => l.startsWith('worktree '))
      .map((l) => path.normalize(l.slice(9)));
  } catch {
    return [];
  }
}

function readTasks(root) {
  const needs = path.join(root, 'ops', 'NEEDS_NICK.md');
  let raw = [];
  try {
    raw = parseNeedsNick(fs.readFileSync(needs, 'utf8'));
  } catch {
    raw = [];
  }

  const lanesDir = path.join(root, 'lanes');
  let lanes = [];
  try {
    lanes = fs
      .readdirSync(lanesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {}
  for (const lane of lanes) {
    try {
      raw.push(...parseLaneFlags(fs.readFileSync(path.join(lanesDir, lane, 'LANE.md'), 'utf8'), lane));
    } catch {}
  }

  const worktrees = laneWorktrees(root);
  return toTasks(raw, (r) => {
    const laneDir = r.lane === 'factory' ? root : path.join(lanesDir, r.lane);
    const tree = worktrees.find((w) => r.lane !== 'factory' && path.basename(w).includes(r.lane));
    return { laneDir, workDir: tree || root };
  }).map((t) => ({ ...t, project: 'factory' }));
}

// Any Markdown checklist: "- [ ]" lines are tasks, "## headings" group them.
// The file is only read.
function readChecklist(file, onlyMine) {
  let raw = [];
  try {
    raw = parseNeedsNick(fs.readFileSync(file, 'utf8'));
  } catch {}
  if (onlyMine) raw = raw.filter((r) => mentionsMe(r.text));
  return raw.map((r) => ({ ...r, lane: r.lane === 'factory' ? 'general' : r.lane }));
}

// Raw items ({lane, text, id?}) -> task objects. dirs(r) gives the folders to plan and chat in.
function toTasks(raw, dirs, prefix = '') {
  const seen = new Set();
  const tasks = [];
  for (const r of raw) {
    const title = titleOf(r.text);
    const id = r.id || prefix + sha(r.lane + '|' + norm(title)).slice(0, 12);
    if (seen.has(id)) continue;
    seen.add(id);
    const fromTitle = guessType(title);
    const type = fromTitle !== 'review' ? fromTitle : guessType(r.text);
    const date = (r.text.match(/\((\d{4}-\d{2}-\d{2})\)/) || [])[1] || null;
    tasks.push({
      id,
      lane: r.lane,
      title,
      text: r.text.replace(/\*\*/g, ''),
      rawText: r.text,
      textHash: sha(norm(r.text)).slice(0, 16),
      type,
      minutes: guessMinutes(r.text, type),
      important: /\*\*/.test(r.text) && !LOW.test(r.text),
      low: LOW.test(r.text),
      date,
      ...dirs(r),
      fromLaneMd: !!r.fromLaneMd,
    });
  }
  return tasks;
}

// Pulls the per-business drafts out of an outreach/emails.md file.
function parseEmails(md) {
  const out = [];
  const attach = (md.match(/^Attach:\s*`([^`]+)`/m) || [])[1] || null;
  const parts = md.split(/^###\s+/m).slice(1);
  for (const p of parts) {
    const name = p.split(/\r?\n/)[0].trim();
    const contact = (p.match(/Contact page:\s*(\S+)/) || [])[1] || '';
    const block = (p.match(/```[a-z]*\r?\n([\s\S]*?)```/) || [])[1] || '';
    const subject = (block.match(/^Subject:\s*(.+)$/m) || [])[1] || '';
    const body = block.replace(/^Subject:.*\r?\n\r?\n?/m, '').trim();
    if (body) out.push({ name, contact, subject, body });
  }
  return { attach, emails: out };
}

module.exports = { readTasks, readChecklist, toTasks, parseNeedsNick, parseEmails, sha, norm };
