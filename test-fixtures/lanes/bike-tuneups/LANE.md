# Bike Tune-up Reminders

**Type:** revenue  |  **Queue order:** 4

_Sample data. This lane, its sources, the shops and the numbers are made up for Task Desk's tests._

## Current state

G0, G1 and G2 passed. G3 is provisional until the outreach replies are in, and there is a product decision to make first (see needs_nick.md).

## G0 Data check

**Result: PASS** (4 minutes, 2026-10-24 05:32-05:37 UTC; 12 live requests, 0 errors).

- Service-interval tables for 6 makers: public PDFs and HTML, keyless, change once a year.
- Per-bike service history: nothing public. Shops keep it in their point-of-sale software.

**What the data cannot do:** say whether a particular bike is due. Only "bikes of this model year are usually due this month". The product is a calendar, not a reminder service, unless a shop shares its own records.

## G1 Sample

**Result: PASS** (5 minutes). `refresh.py` builds `samples/tuneup_calendar.csv`, `.html` and `.pdf` for 20 common models.

## G2 Demand test

**Result: PASS (pack written).** `outreach/emails.md` has 3 drafts with the 3-question survey; `outreach/replies.md` is the empty tally. Nothing sent.

## G3 Decision

**PROVISIONAL.** `g3_score.py`: demand 3, repeat_use 3, competition 4, license 5, build_effort 5 = 20/25. GO only if two of three shops say "yes" to the calendar as-is.

## Log

- 2026-10-24 05:27 lane created from ops/INBOX.md
- 2026-10-24 05:37 G0 pass; product shrinks to a calendar
- 2026-10-24 05:41 G1 pass, G2 pack written
