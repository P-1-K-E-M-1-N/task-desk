# Workshop status (sample data)

_This folder is a made-up workspace used by Task Desk's tests. Every lane, business and number in it is fictional._

**Last tick:** 2026-10-24 06:00 (`python -m core.tick`, 4 lanes, 0 errors)

| Lane | Type | Gate | Status | Waiting on |
|------|------|------|--------|------------|
| menu-boards | revenue | G2 | waiting | you: send outreach, confirm license |
| snow-alerts | revenue | G3 | waiting | you: send outreach |
| trail-reports | traffic | G3 | waiting | you: keyword volumes |
| bike-tuneups | revenue | G3 | waiting | you: send outreach, decide product |

## Running it by hand

```
python -m core.tick
```

Reads `ops/FROM_NICK.md` first, continues each lane from your notes, then regenerates `ops/NEEDS_NICK.md`.
