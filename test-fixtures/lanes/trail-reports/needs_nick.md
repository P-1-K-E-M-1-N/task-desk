# Needs Nick: trail-reports

- [ ] **Run the 40 queries through Google Keyword Planner** (about 15 minutes, free, no campaign or card needed).
  Exact steps and the paste-ready list are in `LANE.md` under "G2 Demand test". Save the export to
  `data/keyword_volumes.csv`, run `python lanes/trail-reports/load_volumes.py`, and the lane can finish G3.
  This is the only blocker for a real GO/PARK decision.
- [ ] Optional 10-minute sanity check: open a private window and search 3-4 of the queries yourself (e.g.
  "pine ridge trail conditions today"). Confirm the top results really are undated forum posts, as the
  agent's search tool showed. If a strong incumbent exists that I missed, note it in LANE.md.
- [ ] **Paid forecast add-on: decide only if we ever want it.** The hourly forecast feed's free tier is non-commercial, so
  the lane does not use it. The page works entirely on the public-domain national weather feed. A paid plan (roughly
  $25/month at last check; verify) would add hourly trail-head forecasts, which the free zone forecast covers more
  coarsely. Default recommendation: do not pay.
- [ ] **Park closures feed: no action needed.** The parks department publishes closures as a public RSS feed with no
  key and no stated limits. If we ever want their trail-counter numbers (a separate, keyed API), email their open-data
  desk first to ask whether redistribution with attribution is OK. Draft question:
  "We publish a free trail-conditions page. May we show your trail-counter readings with attribution, and is a key
  required?"
