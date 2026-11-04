# Changelog

Changes a user would notice, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

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
