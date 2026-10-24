# Needs Nick

**Open items: 12**

_Rolled up from lanes/*/needs_nick.md plus ops/needs_nick_global.md by `python -m core.board`. Tick a box in the lane file when done; this file is regenerated._

## Factory-wide

- [ ] **Approve the two scheduled jobs' cost model** (2026-10-24): both jobs run as Claude Code cloud routines on your plan (no new paid service). If you would rather run them locally, see ops/AUTOMATIONS.md for the Windows Task Scheduler alternative.

## great-lakes-conditions

- [ ] **Run the 40 queries through Google Keyword Planner** (about 15 minutes, free, no campaign or card needed).
  Exact steps and the paste-ready list are in `g2_keywords.md` section (b). Save the export to
  `data/keyword_volumes.csv`, run `python lanes/great-lakes-conditions/load_volumes.py`, and the lane can finish G3.
  This is the only blocker for a real GO/PARK decision.
- [ ] Optional 10-minute sanity check: open an incognito window and Google 3-4 of the queries yourself (e.g.
  "holland michigan lake conditions today"). Confirm the top results really are undated news and spam, as the
  agent's search tool showed. If a strong incumbent exists that I missed, note it in LANE.md.
- [ ] **Open-Meteo: decide only if we ever want it.** Its free tier is non-commercial (`commercial_ok=false`), so the
  lane does not use it. The page works entirely on NOAA/NWS public-domain data. A paid Open-Meteo plan (roughly
  EUR 29/month at last check; verify) would add a point wave *model* for places with no buoy, which the NWS zone
  forecast covers more coarsely. Default recommendation: do not pay.
- [ ] **GLOS Seagull: no action needed.** Its public ERDDAP needs no key and mostly re-serves buoys NDBC already
  publishes. Its terms page (glos.org/terms-of-use) is a 404 and glos.org/legal does not mention commercial use. If we
  ever want a GLOS-only buoy (e.g. the Superior Watershed Partnership buoys near Marquette/Munising), email
  support@glos.org to ask whether commercial redistribution is OK before requesting a key. Draft question:
  "We publish a free, ad-supported conditions page for Michigan harbors. May we display current readings from
  Seagull buoys with attribution, and is an API key required?"

## permit-radar

- [ ] **Send G2 outreach** (2026-10-24): 20 draft emails in `lanes/permit-radar/outreach/emails.md`, targets in `targets.csv`, attach `lanes/permit-radar/samples/lead_sheet.pdf`. Reply tally goes in `lanes/permit-radar/outreach/replies.md`.
- [ ] **Confirm commercial use with Detroit Open Data** (2026-10-24): the portal About page allows business reuse/redistribution but detroitmi.gov/Privacy (linked from the portal footer) prohibits commercial use without written permission. Ask via the portal "Contact Us" feedback form whether a paid weekly permit digest built from the BSEED permit layers is OK. License score stays 3/5 until answered.

## recall-checks

- [ ] **Send G2 outreach** (2026-10-24): 20 draft emails in `lanes/recall-checks/outreach/emails.md`, targets in `targets.csv`, attach `lanes/recall-checks/samples/recall_exposure_sheet.pdf`. Reply tally goes in `lanes/recall-checks/outreach/replies.md`.
- [ ] **Decide on the smaller product** (2026-10-24): NHTSA has no public VIN-level "is this recall still open" API; only year/make/model exposure is possible for free. The sheet and emails already say so. If you want true open/closed status, that means a paid data deal (Carfax/AutoCheck/Recall Masters-class) and the lane should be re-scored, not built on the free data.
- [ ] **Half of the targets have no dealer website** (2026-10-24): 9 of 20 contact URLs are CarEdge/KBB/BBB/lender listing pages. Nick must find the dealer's own contact form or walk in; several are on Dixie Hwy in Waterford, a 25-minute loop from Royal Oak.

## storm-lead

- [ ] **Send G2 outreach** (2026-10-24): 20 draft emails in `lanes/storm-lead/outreach/emails.md`, targets in `targets.csv`, attach `lanes/storm-lead/samples/storm_lead_alert.pdf`. Reply tally goes in `lanes/storm-lead/outreach/replies.md`.
- [ ] **Also attach** `lanes/storm-lead/samples/storm_lead_alert_example_big_day.pdf` (Sep 3, 2026: 46 reports, 15 counties); the default sample day (Oct 7) is thin. Swap directory URLs in `outreach/targets.csv` for the company contact form where you find one.

