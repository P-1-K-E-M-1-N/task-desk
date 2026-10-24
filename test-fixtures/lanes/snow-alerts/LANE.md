# Snow Alerts

**Type:** revenue  |  **Queue order:** 2

_Sample data. This lane, its sources, the companies and the numbers are made up for Task Desk's tests._

## Current state

G0, G1 and G2 passed. G3 is provisional until the outreach replies are in.

## G0 Data check

**Result: PASS** (12 minutes, 2026-10-24 05:31-05:44 UTC; 48 live requests, 0 errors).

- Daily snowfall reports: public domain, keyless, posted by 07:00 local.
- 24-month backtest: 61 days with 6 inches or more somewhere in the region, all between November and March. Nothing to sell from April to October, and the pitch says so.

## G1 Sample

**Result: PASS** (2 minutes). `refresh.py` builds `samples/snow_alert.csv`, `.html` and `.pdf` for the latest day, plus a big-day example (2026-02-03: 14 inches, 9 counties).

## G2 Demand test

**Result: PASS (pack written).** `outreach/emails.md` has 3 drafts with the 3-question survey; `outreach/replies.md` is the empty tally. Nothing sent.

## G3 Decision

**PROVISIONAL.** `g3_score.py`: demand 3, repeat_use 4, competition 4, license 5, build_effort 5 = 21/25. GO if at least one contractor says "yes" at $50.

## Log

- 2026-10-24 05:27 lane created from ops/INBOX.md
- 2026-10-24 05:44 G0 pass, backtest done
- 2026-10-24 05:45 G1 pass, G2 pack written
