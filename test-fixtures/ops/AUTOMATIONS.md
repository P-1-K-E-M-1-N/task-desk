# Automations

Exactly two scheduled jobs run the factory. Both are Claude Code **cloud routines** (they run in Anthropic's cloud on your plan, clone this GitHub repo, do their work, and push commits back to `main`). No extra paid service is involved; they consume Claude usage on your account. Manage both at https://claude.ai/code/routines.

| Job | Schedule (UTC cron) | Local time | Model | Routine link |
|---|---|---|---|---|
| Daily factory tick | `0 11 * * *` | 7:00 am EDT (6:00 am EST after Nov 1; change cron to `0 12 * * *` in winter if the hour matters) | Sonnet 5.5 | https://claude.ai/code/routines/trig_01RQTsfXsHnEHEsxmfxmq17C |
| Weekly portfolio digest | `0 22 * * 0` | Sunday 6:00 pm EDT (5:00 pm EST after Nov 1) | Sonnet 5.5 | https://claude.ai/code/routines/trig_01JiMECL9zpw1VhWxebnUpxm |

## What the daily tick does
1. `git pull`, then `python scripts/tick.py`: ingests `ops/INBOX.md` into `ops/queue.json`, runs each active lane's `refresh.py`, promotes queued lanes into free slots (max 4 active), regenerates the ops roll-ups, appends to `ops/TICK_LOG.md`.
2. Advances each **active** lane by at most one gate, following `CLAUDE.md`.
3. For lanes **waiting on you**: if you have added replies (`lanes/<slug>/outreach/replies.md`) or keyword volumes (`lanes/<slug>/data/keyword_volumes.csv`), it finishes G3 and, on GO, writes `lanes/<slug>/BUILD_PLAN.md` and stops.
4. Commits and pushes. Read `ops/TICK_LOG.md` for the plain-language summary.

## What the weekly digest does
Runs `scripts/digest.py`, writes `ops/digests/<date>.md` with a plain-language brief (what moved, decisions, your top 3 to-dos, stalls, anything waiting on you more than 7 days). When every lane has reached G3 or is parked on you, it writes `ops/SYSTEM_REPORT.md` if it does not exist.

## How to pause
- **Pause one job:** open its routine link above and toggle it off, or tell Claude Code: "pause the Idea Factory daily tick routine" (it uses `RemoteTrigger update {enabled:false}`).
- **Pause everything:** toggle both routines off. Nothing else runs on a schedule.
- **Delete:** only possible from https://claude.ai/code/routines.
- **Run now:** open the routine and click Run, or ask Claude Code to run it.

## Local alternative (if you prefer the jobs on your PC)
Windows Task Scheduler can run `python C:\MrC\idea-factory\scripts\tick.py` daily and `python C:\MrC\idea-factory\scripts\digest.py` weekly. That covers the deterministic parts (refresh, promote, board, digest tables) but not the judgment work (advancing gates, writing briefs). Pause the cloud routines first so the two do not fight over `main`.

## Known limits
- The cloud routine cannot see your local machine. Everything it needs must be committed to the repo.
- API keys for future lanes must be added as environment variables in the routine's cloud environment (https://claude.ai/code/environments), never committed.
- Minimum routine interval is 1 hour; both jobs are far above that.
