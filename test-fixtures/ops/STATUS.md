# Portfolio board

_Regenerated 2026-10-24 05:53 UTC by `python -m core.board`. Slots: 0/4 active. Lanes with folders: 4. Queued without a folder: 14._

Gates: G0 data check, G1 sample, G2 demand test, G3 decision, PLAN build plan awaiting approval.

| # | Lane | Type | Gate | Status | Blocker | Next step | Last update |
|---|---|---|---|---|---|---|---|
| 1 | [Permit Radar](../lanes/permit-radar/LANE.md) | revenue | G2 | **waiting_nick** | Nick must send 20 outreach emails (lanes/permit-radar/outreach/emails.md) and ask Detroit ODP for written OK on commercial use | tally replies in outreach/replies.md, then final G3 | 2026-10-24 05:53 |
| 2 | [Storm Lead](../lanes/storm-lead/LANE.md) | revenue | G3 | **waiting_nick** | Nick must send outreach emails | tally replies, then final G3 | 2026-10-24 05:45 |
| 3 | [Great Lakes Conditions](../lanes/great-lakes-conditions/LANE.md) | traffic | G3 | **waiting_nick** | Nick must run 40 queries through Keyword Planner | load volumes, then final G3 | 2026-10-24 05:42 |
| 4 | [Recall Checks for Used-Car Dealers](../lanes/recall-checks/LANE.md) | revenue | G3 | **waiting_nick** | Nick must send outreach emails | tally replies, then final G3 | 2026-10-24 05:41 |
| 5 | Contract-Winner Intel (BidRadar add-on) | revenue | - | queued | | waiting for a free slot | |
| 6 | Benchmarking Compliance Backend | revenue | - | queued | | waiting for a free slot | |
| 7 | Weather-Trigger Job Alerts | revenue | - | queued | | waiting for a free slot | |
| 8 | Site-Selection Reports | revenue | - | queued | | waiting for a free slot | |
| 9 | Satellite Change Alerts | revenue | - | queued | | waiting for a free slot | |
| 10 | Filing Alerts (SEC EDGAR) | revenue | - | queued | | waiting for a free slot | |
| 11 | Supplier News Monitor | revenue | - | queued | | waiting for a free slot | |
| 12 | Energy Cost by Area Pages | traffic | - | queued | | waiting for a free slot | |
| 13 | River Levels for Paddlers | traffic | - | queued | | waiting for a free slot | |
| 14 | Air-Quality Alerts for Schools and Youth Sports | traffic | - | queued | | waiting for a free slot | |
| 15 | Food and Drug Recall Alerts | traffic | - | queued | | waiting for a free slot | |
| 16 | Rare-Bird Alerts | traffic | - | queued | | waiting for a free slot | |
| 17 | EV Road-Trip Planner | traffic | - | queued | | waiting for a free slot | |
| 18 | Next-Bus Lobby Displays | revenue | - | queued | | waiting for a free slot | |

## Gate timing (hours of wall-clock per gate, from lane.json)

| Lane | G0 | G1 | G2 | G3 | PLAN |
|---|---|---|---|---|---|
| permit-radar | 0.08 | 0.09 | 0.18 |  |  |
| storm-lead | 0.21 | 0.03 | 0.0 |  |  |
| great-lakes-conditions | 0.08 | 0.04 | 0.05 |  |  |
| recall-checks | 0.07 | 0.08 | 0.0 |  |  |

## Slot rules

- At most 4 lanes `active` at once. `waiting_nick`, `parked`, `killed`, `go` do not hold a slot.
- The daily tick promotes the lowest-numbered queued lane into a free slot.
- Merge candidates are flagged at G3 (see SCORECARD.md).
