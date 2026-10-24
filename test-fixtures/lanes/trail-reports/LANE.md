# Trail Reports

**Type:** traffic  |  **Queue order:** 3

_Sample data. This lane, its sources and its numbers are made up for Task Desk's tests._

## Current state

G0, G1 and G2 passed. G3 is provisional until the keyword volumes arrive (the one thing only a person can do: Keyword Planner needs a signed-in account).

## G0 Data check

**Result: PASS** (5 minutes, 2026-10-24 05:31-05:37 UTC; 31 live requests, 0 errors). Scripts: `g0_check.py`; raw output in `data/g0_summary.json`.

- National weather feed: public domain, keyless, hourly updates. Covers every trail head we listed.
- Parks department closures: public RSS, no key, no stated limits. 14 trails, 1 closed today.
- Trail-head webcams: 2 of 6 publish a still image we may embed with attribution. The rest are video-only.
- Hourly forecast feed: free tier is non-commercial. Not used.

## G1 Sample

**Result: PASS** (3 minutes). `refresh.py` rebuilds `samples/pine_ridge.html` from live data in one run.

## G2 Demand test

**Status: pack written, waiting on keyword volumes.** The 40 queries below are the paste-ready list for Google Keyword Planner (Tools > Keyword Planner > Get search volume and forecasts, paste, set the country, download the CSV).

```
pine ridge trail conditions
pine ridge trail weather
pine ridge trail closed
cedar loop trail conditions today
...
```

(40 lines in the real file; shortened here.)

## G3 Decision

**PROVISIONAL.** `g3_score.py`: demand ?, repeat_use 5, competition 4, license 4, build_effort 5. GO if the top 10 queries total 2,000+ searches a month; PARK otherwise.

## Log

- 2026-10-24 05:27 lane created from ops/INBOX.md
- 2026-10-24 05:37 G0 pass
- 2026-10-24 05:39 G1 pass
- 2026-10-24 05:42 G2 pack written; keyword volumes requested in needs_nick.md
