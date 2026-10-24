# Needs Nick: great-lakes-conditions

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
