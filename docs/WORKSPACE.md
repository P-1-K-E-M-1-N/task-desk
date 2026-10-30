# Lanes workspace (optional)

Most people only need projects (see the [guide](GUIDE.md)). This is for a bigger setup: one folder where several AI agents each work on a "lane", and each agent writes down what it needs from you in shared files. Task Desk can read that folder as one more source of tasks. It's off until you connect one.

## The layout it expects

The file names are fixed:

```
<workspace>/
  ops/NEEDS_NICK.md        what the agents need from you, grouped by "## lane-name" headings
  ops/FROM_NICK.md         Task Desk appends your Done/Skip notes here (created if missing)
  lanes/<lane>/LANE.md     each lane's notes; unchecked "- [ ]" lines that mention your name become tasks too
```

- **Read-only:** Task Desk never changes anything else in the workspace. It only appends to `ops/FROM_NICK.md`. A project pointed at a folder inside the workspace has to keep its notes in Task Desk.
- **Plans and chats:** each task is planned and chatted about in its lane's folder. A Claude Code chat starts from a copy of that folder's newest session, so it knows what the lane's agent knows without writing into its session.
- **Your name:** "mention your name" uses the name from **Your name…** in the ⋯ menu.

## Connecting it

1. In the ⋯ menu choose **Connect a lanes workspace…** and pick the folder (it must have `ops\NEEDS_NICK.md`).
2. The workspace shows in the box's project switcher under the folder's name. To call it something else, set `factoryName` in `data\settings.json`.
3. **Disconnect** in the ⋯ menu turns it off again. Your ticks and notes are kept.

## Test copies vs live

With a workspace connected, the ⋯ menu has **test copies** and **live** for it.
- **Test copies** read the sample in `test-fixtures\`, so you can click anything safely, including Done.
- **Memory:** each mode keeps its own, `data\state.test.json` for test and `data\state.json` for live.
- **Other projects** don't change with the mode.

## Telling the workspace's agents

Paste this into the workspace's main agent session once, so it reads your notes:

> I now finish NEEDS_NICK items in a separate app (Task Desk). Every time I mark a task DONE or SKIP, it appends a dated entry to `ops/FROM_NICK.md` with the lane, the task text, my notes and any results I pasted (keyword volumes, replies, decisions). On every daily tick, read `ops/FROM_NICK.md` first. For each entry you haven't handled yet, continue that lane from my notes, tick the matching box in the lane's `needs_nick.md` (or `ops/needs_nick_global.md`) so it drops off NEEDS_NICK.md, and note in the lane log which FROM_NICK entry you acted on. Don't edit or reorder FROM_NICK.md itself: it's append-only and the app writes to it.
