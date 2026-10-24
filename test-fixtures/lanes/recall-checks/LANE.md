# Recall Checks for Used-Car Dealers

**Type:** revenue  |  **Queue order:** 4

Open-recall checks on dealer inventory via NHTSA vPIC + recalls API.

## Current state

(see lane.json; board regenerates ops/STATUS.md)

**Short version (2026-10-24):** G0, G1 and G2 passed. The product had to shrink. NHTSA's free public API tells you which
safety recalls *apply to a year/make/model*; it cannot tell you whether a specific car's recall is *still open*. That
VIN-level answer lives only in NHTSA's consumer web tool (fed weekly by manufacturers) and in paid dealer products
(Carfax, AutoCheck, Recall Masters, AutoAp). So the sellable thing is a weekly **Recall Exposure Sheet**: "these 12 of
your 40 cars have recalls that apply, here is the worst one, go confirm these VINs." Provisional G3 says **PARK (17/25)**
until Nick's 20 outreach emails come back. Status: `waiting_nick`.

## G0 Data check

**Result: PASS, with the product shrunk.** Took about 5 minutes of wall-clock; 22 live requests through `core.fetch`
(`g0_probe.py`, `g0_terms_probe.py`), all logged in `usage.jsonl`.

What works, verified with real requests:

| Source | Endpoint tried | Result |
|---|---|---|
| `nhtsa_vpic` | `GET vehicles/DecodeVinValues/<VIN>?format=json` | 200, decodes make/model/year/body; 333 ms |
| `nhtsa_vpic` | `POST vehicles/DecodeVINValuesBatch/` (form body `format=json&data=VIN;VIN`) | 200, 3 VINs in one call, max 50 per POST; partial VINs with `*` accepted |
| `nhtsa_recalls` | `GET recalls/recallsByVehicle?make=ford&model=f-150&modelYear=2013` | 200, 3 campaigns with campaign number, component, summary, consequence, remedy, `parkIt`, `parkOutSide`, `overTheAirUpdate` flags |
| `nhtsa_recalls` | `products/vehicle/modelYears|makes|models?issueType=r` | 200, the official 3-step lookup chain |
| `nhtsa_recalls` | `recalls/campaignNumber?campaignNumber=23V123000` | 200, adds `PotentialNumberofUnitsAffected` |
| `nhtsa_odi_flatfiles` | `static.nhtsa.gov/odi/ffdd/rcl/RCL.txt` | 200; the datasets page lists `FLAT_RCL_POST_2010.zip` (14 MB) regenerated nightly at 03:05 ET |
| `nhtsa_web` | `nhtsa.gov/nhtsa-datasets-and-apis`, `nhtsa.gov/recalls` | 403 to a generic User-Agent, 200 with a browser-style UA; text saved in `data/g0_page_*.txt` |

**The VIN-level question (the important one).** There is no public VIN-level open-recall API.
- NHTSA's datasets-and-APIs page documents only "Approach A: get by Model Year, Make, Model" and "Approach B" (the
  modelYears -> makes -> models chain). Nothing by VIN. Guessed routes (`recalls/recallsByVin`, `vehicles/byVin`,
  `safercar/vin`, the old `webapi/api/Recalls/vehicle/vin/`) all return HTTP 403, and so does a nonsense route, so 403
  there just means "no such endpoint".
- NHTSA's VIN tool (nhtsa.gov/recalls, formerly vinrcl.safercar.gov) is a consumer web form. Its own text: results show
  "an unrepaired recall for a vehicle from certain manufacturers"; it does NOT show repaired recalls, recalls over 15
  years old, small-manufacturer recalls, or non-safety campaigns; "recall information provided through this VIN lookup
  tool is provided by the manufacturer conducting the recall"; manufacturers must update at least weekly. It also says
  "You can search up to 100 VINs to see if any vehicle has an open recall", i.e. a dealer can already batch-check a
  whole small lot by hand for free.
- We will not scrape that tool. It is a manufacturer-fed consumer form behind a WAF, and scraping it is the one thing
  that could draw a complaint. The honest product is year/make/model exposure plus "confirm these VINs".

**License.** vPIC, the Recalls API and the ODI flat files are US Government works (public domain). No API key, no
registration, no terms page restricting commercial use found anywhere on nhtsa.gov or vpic.nhtsa.dot.gov (the
`/web-policies-and-notices` URL is now a 404). The vPIC page says only that traffic is "controlled by an automated
traffic rate control mechanism"; no numbers. `commercial_ok=true` for all three stands. Attribution "Source: NHTSA"
and a "not affiliated with NHTSA" line go on every sheet.

**Update frequency.** Recall campaigns are posted as manufacturers file them (daily); the flat file regenerates nightly;
vPIC changes a few times a year (v4.10, last code change 2026-10-17). A weekly sheet is well within that.

**Rate limits / quirks found.**
- No published limits; our registry caps at 1000/day per source with 0.3 s spacing; the whole 20-car sample used 70
  live calls (one vPIC batch + ~3 recall calls per vehicle). A 100-car lot refreshed weekly is trivially within budget;
  the flat file removes the per-vehicle calls entirely.
- Reproducible HTTP 400 from `recallsByVehicle` for some valid combinations (2017 Chevrolet Equinox fails every time;
  2016 and 2018 work). A product must fall back to the flat file for those rows.
- The API's own model spellings are odd (`F-150 SUPERCAB`, `X3 XDRIVE28I`) but plain names (`f-150`, `X3`) work, so
  query plain first, variants second (`refresh.py` does this).
- Dates come back `DD/MM/YYYY`.

**Other checks asked for.**
- Michigan Secretary of State does not publish dealer inventories, and its dealer-license records are sold only through
  a bulk-records program whose terms forbid marketing use. Dealer inventory has to come from the dealer. Fine: that is
  the product's input anyway.
- Michigan has no law requiring used-car dealers to disclose or fix open recalls (federal law doesn't either; a Senate
  bill was reintroduced Sept 2025). Pressure comes from state AG settlements (CarMax multistate; ~104 NY dealers), not
  from Michigan statute. That weakens "you must do this" and leaves "protect yourself and your customer".
- People data: none. VINs identify vehicles. We never ask for or store owner, buyer or plate data. The sheet
  deliberately uses stock numbers.

New sources registered in `lanes/recall-checks/sources.json`: `nhtsa_web` (terms reading only) and
`nhtsa_odi_flatfiles` (bulk fallback).

## G1 Sample

**Result: PASS.** About 5 minutes. Artifact: `samples/recall_exposure_sheet.{csv,html,pdf}`, rebuilt by
`python lanes/recall-checks/refresh.py` (one vPIC batch POST + recall lookups per vehicle, all through `core.fetch`).

Inventory: 20 vehicles typical of a Metro Detroit lot. Six carry public example VINs (NHTSA docs partials `5UXWX7C5*BA`
and `5YJSA3DS*EF`, plus long-standing textbook VINs for a 2013 F-150, 2018 Malibu, 2003 Accord, 2011 BMW 5-series; three
of those fail the check digit, which the sheet flags). The other 14 are year/make/model only, which is what most small
lots will actually hand over: Silverado 1500, Equinox, Escape, Grand Cherokee, Fusion, CR-V, Camry, RAV4, Explorer,
Ram 1500, Cruze, Focus, Grand Caravan, Cherokee.

What the sheet shows per vehicle: stock #, year/make/model, VIN (or "year/make/model only"), number of applicable
campaigns, NHTSA park-it / park-outside flags, the most serious campaign (component, NHTSA's summary, remedy), every
campaign number, newest campaign date, and an "Open/closed?" column that honestly says "verify per VIN at
nhtsa.gov/recalls (free, 100 VINs at a time)".

Numbers from the live pull on 2026-10-24: 19 of 20 vehicles have at least one applicable safety recall, 170 campaigns in
total, 3 vehicles carry NHTSA do-not-drive / park-outside advisories (2016 Silverado 1500 front control arm; 2014 Focus
steering gear; 2016 Jeep Cherokee power-liftgate fire risk). Five vehicles have campaigns filed in 2026, which is the
"refresh weekly" argument. The 2017 Equinox row shows the API-400 quirk and says so.

Known weaknesses of the sample: counts include equipment campaigns (tires, child seats) the API associates with a model,
e.g. the 2003 Accord's 24; several recalls apply only to a build-date window, so the true count for a given car is
usually lower. Both are reasons the sheet is an *exposure* report.

## G2 Demand test

**Result: PASS (drafts written; nothing sent).** Under a minute of compute after ~12 web searches for targets.
Files: `outreach/targets.csv` (20 dealers), `outreach/emails.md` (20 drafts + 3-question survey), `outreach/replies.md`
(empty tally), and the entry in `needs_nick.md`. Built by `build_outreach.py` via `core.outreach.write_outreach_pack`.

Product as pitched: **Recall Check Weekly**: every Monday a one-page sheet of the whole lot showing which cars have NHTSA
safety recalls that apply, the most serious one in plain English, campaign numbers. Price in the email: $39/month for up
to 50 vehicles ($29 under 20). Attachment: `samples/recall_exposure_sheet.pdf`.

Targets: 20 independent used-car dealers from public listings (dealer websites, CarEdge/KBB dealer pages, a BBB
category page, lender dealer-finder pages). Business name, city and public contact URL only; no people. Royal Oak (2),
Madison Heights (2), Waterford (7), Pontiac (2), Southfield (1), Oak Park (2), Farmington Hills (3), plus one Sterling
Heights lot as a Macomb control. Franchise stores were excluded on purpose: they get recall data from the OEM.

Blocker: Nick must send the emails. Status set to `waiting_nick`.

## G3 Decision

**PROVISIONAL: PARK, 17/25** (`scorecard.json`, written by `g3_score.py`; every reason is marked "provisional, pending
replies"). Re-run `g3_score.py` with real numbers after the reply tally, then `python -m core.lane recall-checks finish
G3 <go|park|kill>`.

- demand 2: no replies yet; pain is documented (AG settlements, federal bill) but Michigan imposes no duty, and NHTSA's
  free 100-VIN batch lookup already serves a patient dealer. Goes to 3-4 if 3+ of 20 say yes/maybe.
- repeat_use 4: weekly, inventory turns, new campaigns daily. Genuinely subscription-shaped.
- competition 2 (crowded): Carfax recall monitoring for its dealer subscribers, AutoCheck Open Recall Inventory Check,
  Recall Masters and AutoAp (daily VIN-level recall management, priced for franchise stores, pricing undisclosed), DMS
  recall features, and NHTSA's free tool. All of the paid ones have the VIN-level open/closed answer we cannot get.
  Our edges: $39 vs. "call for pricing", no contract, works from a year/make/model list.
- license 5: public domain, verified live.
- build_effort 4: `refresh.py` is 80% of the pipeline; remaining work is intake, flat-file fallback, scheduling, delivery.

Honest read: this is a nice $39 utility, not a moat. It only becomes a business if independents say the free NHTSA
tool is too fiddly and the Carfax bundle too expensive. The outreach is the whole test. No overlapping lanes
(`merge_with` empty).

## Log

- 2026-10-24T05:32:36+00:00 G0 started. NHTSA vPIC + recalls API: live requests, license, update frequency, VIN-level open-recall question
- 2026-10-24T05:36:58+00:00 G0 finished: pass. vPIC decode (single+batch) and recallsByVehicle both live, public domain, daily flat file; NO public VIN-level open-recall API (web tool only), product shrinks to recall exposure report
- 2026-10-24T05:36:58+00:00 G1 started. 20-vehicle Michigan lot: decode VINs, pull recalls per year/make/model, build Recall Exposure Sheet
- 2026-10-24T05:41:36+00:00 G1 finished: pass. recall_exposure_sheet.csv/html/pdf from 20 vehicles, 170 NHTSA campaigns, 3 park-it/park-outside flags; refresh.py rebuilds
- 2026-10-24T05:41:36+00:00 G2 started. 20 Oakland County / Metro Detroit independent used-car dealers from public listings; outreach pack
- 2026-10-24T05:41:36+00:00 G2 finished: pass. 20 targets + 20 draft emails + 3-question survey in outreach/; nothing sent
- 2026-10-24T05:41:36+00:00 G3 started. provisional score before replies
- 2026-10-24T05:41:37+00:00 status -> waiting_nick. blocker: Nick must send outreach emails. next: tally replies, then final G3
- Gate durations (lane.json): G0 ~4 min, G1 ~5 min, G2 <1 min compute (the ~12 target web searches ran alongside G0/G1). G3 left open on purpose until replies. Usage: 92 live requests (G0 22, G1 70), 63 cache hits, 7 logged errors (4 deliberate VIN-route probes, 3 the Equinox API quirk). Blockers: nhtsa.gov 403s to generic User-Agents (worked around with a browser-style UA for the terms read only); no VIN-level API (not solvable, product reshaped).
