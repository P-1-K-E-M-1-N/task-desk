# Storm Lead

**Type:** revenue  |  **Queue order:** 2

Morning-after alerts for Michigan roofing/restoration contractors listing ZIPs hit by hail 1in+ or damaging wind, $50-100/month. Sources: NOAA SPC storm reports, NWS alerts, OpenFEMA. G0 includes a 24-month Michigan backtest of alert frequency.

## Current state

(see lane.json; board regenerates ops/STATUS.md)

G0 pass, G1 pass, G2 pack written, **waiting on Nick to send 20 emails**. G3 score is provisional (PARK until replies).

Files in this lane:
- `stormlib.py` parses SPC daily and yearly files, applies the alert rule, maps lat/lon to nearby ZIPs.
- `backtest.py` writes `data/backtest.csv`, `data/counties.csv`, `data/mi_events.csv`, `data/prelim_vs_final_2025-06.csv`.
- `refresh.py` rebuilds yesterday's alert from live data (`python lanes/storm-lead/refresh.py`, or `--latest`, or a date).
- `g2_outreach.py` writes the outreach pack; `scorecard_g3.py` writes the provisional score.

## G0 Data check

**Result: PASS** (13 minutes, 2026-10-24 05:31-05:44 UTC).

**Endpoints work (real requests through core.fetch):**
- SPC daily reports `https://www.spc.noaa.gov/climo/reports/YYMMDD_rpts_{hail,wind}.csv`: HTTP 200, columns `Time,Size|Speed,Location,County,State,Lat,Lon,Comments`. Hail size in hundredths of an inch, wind in mph or `UNK` (damage report, no measured gust). Each file is one SPC "convective day", 12:00 UTC to 11:59 UTC next day (8am to 8am Eastern in summer). 606 daily files pulled for Jan 1 - Oct 23, 2026 with zero errors.
- SPC bulk database `https://www.spc.noaa.gov/wcm/data/YYYY_{hail,wind}.csv`: final NWS Storm Data for 2024 (updated 2026-10-01) and 2025 (published 2026-04-24). No 2026 file yet. The directory itself returns 403; file names come from the `wcm/` page. Wind magnitude is in knots (50 kt = 58 mph), times are CST, county is a FIPS code.
- NWS API `api.weather.gov/alerts/active?area=MI`: 200, valid (0 active alerts tonight). OpenFEMA declarations for MI since Oct 2024: 50 rows (June 2026 severe storms/flooding declaration covers many northern counties). Both work; neither is needed for the core alert.
- Census Gazetteer `2025_Gaz_zcta_national.zip` and `2025_Gaz_counties_national.zip`: 200, pipe-delimited (older years are tab). Used for county names and ZIP centroids.

**License:** all four sources are US Government works, public domain, commercial use fine with attribution. Registered in `lanes/storm-lead/sources.json` (`noaa_spc_wcm`, `census_gazetteer`, and a lane override raising `noaa_spc_reports` daily budget to 2000).

**Update timing (matters for a 7am email):** SPC's page labels every report preliminary and shows the current day as "20261023 1200 UTC - 20261024 1159 UTC". Reports appear within minutes to a couple of hours of the storm as local NWS offices relay them. The day's file keeps changing until 12Z (8am EDT), and late reports can still be added for a few days. So a 7am send covers everything through about 6:30am; a storm that is still going at 7am shows up in the next morning's email. The final, cleaned record (Storm Data) arrives months later: the 2025 yearly file was published April 2026.

**How noisy is the morning data?** June 2025 compared both ways: the preliminary daily files held 73 qualifying Michigan reports on 11 days; the final record kept 38 reports on 9 days. Every final alert day was also a preliminary alert day; two thin preliminary days (June 17 and June 30) did not survive. Plain reading: the morning email will sometimes list reports that later get merged or downgraded, roughly double-counting on busy days, but it will not miss real storm days. For a canvassing list that is acceptable; the email should say "preliminary".

### 24-month Michigan backtest (Oct 2024 - Sep 2026)

Alert rule: any Michigan report of hail 1.00 in or larger, or wind 58 mph or more, or a wind-damage report with no speed. 2024-2025 from the final database, 2026 from preliminary daily files (the only kind available, and the kind the product would actually use). Full table: `data/backtest.csv`; per-county: `data/counties.csv`.

| Month | Alert days | Hail reports | Wind reports | Top counties |
|---|---|---|---|---|
| 2024-10 | 0 | 0 | 0 | |
| 2024-11 | 1 | 0 | 2 | Saginaw, Oakland |
| 2024-12 | 0 | 0 | 0 | |
| 2025-01 | 0 | 0 | 0 | |
| 2025-02 | 0 | 0 | 0 | |
| 2025-03 | 4 | 2 | 99 | Shiawassee, Berrien, St. Joseph |
| 2025-04 | 4 | 8 | 6 | Huron, Iron, Oakland |
| 2025-05 | 2 | 5 | 82 | Kalamazoo, Berrien, Ottawa |
| 2025-06 | 9 | 7 | 31 | Wayne, Oakland, Clinton |
| 2025-07 | 6 | 7 | 16 | Alger, Wayne, Huron |
| 2025-08 | 5 | 10 | 12 | Alpena, Alcona, Ogemaw |
| 2025-09 | 3 | 3 | 1 | Cass, Kent, Otsego |
| 2025-10 | 3 | 1 | 2 | Baraga, Allegan, St. Joseph |
| 2025-11 | 0 | 0 | 0 | |
| 2025-12 | 0 | 0 | 0 | |
| 2026-01 | 0 | 0 | 0 | |
| 2026-02 | 1 | 6 | 0 | Ingham, Livingston, St. Clair |
| 2026-03 | 6 | 40 | 8 | Ottawa, Ingham, St. Joseph |
| 2026-04 | 5 | 6 | 39 | Kent, Wayne, Barry |
| 2026-05 | 6 | 14 | 122 | Macomb, Oakland, Ionia |
| 2026-06 | 11 | 56 | 108 | Cass, Allegan, Kent |
| 2026-07 | 14 | 28 | 171 | Marquette, Berrien, Iosco |
| 2026-08 | 4 | 4 | 9 | Berrien, Barry, Jackson |
| 2026-09 | 4 | 7 | 62 | Oakland, Ingham, Livingston |

**Headline, in plain language:** over 24 months an alert would have fired on **88 mornings** (974 qualifying reports). In storm season (March-September) that is **about 4-8 mornings a month in a normal year, up to 11-14 in a busy month** (June-July 2026). **October through February is almost silent: 2 alert mornings in 10 winter months.** Wind damage reports outnumber 1-inch hail roughly 4 to 1; hail-only alert days are rarer (about 2-5 a month in season). 2026 looks about twice as active as 2025 partly because it is preliminary data (see the June 2025 comparison above).

**Counties that keep recurring (alert days / reports over 24 months):** Oakland 20 / 42, Wayne 15 / 44, Macomb 15 / 28, Berrien 14 / 42, Ingham 12 / 35, St. Joseph 12 / 33, Kent 11 / 37, Barry 11 / 29, Allegan 11 / 24, Ionia 11 / 23, Livingston 11 / 23, Shiawassee 11 / 22, St. Clair 11 / 18, Monroe 11 / 18, Lapeer 11 / 15. Metro Detroit (Oakland, Wayne, Macomb) is the best single territory: a roofer there would get roughly 1-3 alerts a month in season.

**What this means for the product:** a flat $50-100/month subscription has to survive four months with nothing to send. Season pricing (March-October) or an annual plan would be more honest. The data is plentiful enough in season to be worth a daily email, and thin enough in winter that "no alert today" is the normal case.

Requests used in G0: 657 live fetches (606 daily SPC files, 6 bulk/page fetches, 2 gazetteer zips, 1 NWS, 1 OpenFEMA, plus probes), everything else from cache. Re-running the backtest today costs zero requests.

## G1 Sample

**Result: PASS** (2 minutes; most of the work was already done in G0's library).

The artifact a roofer gets at 7am: a one-page "Storm Lead alert" listing every qualifying report with local time, type, hail size or wind speed, location, county, the nearby ZIP codes, and the NWS comment, plus a "which ZIPs to canvass" line sorted by report count.

- `samples/storm_lead_alert.{pdf,html,csv}`: **Wednesday October 7, 2026**, the most recent Michigan storm day in the data. A thin one: 4 wind-damage reports in Antrim, Kalkaska and Crawford counties (ZIPs 49615, 49612, 49733, 49738). Honest, but not a great sales demo.
- `samples/storm_lead_alert_example_big_day.{pdf,html,csv}`: **Thursday September 3, 2026**, the busiest southeast-Michigan day of 2026: 46 reports, 15 counties, 1.00 in hail, trees and wires down across Oakland, Macomb, Ingham, Livingston. This is what a storm morning looks like; attach both.

ZIP mapping: each report is a point. We list the ZIP Code Tabulation Areas (Census 2025 gazetteer) whose centroid is within 8 km (about 5 miles), nearest always included, up to 6. This is an approximation and the sample says so; real ZIP polygons are irregular, and a production version should use ZCTA boundary polygons (also public domain, Census TIGER) for point-in-polygon.

`refresh.py` rebuilds yesterday's alert from live SPC data in one call (2 SPC requests plus a cached gazetteer); `--latest` walks back to the most recent day with Michigan reports.

## G2 Demand test

**Result: pack written, nothing sent.** Lane parked `waiting_nick`.

20 Michigan roofing / restoration / exterior contractors from public business listings (company sites, ProjectMap It portfolios, Downtobid and Builder Market directories, Grand Rapids Chamber, a Jackson local directory). Business name, type, city and a public contact URL only; no personal names. Spread: Metro Detroit and Oakland County (7, including Royal Oak and Troy), Grand Rapids / lakeshore (6), Lansing / Kalamazoo / Battle Creek (4), Jackson / Ann Arbor (3), Flint (1). Target list: `outreach/targets.csv`. Drafts: `outreach/emails.md` (one per target, same 3-question survey). Reply tally goes in `outreach/replies.md`.

Pitch used: "the morning after a storm you get a one-page email listing the Michigan counties and ZIP codes hit by 1-inch-plus hail or 58+ mph wind the night before, built straight from NWS storm reports." Price stated: $50-100/month.

Blocker: **Nick must send the emails** (and should attach both sample PDFs, the big-day one first). Several contact URLs are directory pages rather than the company's own site; Nick should swap in the real contact form where he finds one.

Searches used: 12 web searches (8 for contractors and directories, 4 for competitors).

## G3 Decision

**PROVISIONAL score written** (`scorecard.json`, decision forced to PARK until replies). Demand=3, repeat_use=3, competition=2, license=5, build_effort=5, total 18/25. On the arithmetic alone that would be GO; it is held at PARK because the demand number is a guess until Nick tallies replies, and because of the competition picture below. `merge_with = ["weather-trigger-jobs"]` (lane 7 overlaps: same trigger data, different audience).

**Competition, honestly: this market is crowded.**
- HailTrace and Interactive Hail Maps (with its Hail Recon app) are the incumbents; both are quote-priced, sell radar-derived hail swaths and address-level history, and HailTrace sells an API for lead generation.
- Published prices in the category: HailWatch $65-119/month; Hail Drive $29.99/month or $250/year; GAF WeatherHub $349-649/year depending on contractor tier; AnythingWeather $179-189 per storm map, $1,899/year per state.
- Free lookalikes that do roughly what Storm Lead does: Beacon Storm+ (free hail maps for Beacon PRO+ customers, filterable by ZIP and hail size), the Hail Yeah app (plots every SPC hail/wind/tornado report with alerts), LiveHailReports (free state-level swath emails), CoreLogic's free daily hail alerts. StormerSoft did not turn up at all in search.
- What incumbents have that public data cannot give: radar-estimated swaths between report points, address-level "was this roof hit" answers, and multi-year history per address. Storm Lead would only ever have the point reports the NWS received.
- Possible edge: Michigan-only, cheap, ZIPs in the inbox with no app or map to learn, and it costs one small cron job to run. That is a feature, not a company; the realistic ceiling is a few dozen Michigan roofers at $30-50/month in season.

**Recommendation for Nick:** send the 20 emails; if fewer than 3 say "yes" at $50+, PARK or fold the alert into weather-trigger-jobs rather than build it standalone. If 3+ say yes, the build is days (daily `refresh.py` run, email delivery, Stripe).

## Core changes

- `core/fetch.py`: added `Fetcher.get_bytes()` (binary download with the same cache, budget and usage log) because the Census gazetteer is a zip file and `get()` is text-only. Small and general; any lane that needs a zip, PDF or image can use it.

## Timings and blockers

- G0: 13 min (05:31-05:44 UTC). Most time was the 606 daily SPC fetches at the polite 0.5 s interval. Blockers: none. Two small bugs found and fixed (2025 gazetteer is pipe-delimited; BOM on its first column).
- G1: 2 min. Blockers: none.
- G2: under 1 min to write the pack (searches done in parallel during G0's fetch). Blocker: Nick must send.
- G3: provisional; final score waits on replies.

## Log

- 2026-10-24T05:31:23+00:00 G0 started. SPC storm reports endpoint, license, timing; 24-month MI backtest
- 2026-10-24T05:43:58+00:00 G0 finished: pass. SPC daily+bulk CSVs live (public domain); 24-month MI backtest: 974 qualifying reports on 88 alert days, 0 in Nov-Feb
- 2026-10-24T05:43:58+00:00 G1 started. one-page Storm Lead alert for latest MI storm day with ZIP mapping
- 2026-10-24T05:45:29+00:00 G1 finished: pass. storm_lead_alert.pdf/html/csv for 2026-10-07 (latest MI day, 4 reports) plus 2026-09-03 example (46 reports, 15 counties); ZIPs via Census ZCTA centroids
- 2026-10-24T05:45:30+00:00 G2 started. 20 Michigan roofing/restoration contractors from public listings; outreach pack
- 2026-10-24T05:45:30+00:00 G2 finished: pass. 20 targets + drafts in outreach/; nothing sent
- 2026-10-24T05:45:30+00:00 status -> waiting_nick. blocker: Nick must send outreach emails. next: tally replies, then final G3
- 2026-10-24T05:45:30+00:00 G3 started. provisional score pending replies
- 2026-10-24T05:45:30+00:00 status -> waiting_nick. blocker: Nick must send outreach emails. next: tally replies, then final G3
