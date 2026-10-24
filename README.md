# Nick's Task Desk

A small floating box on your screen that lists everything the Idea Factory needs from you. Click a task and you get a window with a step-by-step plan on the left and a real Claude Code chat on the right.

## How to use it

1. Press **Ctrl+Alt+T** (or click the check-mark icon in the tray) to show or hide the task box.
2. Click a task. The plan is on the left, Claude Code is on the right and already knows the task.
3. Work down the steps: tick each one, and use the buttons (Copy, Open, Gmail draft, paste boxes). Click the chat bubble on any step to ask Claude about it.
4. Type what happened into the notes box and press **Done** (or **Done & next** to go straight to the next task). **Skip** and **Snooze** are there too.
5. Use **Clear** in the chat header to wipe the conversation, or **Fresh chat** to start over on a clean slate. Your Done notes land in the factory's `ops/FROM_NICK.md`.

## Everything you type saves itself

There's no Save button to remember. Every box (your notes, every paste box, the Keyword Planner results) saves while you type.
- **"Saving…"** shows while you're typing. About a third of a second after you stop, it changes to a green **✓ Saved**, and by then the text is written to disk.
- **"All changes saved"** in the top bar of the task window is the one place to glance at.
- **Closing the window mid-sentence** still saves: the window writes what you typed before it closes.
- **Ticks and decision choices** save the moment you click them.
- **The API-key box is the one exception.** The app never stores it. The key only goes into the `.env` file, after you press **Save key** and confirm.

## Make it look the way you like

Click the **palette** button (top of the task box, or the top bar of any task window), or choose **Customize look…** in the ⋯ menu.
- **Theme:** Clay, Sage, Ocean, Plum, Honey or Graphite. This sets the colors and the accent used for buttons.
- **Frame:** what the window's border is made of. Paper (plain), Glass, Linen, Wood, Leather (with stitching), Brushed metal or Neon.
- **Light or dark:** Auto (follows Windows), Light or Dark.
- **Text size:** Small, Normal, Large or Larger.

Changes show up instantly in every open window and are remembered after a restart. The chat panel's colors follow the theme too.

## What it does, in plain language

**The task box** reads `C:\MrC\idea-factory\ops\NEEDS_NICK.md` every 60 seconds (and immediately when the file changes). It also picks up unchecked `- [ ]` lines that mention Nick in any `lanes/*/LANE.md`.
- **Order:** bold items first, then quickest first. "Optional" and "no action needed" items sit at the bottom with a dashed outline.
- **Card details:** a red-orange stripe marks urgent items, the lightning bolt marks quick wins (10 minutes or less), and a green ring shows how many steps you've ticked.
- **Badge:** the number on the tray icon is your open-task count.

**Plans** are written by Claude Code itself. When a new task shows up, the app quietly runs `claude -p` in the background, in that lane's folder.
- **Read-only:** the planner can only read files. It can't write, run commands or browse the web.
- **What it returns:** a short summary, the task type, a time estimate and 3-7 steps with buttons attached.
- **Caching:** plans are saved in `data\plans\` and only redone if the task's wording changes. You can also press **Regenerate**.
- **If it fails:** you get the raw task and an "Ask Claude" button.
- **Cost:** each plan uses some of your normal Claude plan usage. There are no API keys or extra bills.

**The chat** is the real `claude` program running inside the window (the same as in your terminal), styled to match. It uses your existing Claude Code login.
- **First open:** the app makes a copy ("fork") of the factory's most recent Claude Code session, so the chat starts out knowing everything the factory knows. Because it's a copy, it never adds messages to the factory's own running session.
- **Closing and reopening a task** brings back that task's own chat.
- **Fallbacks:** if there's no factory session to copy, it tries `--continue`, then starts a fresh chat.
- **Clear** sends `/clear`: same window, empty conversation.
- **Fresh chat** closes the current chat and starts a brand-new one for this task, without the factory history. Use it when you want a clean slate for the next thing.
- **Reset all chats** (in the ⋯ menu) does the same for every task. Old conversations are never deleted. You can still find them with `/resume` in Claude Code.
- **Permissions:** the chat uses your normal Claude Code permission settings. The factory's session runs in auto mode, and a forked chat inherits that, so every task brief tells Claude not to edit Idea Factory files unless you ask. Press Shift+Tab inside the chat to change the mode.

**Handing results back.** Pressing Done or Skip adds an entry to `ops\FROM_NICK.md`: date, lane, task, Done/Skipped, your notes, everything you pasted or chose, and how many steps you ticked. That is the **only** factory file the app ever writes. Paste the message in `HANDOFF.md` into your Idea Factory session once, so the factory reads FROM_NICK.md on every daily tick.

**API keys.** If a plan has a "Save key to .env" step, the key goes only into the `.env` file the task names, and the app asks you first. It's never saved in app data, logs or git.

**Emails.** For outreach tasks you get one row per draft, each with **Contact** (opens their contact page), **Copy** (subject and body) and **Gmail** (opens a filled-in Gmail compose window). Tick each row once it's sent. You attach the PDF and press send yourself; the app never sends anything.

## Test mode vs live

The ⋯ menu (or right-click the tray icon) has **Test mode (copies)** and **Live Idea Factory**.
- Test mode reads copies in `test-fixtures\`, so you can click anything safely, including Done.
- Each mode keeps its own memory: `data\state.test.json` for test, `data\state.json` for live.
- The app is set to **live** now.

## Starting with Windows

On first run the app put a shortcut on your desktop and one in your Startup folder, so it starts quietly in the tray when you log in.

**To turn auto-start off:** open the ⋯ menu (or right-click the tray icon) and untick **Start with Windows**. Or press Win+R, type `shell:startup`, and delete "Nick's Task Desk".

## Where things live

| What | Where |
|---|---|
| The app | `C:\MrC\task-desk` |
| Your ticks, notes, snoozes, chat links (live) | `data\state.json` |
| Cached plans | `data\plans\live\`, `data\plans\test\` |
| Settings (mode, paths, hotkey, look) | `data\settings.json` |
| Test copies of the factory files | `test-fixtures\` |

`data\` is not committed to git.

## For agents working on this repo

- `npm start` runs the app. `node test/gen-plans.js` pre-builds plans. `node test/e2e.js` runs the click-through test in test mode. `node test/look.js` tests autosave and the look settings and saves a screenshot of every frame to `test/shots/`.
- The main process is in `src/main/`: `tasks.js` (parser), `planner.js`, `chat.js` (node-pty + claude), `state.js`, `handback.js`, `main.js`. The screens are in `src/renderer/`.
- Rules: the Idea Factory folder is read-only except appending to `ops/FROM_NICK.md`. Local only, no API keys, and never send, post, buy or sign up on Nick's behalf.
