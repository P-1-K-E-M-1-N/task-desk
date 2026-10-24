# Menu Boards

**Type:** revenue  |  **Queue order:** 1

_Sample data. This lane, its sources, the businesses and the numbers are made up for Task Desk's tests._

## Current state

G0 and G1 passed. G2 (demand test) is written and waiting: the outreach emails have to be sent by a person, and the license question needs a written answer.

## G0 Data check

**Result: PASS** (5 minutes, 2026-10-24 05:32-05:37 UTC; 9 live requests, 0 errors). Script: `g0_check.py`; raw output in `data/g0_summary.json`.

- Open Recipes Project ingredient table: 2,140 rows, keyless, updated Mondays.
- Weekly price table: 310 rows, same source, same schedule.
- Seasonal produce calendar: a static CSV we keep in the repo.

**License / commercial use:** the About page says "free to reuse with attribution". The terms page says "non-commercial" and never defines it. Written confirmation requested (see needs_nick.md). License score stays 3/5 until it arrives.

**What the data cannot do:** prices are regional averages, not a given cafe's suppliers. The board says "about", and the pitch says so.

## G1 Sample

**Result: PASS** (5 minutes). `refresh.py` builds `samples/menu_board.csv`, `.html` and `.pdf` from live data in one run: 12 dishes, 3 specials, cost per plate.

## G2 Demand test

**Status: pack written, waiting.** Script: `g2_outreach.py`. Outputs: `outreach/emails.md` (3 drafts with the 3-question survey), `outreach/replies.md` (empty tally), entry in `needs_nick.md`.

## G3 Decision

Not started.

## Log

- 2026-10-24 05:27 lane created from ops/INBOX.md
- 2026-10-24 05:37 G0 pass, license question flagged
- 2026-10-24 05:42 G1 pass
- 2026-10-24 05:53 G2 outreach pack drafted
