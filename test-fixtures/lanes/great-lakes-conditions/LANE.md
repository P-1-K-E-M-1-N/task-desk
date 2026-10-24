# Great Lakes Conditions

**Type:** traffic  |  **Queue order:** 3

One auto-updating page per Michigan lake, harbor and launch (waves, wind, water temp, water level, advisories). Launch target April 1, 2027. Sources: NOAA NDBC, GLERL/GLOS, NWS marine forecasts, NOAA CO-OPS, Open-Meteo.

## Current state

(see lane.json; board regenerates ops/STATUS.md)

## G0 Data check

**Result: PASS.** Every number a page needs (waves, wind, water temp, water level, advisories) can come from
US-government public-domain sources with no API key. Probe script: `g0_check.py`; raw results:
`data/g0_results.json`; every request is in `usage.jsonl` (114 live requests, 19 expected 404s).

| Source | Works? | License | Updates | Verdict |
|---|---|---|---|---|
| `ndbc` NOAA buoys (realtime2 .txt) | Yes. 198 active Great Lakes stations in `activestations.xml`; 111 inside Michigan waters; **76 reporting now** (24 Oct), 16 stale (pulled in the last 2 weeks), 19 with no realtime file (pulled or never post) | Public domain | Hourly; 10-min for many | **Ship on it**, with the seasonal caveat below |
| `coops` NOAA CO-OPS datagetter | Yes. 8 of 8 Michigan gauges returned a reading 20-60 min old (Harbor Beach 578.71 ft, Holland 579.07 ft, Ludington 578.98 ft, Mackinaw 578.68 ft, Mt Clemens 577.83 ft, Duluth 602.26 ft IGLD85). `monthly_mean` works (121 rows per 10-year call) so a long-term average is computable | Public domain | 6-minute | **Ship on it** |
| `nws_api` api.weather.gov | Yes. `alerts/active?region=GL` returned 17 active marine alerts (Small Craft, Dense Fog). `zones?type=marine` lists 123 Great Lakes zones (LMZ/LHZ/LSZ/LEZ/LCZ). Nearshore marine forecast text (`products/types/NSH/locations/GRR`, 78 recent issuances) gives wind and wave-height forecast per zone in plain words | Public domain | Alerts real time; NSH 2-4x daily | **Ship on it** (this is the wave source when buoys are out) |
| `glerl` NOAA GLERL CoastWatch (new, registered in lane sources.json) | Yes. GLSEA daily lake-average surface temperature CSVs for every lake, 1995-present, plus `avgtemps-m_1995-2026_F.csv` with a 31-year daily average column | Public domain | Daily | **Ship on it** (water temp "vs normal" for the whole lake, year-round) |
| `glos` Seagull (GLOS, nonprofit) | Reachable. ERDDAP `info/index.json` answers with no API key; API docs page has no mention of a key. Mostly re-serves the same buoys NDBC already has | **Unknown.** `https://glos.org/terms-of-use/` is a 404. FAQ says "access to Great Lakes data and information is free through GLOS" and GLOS "may charge a cost-recovery fee" for custom needs; `https://glos.org/legal/` says data "may be distributed or copied, unless GLOS indicates that it has been notified otherwise", disclaims liability, and does not mention commercial use or keys | Varies | **Do not ship on it.** Nothing it adds is needed; question for Nick only if we ever want it |
| `open_meteo` marine API | Yes (wave height 0.1 m at Grand Haven), evaluated with `allow_noncommercial=True` | **commercial_ok = false** on the free tier (CC BY, non-commercial). A paid plan would be needed | Hourly | **Cannot ship on it** without Nick paying. Not required: NWS covers forecasts |

**Seasonality (this matters for an April 1 launch).** NDBC Great Lakes buoys are seasonal, and today's probe shows the fall pull-out in progress:
- Already gone (HTTP 404 on realtime2): 45007 South Lake Michigan, 45008 South Huron, 45003 North Huron, 45163 Saginaw Bay, 45171/45172/45173 (NMU Superior buoys), 45218 Sheboygan, plus several small CG/NWS shore sensors (St. Joseph SJOM4, Manistee MEEM4, Port Sanilac PSCM4).
- Stale (last report 1-25 days ago, i.e. pulled this month): Ludington 45024, Little Traverse Bay 45022, Muskegon 45161, Thunder Bay/Alpena 45162, Sleeping Bear 45183, Grand Island 45211, Whitefish Point WFPM4, Presque Isle PRIM4.
- Still reporting with waves and water temp: Holland 45029 (0.3 m, 14.5 C), South Haven 45168, Cook Nuclear/Stevensville 45026, Lakeport 45209 (Lake Huron), Mackinac Straits 45175/45194, Lake St Clair 45147, MTU "Spotter" drifters 45212/45213/45214, 45002 North Michigan and 45001 Mid Superior (water temp only, WVHT = MM).
- Year-round, never pulled: the NOS/C-MAN fixed shore stations (Holland HLNM4, Harbor Beach HRBM4, Ludington LDTM4, Muskegon MKGM4, Alpena LPNM4, Mackinaw MACM4, Marquette MCGM4, ...). They give wind, gusts, air temp and (at Holland, Harbor Beach, Alpena, Mackinaw, Menominee, Port Inland) water temperature, but **no wave height**.

Offshore NDBC buoys normally go back in late April to May and university buoys in May, so on **April 1 the page will have essentially zero observed wave heights**. The honest design: waves come from the NWS nearshore marine forecast (public domain, per zone, in feet) with observed waves added when a buoy is in; wind and water temp come from year-round NOS shore stations; lake-wide water temp vs. 31-year normal from GLERL GLSEA; water level vs. long-term average from CO-OPS; advisories from NWS. That is a complete page from public-domain data in every month.

**Decision:** pass. Ship-able public-domain set = `ndbc` + `coops` + `nws_api` + `glerl`. `glos` and `open_meteo` are not needed and not cleared.

## G1 Sample

**Result: PASS.** `samples/holland_mi.html` (+ `.csv`, `.json`) is a real conditions page for **Holland, MI** built
from live data by `refresh.py` (re-run `python lanes/great-lakes-conditions/refresh.py` any time). Holland was chosen
because it has all four pieces within a mile of each other: NDBC buoy 45029 (waves, water temp; seasonal), NOS shore
station HLNM4 (wind, air and water temp; year-round), CO-OPS gauge 9087031 (water level), and NWS nearshore zones
LMZ845/LMZ846 (forecast + advisories). Holland State Park is Michigan's most-visited state park, so it is a fair proxy
for demand.

What the page showed at 01:38 EDT on 24 Oct 2026 (12 live requests + cache):

| KPI | Value | From |
|---|---|---|
| Waves (observed) | 1.0 ft, period 2 s, from ESE, 48 min old | NDBC 45029 |
| Wind | 8 kt E, gusts 10 kt | HLNM4 |
| Water temp nearshore | 58 F | NDBC 45029 |
| Lake Michigan average surface temp | 58.2 F, **+3.0 F vs 1995-2025 average** | GLERL GLSEA |
| Water level | 579.07 ft IGLD85, **+0.16 ft vs 35-year October average**, +0.58 ft vs Oct 2025 | CO-OPS 9087031 + 36 years of monthly means |
| Advisories | none active for the 4 Holland zones | NWS alerts |
| Forecast | Tonight waves 1 ft or less; Sat 1 ft; Sun 1-3 ft (per zone, issued 9:36 PM) | NWS NSH product, WFO Grand Rapids |

Every row carries the observation time (converted to Eastern), the station and the source agency. Data-gap
handling is built in: if the buoy is pulled, the Waves KPI switches to "NWS forecast" and a note explains that
Great Lakes buoys are out Nov-Apr. That is exactly the state the page will be in on April 1.

Honest limits: wave observations exist only while a buoy is in the water (May-Oct for most Michigan sites); the
nearshore forecast gives a range, not a number; GLSEA is a lake-wide average that lags 2-3 days; the long-term water
level average here is 1990-2025 (CO-OPS monthly means go back further, and the Army Corps publishes 1918-present, but
35 years is enough for a "higher/lower than normal" line). Scaling to "every lake, harbor and launch" means a table
of ~60-100 locations mapped to the nearest buoy, shore station, gauge and marine zone, all of which exist in the
same two lists (`activestations.xml`, `zones?type=marine`); no new data source is needed.

## G2 Demand test

**Result: agent work done; waiting on Nick for volumes.** Everything is in `g2_keywords.md`:
- (a) 40 queries: 14 west-coast harbors x metric, 11 Huron/Saginaw/St Clair, 4 Superior, 4 water level, 7 intent
  phrases ("small craft advisory lake michigan today", "is lake michigan safe to swim today").
- (b) Step-by-step Keyword Planner instructions (Expert Mode, account without campaign, Get search volume and
  forecasts, location = Michigan, export CSV to `data/keyword_volumes.csv`). `load_volumes.py` summarises the export
  and suggests the demand score. Yardstick: <5k/mo total weak, 5-30k viable niche, >30k strong.
- (c) Competitor audit, 10 queries x top 5 (10 web searches). Summary: the SERPs for "today" queries are mostly
  undated local-TV stories, SEO content farms on hijacked domains, and single-metric sites (lakemonster,
  seatemperature.net, surf-forecast, windy.app, Omnia Fishing). NOAA/NWS raw text pages rank but are one metric per
  page and unreadable on a phone. Nobody shows observed + forecast waves, wind, water temp vs normal, water level vs
  normal and advisories for a named harbor on one timestamped page. That is the gap.

Caveat: the audit used the agent's search tool, not a logged-in Google SERP; Nick is asked for a 10-minute incognito
spot check in `needs_nick.md`.

## G3 Decision

**PROVISIONAL (scorecard.json written by `g3_score.py`, status waiting_nick).**

| Demand | Repeat | Competition | License | Effort | Total | Rule says | Recorded |
|---|---|---|---|---|---|---|---|
| 3 (guess) | 4 | 3 | 5 | 4 | 19/25 | GO | **PARK, provisional** |

Reasons are in `scorecard.json`, each marked "provisional, pending keyword volumes". The only unknown that matters is
demand: license is as clean as it gets (all public domain, no keys), the build is small because core already fetches
everything, and competition is real on domain authority but weak on the actual page. If Nick's Michigan-only volumes
total under 5k/month the demand score drops to 2 and this becomes PARK on merit (total 18 with a weak dimension);
at 5-15k it stays 3 and the rule gives GO; above 15k it is a clear GO.

**merge_with = ["river-levels"]** (lane 13): same shape (one auto page per gauge, "vs normal", public-domain USGS/NWS
feeds), same audience overlap (anglers, paddlers), same build loop. One site covering "Michigan water conditions"
(lakes + rivers) would share hosting, the location table, and SEO authority. Recommend deciding both lanes together.

To finish: Nick runs Keyword Planner -> `load_volumes.py` -> edit DEMAND and PROVISIONAL in `g3_score.py` -> re-run ->
`python -m core.lane great-lakes-conditions finish G3 go|park "..."`.

## Log

- 2026-10-24T05:31:55+00:00 G0 started. Live fetch of NDBC, CO-OPS, NWS marine alerts, GLERL, GLOS, Open-Meteo; license and seasonal-availability check
- 2026-10-24T05:36:58+00:00 G0 finished: pass. 114 live requests: NDBC 76/111 MI stations reporting (offshore buoys already pulled), CO-OPS 8/8 gauges, NWS 17 GL alerts + NSH forecast text, GLERL GLSEA daily temps; all public domain. GLOS terms unknown, Open-Meteo non-commercial: not needed.
- 2026-10-24T05:36:59+00:00 G1 started. Build one live conditions page for Holland, MI (buoy 45029, shore station HLNM4, CO-OPS 9087031, NWS zone forecast + alerts, GLSEA)
- 2026-10-24T05:39:26+00:00 G1 finished: pass. samples/holland_mi.html built live by refresh.py: waves 1.0 ft (45029), wind 8 kt (HLNM4), water 58 F, level 579.07 ft +0.16 vs 35-yr Oct avg (CO-OPS), 0 advisories + NWS zone forecast; all public domain
- 2026-10-24T05:39:26+00:00 G2 started. 40 Keyword Planner queries + competitor audit of top 5 for 10 queries
- 2026-10-24T05:42:27+00:00 G2 finished: pass. 40 queries + Keyword Planner steps + 10-query competitor audit in g2_keywords.md; volumes pending from Nick
- 2026-10-24T05:42:27+00:00 G3 started. provisional score pending keyword volumes
- 2026-10-24T05:42:27+00:00 status -> waiting_nick. blocker: Nick must run 40 queries through Keyword Planner. next: load volumes, then final G3
- 2026-10-24T05:42:45+00:00 Timing: G0 5 min, G1 2 min, G2 3 min (G3 provisional). Fetches: 138 live requests (19 expected 404s from pulled buoys), 8 cache hits, by source {'ndbc': 112, 'coops': 13, 'nws_api': 5, 'glerl': 5, 'glos': 2, 'open_meteo': 1}; 15 web fetches/searches (GLOS terms, GLERL paths, 10 competitor queries). Blockers: GLOS terms page is a 404 (left unknown, not used); the only real blocker is Nick running Keyword Planner.
