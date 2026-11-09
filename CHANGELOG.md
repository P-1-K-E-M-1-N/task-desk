# Changelog

Changes a user would notice, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added
- **A task's chat waits for Start.** Opening a task shows its plan and a **Start** button in the chat panel. Claude does nothing on the task until you press it, so you can read the plan first. A task that had a chat before shows **Resume** instead. Chats that were running when Task Desk updated itself still carry on by themselves.
- **Start chats on their own, per project.** Tick **Start chats on their own** under the Start button (or the new box in **5 The chat** when you edit a project) and that project's chats start as soon as you open a task, as before. Untick it to go back.
- **Stop buttons.** **Stop** above a task's chat (and above a main chat) stops what Claude is doing, like pressing Esc in the chat. The chat stays open, so you can tell it what to do instead. **Stop all** at the bottom of the box (and in the tray menu) does that for every chat at once, and right-clicking a task offers **Stop its chat**. A stopped main chat isn't handed task notes until you type in it again.

### Changed
- **Smoother scrolling, especially on a touchpad.** In the chat panels, Claude Code now runs in its classic view, so the panel scrolls the conversation itself, right away, instead of passing every touchpad movement to Claude Code and waiting for it to redraw. A touchpad scrolls as far as your fingers move, where before it went about half as far. A mouse wheel scrolls as before. To go back to Claude Code's full-screen view, use **Chat scrolling** in the ⋯ menu; it applies to chats started after the change, and each computer keeps its own choice. In the box and the task window, the moving frames (aurora, lava, rainbow, stars and the drawn ones) hold still while you scroll, and the bar under a task's plan is no longer frosted glass, so lists respond faster.
- **Writing plans looks like writing plans.** When a project is added, a line at the top of the box says plans are being written, that Claude only reads the project for this, and that no task is worked on until you open it. A task waiting for its plan shows a dim sparkle, and the one being written shows a pulsing one.
- ⋯ **Stop the chat** in a task's chat panel is now **Close the chat**, since **Stop** is its own button.

### Fixed
- Task Desk couldn't always tell when a Claude Code chat was working or waiting for you. Newer Claude Code versions space their words with cursor moves, which Task Desk read as no space at all. The **Needs a yes/no** and **Your turn** cues read them correctly now.
- Clicking into a chat window no longer counts as typing, so a "Your turn" badge stays until you actually type.
## 1.2.4 - 2026-11-08

### Added
- **Several chats in one project work together.** Each task's chat can say what it's doing (one line, on the task's card and visible to the project's other chats), sees the others' lines, progress and files when it starts, and gets a "Meanwhile" note when they change. A chat that may edit files asks Task Desk before every edit: a file another chat is in right now is off limits (the edit is stopped and the chat is told who has it), and a file a chat has finished with changes hands. No more two chats changing the same file.
- **Task chats report to the main chat.** When a task is done, and when a chat has something the plan should know, a note goes to the project's main chat (the chat-bubble button at the top of the box). It's handed in as a message when that chat is open and free, else it waits, and the button shows how many notes are waiting.
- **See which chat needs you.** With several task windows open, the one waiting on you stands out: its taskbar button flashes, its card in the box gets an orange **Needs a yes/no** badge (or a quiet **Your turn** once the chat has finished and is waiting for your next message), the tray count turns orange, and a Windows notification names the task; click it to bring that window up. Under **When a chat needs you** in the ⋯ menu, turn the flash or the notification off and pick a sound (Chime, Ping or Knock; off to start with). Task Desk reads this from the chat's screen, so it works with Claude Code, Codex and Gemini.

## 1.2.3 - 2026-11-08

### Added
- **Snooze until a day you pick.** The Snooze button in the task window (and "Snooze until a day…" when you right-click a task) now has a calendar: pick any day from tomorrow up to a year away, and the task comes back that morning at 8, like the other snoozes.
- **The chat can snooze a task for you.** When you tell it to come back to this later ("snooze this until the 14th"), it agrees the day with you, puts the task away with its new `snooze_task` tool, and leaves a line in your notes about why. It never snoozes on its own, and the task window stays open until you close it.

## 1.2.2 - 2026-11-07

### Fixed
- At the box's default width, a project's name could vanish from the top of the box when all the buttons were showing (the main chat button made it one too many). The name now always keeps some room; the gap and the buttons give way first.

### Changed
- **Start with Windows is a choice now.** The first start makes a desktop shortcut and a Start menu entry, and nothing in the Startup folder until you tick **Start with Windows** in the ⋯ menu. Copies that already start with Windows keep doing so. Company-safe mode keeps it off and removes a Startup shortcut that's there. A program that adds itself to Startup on its first run is what endpoint security calls persistence, and SentinelOne said so on a work computer.
- Task Desk finds `claude`, `git` and the other AI apps by looking along PATH itself, instead of running Windows' `where.exe` in a hidden console (another thing endpoint security reports).
- SECURITY.md has a new section, **What endpoint security sees**: what SentinelOne reported about the app, what each item really was, and what to ask an IT team for. The README's work-computer notes point to it.

## 1.2.1 - 2026-11-06

### Added
- **Main chat**: with one project showing, the chat-bubble button at the top of the box reopens that project's own Claude Code session (the one that writes its tasks) in a Task Desk window, right where you left off. Task Desk finds it among your saved sessions (the newest one that wrote the project's checklist or got Task Desk's instructions), and you can pick another one or start a new one.

### Changed (security)
- Writing plans and putting tasks in order run Claude Code with `--restricted --strict-mcp-config`, so a project folder's own settings, hooks and MCP servers never run there, and its file tools stay inside the folder.
- A chat that may not change files also has its command tools turned off (Bash and PowerShell for Claude Code, shell commands for Gemini). The README now says plainly that chats can still read files and use the web.
- A copy without its list of trusted signing keys installs no updates, instead of skipping the check.
- **Later** in the update window no longer installs the update once you're idle; the next check asks again.
- Settings that belong to one computer (`passEnv`, folders, auto-update and the rest of `machine.json`) are never taken from a settings file shared through OneDrive.
- The README and SECURITY.md explain how to check your copy's signature once, and how a signing key is changed or retired.

## 1.2.0 - 2026-11-04

### Added
- The box lists the tasks you can do right now first, A to Z (urgent ones still on top), and puts a task after the ones it has to wait for. The AI works this out for each project and again whenever its tasks change. Cards that wait say "after 1 task". Turn it off with **Put my tasks in order (AI)** in the ⋯ menu.
- With one project showing, the bar at the top is a rough guess at how far the whole project is toward its goal, with the goal written under it.
- Pick Claude's model and effort for every project, for one project, or (once you turn it on) for a single task, from the AI button at the bottom of the box.
- With your data in OneDrive, each computer can keep its projects' folders (and the lanes workspace's) somewhere else. Picking a folder with **Fix the folder** on one computer no longer changes it on the others.
- `npm install --omit=dev` now gives a working desk with only what it needs to run (Electron moved out of the developer tools), and daily updates keep it that way. The README says what to tell your IT team if security software flags the install.
- Right-click a task in the box to open it, choose its Claude model, snooze it, redraft its plan or copy its text.
- **Company-safe mode** (⋯ menu, or `TASKDESK_SAFE_MODE=1` from an IT team) for a work computer: no automatic updates, no Chrome for chats, Claude Code only, and the data kept off OneDrive.

### Changed (security)
- Updates must be signed with the maintainer's key (`tools/allowed_signers`), checked against the list already installed. An unsigned update is never installed, and only the exact version that was checked goes in.
- Updating by itself is now off for new installs: **Check for updates now** shows what changed and asks first. Copies that already updated themselves keep doing so.
- Updates that change the packages reinstall them with `npm ci --ignore-scripts` (exact locked versions, no install scripts), then Electron's own checked download. `git`, `node` and `npm` run by their full paths, never through a shell. A failed update goes back and tells you so.
- Chats no longer get your Chrome browser unless you turn it on: a task's **Chrome** button goes off, look only, working; **Claude and Chrome** in the ⋯ menu sets the default.
- A chat that may not change files really can't: Claude Code starts with its edit tools turned off, and Gemini gets its file-writing tools turned off and asks before every action.
- Open buttons open documents from a list of safe types (no programs, scripts, shortcuts, web pages or macro files, no network paths). Links, email drafts with a recipient, and files or folders outside the task's folder show the whole address and ask first.
- Keys are only written into a `.env` or `.env.local` file inside the task's folder, never through a link, and a key with spaces, quotes or other odd characters is refused instead of written.
- The AI apps start with only the environment variables they need, not your other tools' API keys and tokens.
- Each chat gets its own token for the plan tools, kept in a file rather than on a command line, and deleted when the chat stops.
- Plans are checked strictly before their buttons are made, and text from project files is marked as data the plan writer must not take instructions from.
- The windows can't open pop-ups or navigate away, and everything from tasks, plans and settings is escaped before it's shown.
- Settings from OneDrive are checked again when they're used (results files, checklists, project ids, lane names), settings are written atomically, and a damaged settings file is kept aside instead of overwritten.

## 1.1.1 - 2026-10-30

### Fixed
- Running the tests can no longer repoint your desktop, Start menu or startup shortcuts at the copy being tested, or run the daily update from it.

## 1.1.0 - 2026-10-30

### Added
- Eight task types instead of six (Reach out, Ask someone, Tell the AI, Decide, Create an account, Set up or connect, Check or test, Research), each with its own icon and color. The tile's shape says what kind of work it is: a circle for talking to people, a diamond for your call or your knowledge, a rounded square for clicking through a website. Saved tasks move to the closest new type by themselves.
- `npm test` runs the tests that need no AI app; `npm run test:all` runs every test.
- ESLint (`npm run lint`), an `.editorconfig`, and CI on GitHub Actions that lints and tests every pull request on Windows.
- Prettier (`npm run format`), checked in CI alongside ESLint.
- An MIT license, a contributing guide, a security policy, a code of conduct, issue and pull request templates, Dependabot.

- Unit tests (`npm run test:unit`, part of `npm test`) for the checklist parser, project settings, results files and task state.
- A log file, `data\taskdesk.log`, for errors you never saw (a watcher that couldn't start, a state file that couldn't be saved, an unexpected error). It stays under a megabyte.

### Changed
- The three windows now run in Chromium's sandbox with a strict content security policy (no inline scripts, nothing from the network), and the app only answers messages from its own pages.
- **Open** buttons in a plan open documents and folders only; a path to a program (.exe, .bat, .ps1, .lnk and the like) is refused.
- The folder picker starts in your home folder instead of the first owner's.
- Installed copies now follow the `release` branch, so a change merged into `main` reaches them only when it's promoted. See "How releases work" in CONTRIBUTING.md.

## 1.0.0 - 2026-10-30

The first version tagged as a release. Everything before it was in daily use without version numbers; this is what it does today.

- A floating always-on-top task box (Ctrl+Alt+T, tray icon, taskbar button) that lists what your projects need from you.
- Projects: a checklist file or tasks you type in, Done notes kept in the app or appended to a results file, a project switcher, quick add, per-project colors and looks.
- A task window per task: a step-by-step plan with Copy / Open / Gmail-draft / paste buttons, autosave, and a real AI chat beside it that can tick steps and add notes through its own tools.
- Pick the AI: Claude Code (default), OpenAI Codex or Google Gemini CLI, per desk, per project or per task, with a hand-over when you switch mid-task.
- Looks: six themes, frame materials, moving frames (aurora, magma, stars, rainbow, bubbler, lava lamp, day & night sky), your own picture, custom colors, corner roundness, text size, light / dark / day-and-night.
- OneDrive: keep the data folder in OneDrive to use the same desk on two computers.
- Daily 7 AM self-update from GitHub: screen-only updates refresh in place and keep chats running; others restart and reopen your task windows.
- An optional lanes workspace for folders where several agents share one to-do file.
