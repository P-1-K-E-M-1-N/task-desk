# Needs Nick

**Open items: 12**

_Rolled up from lanes/*/needs_nick.md plus ops/needs_nick_global.md by `python -m core.board`. Tick a box in the lane file when done; this file is regenerated._

## Factory-wide

- [ ] **Approve the nightly job's schedule** (2026-10-24): it runs at 06:00 as a scheduled task on this computer and needs nothing paid. If you would rather run it by hand, the command is in ops/STATUS.md.

## bike-tuneups

- [ ] **Send G2 outreach** (2026-10-24): 3 draft emails in `lanes/bike-tuneups/outreach/emails.md`, attach `lanes/bike-tuneups/samples/tuneup_calendar.pdf`. Reply tally goes in `lanes/bike-tuneups/outreach/replies.md`.
- [ ] **Decide on the smaller product** (2026-10-24): the makers publish service intervals by model year only, not per bike, so the free version can only say "bikes like this one are due", never "this bike is due". The sample and the emails already say so. If you want true per-bike history, that means a paid data deal with the shops' point-of-sale vendor and the lane should be re-scored, not built on the free data.
- [ ] **Two of the three targets have no website** (2026-10-24): their contact links are directory listings, not the shop's own page. You would have to find each shop's contact form or walk in; both are on the same street, a 20-minute loop.

## menu-boards

- [ ] **Send G2 outreach** (2026-10-24): 3 draft emails in `lanes/menu-boards/outreach/emails.md`, attach `lanes/menu-boards/samples/menu_board.pdf`. Reply tally goes in `lanes/menu-boards/outreach/replies.md`.
- [ ] **Confirm commercial use with the Open Recipes Project** (2026-10-24): the project's About page allows reuse with attribution, but its terms page (linked from the footer) says "non-commercial" without defining it. Ask through the project's feedback page whether a paid weekly menu board built from their ingredient and price tables is OK. License score stays 3/5 until answered.

## snow-alerts

- [ ] **Send G2 outreach** (2026-10-24): 3 draft emails in `lanes/snow-alerts/outreach/emails.md`, attach `lanes/snow-alerts/samples/snow_alert.pdf`. Reply tally goes in `lanes/snow-alerts/outreach/replies.md`.
- [ ] **Also attach** `lanes/snow-alerts/samples/snow_alert_example_big_day.pdf` (Feb 3, 2026: 14 inches, 9 counties); the default sample day (Oct 20) is thin. Swap directory links in `outreach/emails.md` for the company contact form where you find one.

## trail-reports

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
