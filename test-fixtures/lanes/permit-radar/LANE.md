# Permit Radar

**Type:** revenue  |  **Queue order:** 1

Weekly Detroit-area building-permit lead lists for trades (roofers, electricians, HVAC, plumbers, dumpster rental), ~$30/month. Sources: data.detroitmi.gov permits; check Royal Oak and Oakland County. Address, permit details and contractor of record only; no homeowner enrichment.

## Current state

(see lane.json; board regenerates ops/STATUS.md)

G0 pass, G1 pass, G2 pack written, status **waiting_nick**. Provisional G3 = PARK (19/25, license 3) until replies come in and Detroit confirms commercial use in writing.

## G0 Data check

**Result: PASS** (5 minutes, 2026-10-24 05:32-05:37 UTC; 27 live requests via core.fetch, 0 errors). Scripts: `g0_check.py`, `g0_check2.py`; raw output in `data/g0_summary.json`, `data/g0_summary2.json`.

What exists (all on data.detroitmi.gov, ArcGIS FeatureServer, no key, 1000 records/page):

| Layer | Records | Issued last 30 d | Last 7 d | Contractor field | Freshness |
|---|---|---|---|---|---|
| `detroit_permits` (bseed_building_permits) | 47,820 since 2019-01-02 | 570 | 102 | **none** | data edited 2026-10-23 08:25 UTC, newest issued_date 2026-10-22 (1-2 day lag) |
| `detroit_trades_permits` (bseed_trades_permits; electrical, mechanical, plumbing, boiler, elevator, fire alarm, generator) | 121,606 | 1,955 (Plumbing 1,067, Mechanical 467, Electrical 349) | 465 | `contact_business_name`, 89% filled | edited 2026-10-23 08:27 UTC, newest 2026-10-22 |
| `detroit_demolition_permits` (bseed_demolition_permits) | 16,288 | 24 | 7 | `demolition_contractor`, 100% filled | edited 2026-10-23 08:23 UTC, newest 2026-10-22 |

Also found but not used: Building Permit Plan Reviews (39,904 rows, pipeline of applications not yet issued, no contractor), Certificate of Occupancy, Right of Way permits. The trades and demolition layers contain `owner_name` and `contact_name`; the lane never requests those fields (people-data rule). Both new layers were registered in `lanes/permit-radar/sources.json` before fetching.

**Update frequency:** daily. ArcGIS `dataLastEditDate` moves every morning (~08:25 UTC) and the newest `issued_date` is one or two days behind today. Weekly delivery is comfortable.

**License / commercial use (the honest version):**
- The URL `data.detroitmi.gov/pages/terms-of-use` does not exist (the Hub site's page list has no such slug; the fetch returned an empty shell). The published terms are the **Disclaimer** page: data is provided AS-IS, "subject to Terms of Use developed by DoIT" which are not published anywhere we could find.
- The portal's **About** page (Executive Order 2015-2) says the data "can be easily retrieved, combined, downloaded, sorted, searched, analyzed, redistributed and re-used by individuals, business, researchers, journalists, developers, and government".
- The three dataset items have an empty `licenseInfo` (no license set) and `access: public`.
- **Conflict:** the portal footer links "Terms of Service & Privacy Policy" to `detroitmi.gov/Privacy`, which says "Commercial use of the information or our online services is prohibited without written permission of the City of Detroit."
- Decision: `commercial_ok = true` in the lane override, on the strength of the open-data policy that specifically names business reuse and redistribution, **but Nick should get written confirmation** from the Open Data team (feedback form linked from the portal footer) before anyone pays. Logged in `needs_nick.md`. License scored 3/5 until then.

**Royal Oak:** romi.gov Building Inspection points to AccessMyGov / BS&A Online for permits and property information. Address-by-address lookup only, account/PIN needed for permitting, no bulk download, no API. Not usable without scraping, which we are not doing. **Oakland County:** the county does not issue building permits (its FAQ sends residents to their city or township; Milford Twp is one exception that contracts the county). The ArcGIS Hub search for permit datasets from Oakland County or its cities returned nothing. So the product is **Detroit city limits only** for now; suburbs would need per-city work.

**What the data cannot do (product weakness):** building permits (roofs, additions, renovations) have **no contractor of record**, so a roofing permit tells you "a roof is being replaced at this address" but not by whom. Trades permits do name the contractor, but a trades permit means the job already has an electrician/plumber/HVAC shop. Realistically: trades rows are a competitor and subcontract map; building, "general" and demolition rows are the true leads, and **dumpster rental and general contractors are the best fit**. The roofing bucket is small (11 permits in the sample week). A big chunk of the plumbing layer is DWSD lead-service-line replacement (246 of 599 raw rows this week), which is city utility work and is filtered out.

## G1 Sample

**Result: PASS** (5 minutes, 05:37-05:42 UTC). `refresh.py` rebuilds everything from live data in one run (3 requests); the daily tick runs it.

Files in `samples/`: `lead_sheet.csv`, `lead_sheet.html`, `lead_sheet.pdf` (first 60 rows), plus `by_trade/{roofing,electrical,hvac,plumbing,demolition_dumpster,general}.csv`. Stats in `data/lead_sheet_stats.json`.

Week of 2026-10-17 to 2026-10-24: **353 permits** (building 119, trades 226, demolition 8) after removing 246 DWSD utility rows. Counts per trade tag (a permit can carry more than one):

| Trade tag | Permits | What it means to the buyer |
|---|---|---|
| hvac | 130 | furnace/AC/boiler permits, mostly with the installing contractor named |
| general | 92 | building permits with no trade keyword (alterations, change of use): subcontract leads for every trade |
| electrical | 78 | electrical permits, contractor named ~90% |
| plumbing | 45 | non-utility plumbing permits (back-water valves, fixture swaps, commercial) |
| demolition / dumpster | 39 | demolition permits, "new construction", "rehab", "interior alterations": dumpster and haul-away leads |
| roofing | 11 | roof replacements and roof-mounted solar, with estimated cost ($5,500-$29,900) but no contractor |

178 of 353 rows name a contractor business. Columns: issued date, trade tags, source layer, address, ZIP, neighborhood, permit type, estimated cost (building permits only), work summary, contractor of record. No owner or individual names anywhere.

## G2 Demand test

**Status: pack written, waiting on Nick** (started 05:42 UTC). Script: `g2_outreach.py`. Outputs: `outreach/targets.csv` (20 businesses), `outreach/emails.md` (20 drafts with the 3-question survey), `outreach/replies.md` (empty tally), entry in `needs_nick.md`.

Targets came from public listings only (company websites, BBB, HomeAdvisor, Expertise, Trane dealer locator, Thumbtack, BuildZoom): 4 roofers (Four Seasons Kanga Roof, Pro Home Improvement, Schoenherr Roofing, Tresnak Construction), 3 electricians (McChesney Electric, Superior Electric of Greater Detroit, KMR Construction Services), 5 HVAC (Royal Oak Heating Cooling Electrical & Plumbing, Thornton & Grooms, Beyer, Winslow, JLH), 4 plumbers (Cregger, WaterWork, Nelson Brothers, Mr. Rooter Detroit), 4 dumpster rental (Michigan Made, Bin There Dump That SE Michigan, Priority Waste, Discount Dumpster). Seven contact URLs were verified by loading the company site; the rest point at the public listing where the business was found, so Nick may need to click through to a contact form.

Blockers for Nick: (1) send the 20 emails with `samples/lead_sheet.pdf` attached; (2) ask the Detroit Open Data team in writing whether commercial redistribution is OK; (3) tally replies in `outreach/replies.md`. Nothing has been sent.

## G3 Decision

**PROVISIONAL (not final; G3 not started in lane.json).** `g3_score.py` saved `scorecard.json`: demand 3, repeat_use 5, competition 3, license 3, build_effort 5 = **19/25 -> PARK** (would be GO only with license >= 4). Reasons are marked "provisional, pending replies" in the scorecard.

Competition found: Construction Monitor (national weekly permit leads, historically ~$96/month per metro), PermitGrab ($149/month, permits + violations, daily), Permit Ledger ($14.99+, 26 cities, weekly CSV), BuildZoom, Dodge, ConstructConnect (enterprise), Apify permit scrapers ($30-50 per 1,000 records). None is Detroit-specific or trade-tagged for small shops, but the data is free and the moat is thin.

What would change the decision: 3+ "yes/maybe at $30" replies lifts demand to 4; written commercial OK lifts license to 4-5 -> GO at 21-22/25. Two or fewer interested replies, or a "no" from the City, -> KILL.

## Log

- 2026-10-24T05:32:26+00:00 G0 started. Detroit permits layer: license/commercial terms, freshness, trade-level layers with contractor fields; Royal Oak and Oakland County APIs
- 2026-10-24T05:37:22+00:00 G0 finished: pass. Detroit building (47,820; 102/7d) + trades (121,606; 465/7d; 89% with contractor business) + demolition layers live, keyless, updated daily (last edit 2026-10-23). Portal policy allows business reuse; city-wide Privacy page conflicts, written confirmation flagged for Nick. Royal Oak = BS&A/AccessMyGov, no API. Oakland County does not issue permits, no hub dataset.
- 2026-10-24T05:37:22+00:00 G1 started. weekly trade-tagged lead sheet from live Detroit building, trades and demolition permits
- 2026-10-24T05:42:33+00:00 G1 finished: pass. lead_sheet.csv/html/pdf from 353 live permits issued 2026-10-17..24 (building 119, trades 226, demolition 8; 246 DWSD utility rows removed); tags: hvac 130, general 92, electrical 78, plumbing 45, demo/dumpster 39, roofing 11; 178 rows name a contractor business
- 2026-10-24T05:42:33+00:00 G2 started. 20 Detroit-area trade businesses from public listings; outreach pack via core.outreach
- 2026-10-24T05:42:40+00:00 status -> waiting_nick. blocker: Nick must send 20 outreach emails (lanes/permit-radar/outreach/emails.md) and ask Detroit ODP for written OK on commercial use. next: tally replies in outreach/replies.md, then final G3
- 2026-10-24 provisional G3 scorecard saved (PARK 19/25, pending replies and license confirmation). Blockers hit: first run of refresh.py had blank dates (ArcGIS DateOnly fields are strings, not epoch ms) and regexes that missed "Plumbing"; fixed in 2 minutes. The terms-of-use URL from the brief does not exist; license read from the Hub Disclaimer/About page items and detroitmi.gov/Privacy instead. Web use: ~22 searches, ~17 page fetches, 33 core.fetch calls (30 live, 3 cache hits).
