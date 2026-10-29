# Nick's Task Desk

A small floating box on your screen that lists everything your projects need from you: the Idea Factory, plus any other project you add. Click a task and you get a window with a step-by-step plan on the left and a real Claude Code chat on the right.

## How to use it

1. Press **Ctrl+Alt+T** (or click the check-mark icon in the tray) to show or hide the task box.
2. Click a task. The plan is on the left, Claude Code is on the right and already knows the task.
3. Work down the steps: tick each one, and use the buttons (Copy, Open, Gmail draft, paste boxes). Click the chat bubble on any step to ask Claude about it. Tell the chat what you did ("sent it") and it ticks the step and adds a comment for you.
4. Type what happened into the notes box and press **Done** (or **Done & next** to go straight to the next task). **Skip** and **Snooze** are there too.
5. Use **Clear** in the chat header to wipe the conversation, or **Fresh chat** to start over on a clean slate. Your Done notes land in the factory's `ops/FROM_NICK.md`.

## One desk for all your projects

The name at the top left of the box (next to the check-mark icon) is the **project switcher**. Click it to pick:
- **All projects:** every project's open tasks in one list, sorted the same way (urgent first, then quickest first). Each card says which project it's from, and the chips filter by project.
- **One project:** only its tasks, with chips for its sections.
- **Add a project…** and **Edit this project…**

The same list is in the ⋯ menu and the tray icon's right-click menu. The tray number counts every project.

**Adding a project.** Click **Add a project…**. The form has eight numbered boxes, and these steps use the same numbers. Only 1 is required.
1. **Name:** what the project is called in the switcher.
2. **Folder:** where the project lives. Press **Choose…**. Task Desk then fills in 1 and 3 for you when it can (it looks for TODO.md, TASKS.md, NEEDS_NICK.md and similar).
3. **Where its tasks come from:**
   - **A checklist file:** every `- [ ] something` line in that file becomes a task, and `## Headings` become groups. Ticked `- [x]` lines are skipped. The form shows how many tasks it found right away. Tick **Only show lines that mention me** for a shared file.
   - **Only tasks I add here.**
   - Either way, a box for typing tasks appears at the top of the project ("Add a task to…"). Press Enter and Claude drafts a plan for it. Those tasks show under "My list".
4. **When I press Done, my notes go to:** kept in Task Desk (open them from the ⋯ menu), or added to the end of a file in the project folder (FROM_NICK.md by default) so that project's agents can read what you did.
5. **The chat:** whether it may change files in the folder. It's off by default: Claude helps but leaves the folder alone unless you ask.
6. **Anything Claude should know** (optional): notes for the planner, like "Repairs go through Mike".
7. **Color:** used for the project's dot.
8. **Look** (optional): give the project its own theme, frame and colors. See "A look for each project" below.

**For agents telling Nick how to add a project:** give your answers by these same numbers (1 Name, 2 Folder, 3 Where its tasks come from, 4 When I press Done, 5 The chat, 6 Anything Claude should know, 7 Color, 8 Look), with the exact text to type or the exact option to pick.

**Editing a project** saves as you type, like every other box. **Remove project** takes it out of the box. It never touches the folder, and your notes stay in the app data in case you add it back.

**Safety rules for projects:**
- Task Desk only reads a project's checklist file. It never edits it.
- The only file it writes in a project folder is the results file you chose. The results file has to be inside that folder.
- The Idea Factory stays read-only, apart from its own FROM_NICK.md. A project pointing at a factory folder can only keep its notes in Task Desk.
- If a project's folder isn't on this computer, the box says so and offers **Fix the folder**.

Every project task gets everything the Idea Factory has: a plan, buttons, autosave, a chat that ticks steps for you, and Done / Skip / Snooze / Done & next.

## Use it on more than one computer (OneDrive)

Everything is saved on this computer by default. To have the same desk on another PC:
1. On this computer, choose **Keep my data in OneDrive…** in the ⋯ menu. Task Desk copies your projects, ticks, notes, plans and look settings to `OneDrive\Task Desk` and restarts.
2. On the other computer, install Task Desk (see "Setting up another computer" below) and choose **Keep my data in OneDrive…** there too. It sees the data that's already there and offers **Use the data in OneDrive**.

Some things stay separate on each computer:
- **Per computer:** the box's position, Start with Windows, and chat history (each computer's Claude Code keeps its own).
- **Never in OneDrive:** API keys.
- **One computer at a time:** OneDrive can't merge two copies of the same file. If the desk is already open on another computer, Task Desk warns you before it opens.
- **Moving back:** **Move my data back to this computer…** in the ⋯ menu copies everything home and stops using OneDrive on this PC.

**Setting up another computer:**
1. Install Node.js and Claude Code, and sign in to Claude Code.
2. Copy the `task-desk` folder over, without its `data` and `node_modules` folders, or clone the private GitHub repo. Then run `npm install` inside it.
3. Start it with `npm start`. It makes its own desktop and Startup shortcuts.

Projects whose folders are in OneDrive work on both computers. A folder that only exists on one computer shows the "folder isn't on this computer" note on the other.

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
- **Frame:** what the window's border is made of. Paper (plain), Glass, Linen, Wood, Leather (with stitching), Brushed metal or Neon, plus the moving frames below.
- **Light or dark:** Auto (follows Windows), Light or Dark.
- **Text size:** Small, Normal, Large or Larger.

- **Moving frames:** Aurora, Magma, Stars and Rainbow drift slowly.
  - **Bubbler:** drawn live like a liquid motion bubbler. Colored drops form at the top corners, fall through clear oil (bigger drops fall faster and sometimes merge) and land in a pool with a ripple, while little air bubbles wobble up.
  - **Lava lamp:** wax blobs warm up in the glow at the bottom, rise, cool off at the top and sink again.
  - **My picture:** any picture, or a GIF to make it move. Task Desk keeps a copy in its data folder.
  - **Motion → Keep still** freezes every moving frame. They also hold still when Windows' animation effects are off.
- **Your colors:** pick an **Accent** (buttons and highlights), a color for the **Task cards** (pink task boxes, for example), and a **Background** tint. Each has preset colors and a picker for any color, and Task cards and Background have a **Strength** slider. **Theme** puts the theme's own color back.
- **Corners:** Sharp, Normal, Round or Extra round.

Changes show up instantly in every open window and are remembered after a restart. The chat panel's colors follow the theme too.

**A look for each project.** While a project is showing in the box, the look panel says so at the top.
- **Give it its own look:** that project gets its own theme, frame and colors, starting in the project's color. The box switches to it whenever you show that project, and so do that project's task windows.
- **Use the desk's look:** takes the project back to the shared look.
- **New projects start with their own look** (bottom of the look panel) turns this on for every project you add from then on. The Add a project form also has a box 8 for it.

## Stretch the box

The box keeps its size until you unlock it.
1. Rest the mouse in the box's **bottom-right corner** for 3 seconds. A small lock fades in.
2. Click the lock to **unlock**. A grip appears beside it.
3. Drag the grip to make the box wider (up to 1000 pixels) or taller. You can also drag the box's edges.
4. Click the lock again to **lock** the size.

The size is remembered on this computer. It isn't synced through OneDrive, because screens differ.

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

**The chat keeps your plan up to date.** Each task's chat has three Task Desk tools, and they only work on that one task:
- **Read the plan:** see the steps, which are ticked, any comments, and your notes. Claude checks this when it starts or resumes, so it knows what's already done.
- **Update a step:** tick it done (or un-tick it) and leave a short comment under it, marked "Claude", such as "Form sent 10/24, ticket #123".
- **Add to your notes:** append a line to "Notes for the factory". It never replaces what you wrote.

Claude does this as soon as a step is finished or you tell it you did one ("I sent the form"). You'll see the step tick itself, a short highlight, and a small pop-up. Claude never presses Done or Skip; you still finish the task yourself. Step comments go to FROM_NICK.md with your notes when you press Done.
- **How it works:** the app listens on your own computer only (127.0.0.1), with a secret code that changes every time the app starts. Each chat is told which task it belongs to, so it can't change any other task.
- **Older chats** get the tools too, the next time they're opened.

**Handing results back.** Pressing Done or Skip adds an entry to `ops\FROM_NICK.md`: date, lane, task, Done/Skipped, your notes, everything you pasted or chose, and how many steps you ticked. That is the **only** factory file the app ever writes. Paste the message in `HANDOFF.md` into your Idea Factory session once, so the factory reads FROM_NICK.md on every daily tick.

**API keys.** If a plan has a "Save key to .env" step, the key goes only into the `.env` file the task names, and the app asks you first. It's never saved in app data, logs or git.

**Emails.** For outreach tasks you get one row per draft, each with **Contact** (opens their contact page), **Copy** (subject and body) and **Gmail** (opens a filled-in Gmail compose window). Tick each row once it's sent. You attach the PDF and press send yourself; the app never sends anything.

## Test mode vs live

The ⋯ menu (or right-click the tray icon) has **Idea Factory: test copies** and **Idea Factory: live**.
- Test mode reads copies in `test-fixtures\`, so you can click anything safely, including Done.
- Each mode keeps its own memory: `data\state.test.json` for test, `data\state.json` for live.
- The switch only affects the Idea Factory. Your other projects always read their own folders.
- The app is set to **live** now.

## Starting with Windows

On first run the app put a shortcut on your desktop and one in your Startup folder, so it starts quietly in the tray when you log in.

**To turn auto-start off:** open the ⋯ menu (or right-click the tray icon) and untick **Start with Windows**. Or press Win+R, type `shell:startup`, and delete "Nick's Task Desk".

## Where things live

| What | Where |
|---|---|
| The app | `C:\MrC\task-desk` |
| Idea Factory ticks, notes, snoozes, chat links (live) | `data\state.json` |
| Other projects' ticks, notes, added tasks, kept results | `data\projects\<id>\` |
| Cached plans | `data\plans\live\`, `data\plans\test\`, `data\plans\projects\` |
| Frame pictures you chose | `data\look\` |
| Settings (projects, mode, paths, hotkey, look) | `data\settings.json` |
| This computer only (box position and size, size lock, auto-start, where the data is) | `data\machine.json` |
| Test copies of the factory files | `test-fixtures\` |

If you moved your data to OneDrive, everything except `machine.json` lives in `OneDrive\Task Desk` instead. **Open app data folder** in the ⋯ menu always opens the right place. `data\` is not committed to git.

## For agents working on this repo

- `npm start` runs the app. `node test/gen-plans.js` pre-builds plans. `node test/e2e.js` runs the click-through test in test mode. `node test/chat-tools.js` checks that the chat can tick and comment on its own plan (`src/main/bridge.js` + `src/mcp/taskdesk-mcp.js`). `node test/look.js` tests autosave and the look settings and saves a screenshot of every frame to `test/shots/`. `node test/projects.js` covers projects, quick add, the All view, the factory guard and the OneDrive data folder (Claude plans 3 small tasks).
- Tests run in their own temporary data folder and browser profile (`test/env.js`), so they never touch the real settings or ticks and can run while the real desk is open.
- The main process is in `src/main/`: `tasks.js` (parser), `projects.js` (projects), `planner.js`, `chat.js` (node-pty + claude), `state.js` (one memory file per project), `config.js` (shared settings vs `machine.json`), `handback.js`, `main.js`. The screens are in `src/renderer/` (`box`, `task`, `project`). The Bubbler and Lava lamp frames are drawn on a canvas by `src/renderer/liveframe.js`; the look panel and your colors are in `ui.js`.
- Rules: the Idea Factory folder is read-only except appending to `ops/FROM_NICK.md`. Local only, no API keys, and never send, post, buy or sign up on Nick's behalf.
