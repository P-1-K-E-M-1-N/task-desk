# Task Desk

[![CI](https://github.com/P-1-K-E-M-1-N/task-desk/actions/workflows/ci.yml/badge.svg)](https://github.com/P-1-K-E-M-1-N/task-desk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A small always-on-top Windows app that lists what your projects need you to do, and opens each task with a step-by-step plan and an AI chat that already knows the task.

It's for people who run projects with AI agents and end up with a pile of human-only jobs: send this email, sign up for that, decide between two options, paste a reply back. Task Desk reads those to-do items from your project folders and shows them in a floating box. Click one and a task window opens with two halves. On the left is a plan with buttons for each step (copy text, open a link, draft a Gmail message, paste a result). On the right is a real Claude Code chat running in that project's folder. You can also use OpenAI's Codex or Google's Gemini CLI there instead. The chat can tick steps and add notes as you go. When you press Done, your notes go back into the project, where its agents can pick them up.

**Status:** in daily use on Windows. It started as one person's tool, so expect rough edges, but nothing in it is tied to a particular setup.

## Requirements

- **Windows 10 or 11.** It relies on Windows shortcuts, the taskbar and `where`, and it hasn't been tried on macOS or Linux.
- **Node.js with npm.** It's tested with Node 24.
- **Git,** if you want the app to update itself.
- **At least one AI command-line app, installed and signed in.** Claude Code is the default and uses your normal Claude plan login.
  - **Claude Code:** `npm install -g @anthropic-ai/claude-code`, then run `claude` once to sign in.
  - **Codex** (optional): `npm install -g @openai/codex`, then `codex login` with a ChatGPT account.
  - **Gemini CLI** (optional): `npm install -g @google/gemini-cli`, then run `gemini` and choose "Sign in with Google".

No API keys are needed. Each AI app runs on its own account login.

## Setup

```powershell
git clone -b release https://github.com/P-1-K-E-M-1-N/task-desk.git task-desk
cd task-desk
npm ci --omit=dev --ignore-scripts
node node_modules/electron/install.js
npm start
```

What the two install lines do:
- `npm ci` installs exactly the versions listed in `package-lock.json`, each checked against its recorded checksum. `--omit=dev` leaves out the developer tools (24 packages instead of 103). `--ignore-scripts` stops every package from running its own install script.
- `node node_modules/electron/install.js` downloads Electron, the program that runs the app, and checks it against the checksums that ship in the Electron package. It's the only download that needs a script, so it runs as its own step where you can see it.

To change the code or run the tests, use `npm ci --ignore-scripts` without `--omit=dev`; that adds the code checker, the formatter and the test tools. Updates keep whichever you chose.

**On a work computer,** read [Company-safe mode](#company-safe-mode) first, and expect your security software (SentinelOne, CrowdStrike, Defender for Endpoint…) to notice the install: one window downloads and unpacks many files, including programs (`electron.exe`, `ffmpeg.dll`). That's your IT team's call, not something to work around. Ask them to allow it, and tell them what it does:
- it runs from the folder you cloned it to, as you, with no admin rights and no installer;
- `node_modules\electron\dist\electron.exe` is the app; it starts `git` and the AI app you installed (`claude`);
- it never updates itself unless you turn **Update automatically** on (Company-safe mode keeps it off);
- it adds a desktop, Startup and Start-menu shortcut, and talks to nothing on the internet itself (the AI app uses its own sign-in).

`-b release` puts you on the release branch, which is what the daily self-update follows. Without it you get `main`, which holds the changes that passed the last full test run but haven't been released yet. Day-to-day work happens on `dev`.

The first start does three things:
- creates a `data\` folder next to the app,
- puts a shortcut on the desktop and one in the Startup folder (so it starts with Windows, in the tray),
- adds a Start menu entry.

To pin it to the taskbar, right-click its taskbar button and choose **Pin to taskbar**.

On a new desk, Task Desk asks what to call you, which the AI uses. Then it shows **Add your first project**. The form has nine numbered boxes, and only the name is required.

## Usage

1. **Open the box:** press **Ctrl+Alt+T**, or click the taskbar or tray icon.
2. **Open a task:** click it. The plan is on the left and the chat on the right.
3. **Work the steps:** tell the chat what you did ("sent it") and it ticks the step and leaves a comment. You can also tick steps yourself.
4. **Finish:** type what happened into the notes box and press **Done** (or **Skip**, or **Snooze**).

`npm run hidden` starts it straight to the tray without showing the box.

**Hooking up another AI chat.** The clipboard button at the top of the box copies ready-made instructions to paste into Claude Code, Codex or any other AI chat:
- **"Set up a new project for Task Desk"** tells that chat to keep your to-do items in `TODO.md`, read your results from `TASK_RESULTS.md`, and walk you through the Add a project form box by box.
- **With a project showing,** it also offers that project's own version, with its real file paths filled in.

**Where tasks come from.** Each project you add reads one of two things:
- **A checklist file in its folder.** Every unchecked `- [ ] ...` line is a task, and `## Headings` become groups. The app only reads this file.
- **Only the tasks you type into the box.**

**Where your Done notes go.** You choose per project: kept inside Task Desk, or appended to a results file in the project folder (`TASK_RESULTS.md` by default), where the project's own agents can read them. The results file is the only file Task Desk writes in a project folder.

**What order the tasks are in.** The box lists first the tasks you can do right now, A to Z (urgent ones on top, low-priority ones at the bottom), and puts a task after the ones it has to wait for ("make the account" before "paste its key"). Those show "after 1 task" on their card; hover over it to see which one and why. The AI works this out once for each project, and again whenever its tasks change, so a new task can slot in ahead of older ones. Turn it off with **Put my tasks in order (AI)** in the ⋯ menu, and the tasks are just A to Z.

**How far the project is.** With one project showing, the bar under the task count is a rough guess at how far the whole project is toward its end goal, counting the AI's work as well as yours, with the goal written under it. Until the AI has looked, the bar shows the share of tasks done instead. It's only a rough guess, and it gets better as the project goes on.

**Which Claude model, and how hard it thinks.** Click the AI button at the bottom of the box, then **Claude model and effort…**. In **All projects** that sets the choice for every project; with one project showing it sets that project's. Tick **Let a task have its own** to give single tasks their own: right-click a task in the box and pick **Claude model and effort…**. A task uses its own choice first, then its project's, then the desk's, and "Usual" means "whatever comes next in that line". Bigger models and higher effort use more of your Claude plan. A chat that's already open keeps its model until you close the task and open it again.

**Right-click a task** for more: open it, choose its Claude model, snooze it until tomorrow, redraft its plan, or copy its text.

**A project's main chat.** With one project showing, the chat-bubble button at the top of the box opens that project's *main chat*: your own Claude Code session that writes the project's tasks (the one you set the project up with), not a task's chat. Task Desk finds it among the Claude Code sessions saved on this computer. It's the newest session that wrote the project's checklist file, or that you gave Task Desk's instructions to (the **Copy for another AI chat** text), wherever you started it. It reopens right where you left off, in a Task Desk window, as plain Claude Code with your normal settings: none of the task chats' limits apply. **Other sessions** lets you pick a different one, and **New main chat** starts one in the project's folder; Task Desk remembers your choice on this computer. If the same session is also open in a terminal, close it there first, so the two don't both write to it. Closing the window stops the chat; it resumes next time.

**Claude and your Chrome browser.** A chat doesn't get your Chrome unless you turn it on. The **Chrome** button above a task's chat goes from **off** to **look only** (Claude reads the pages you open from the plan when you ask) to **working** (it may also click and type there, which uses more tokens; you still press send, submit or pay yourself). Turning it on or off restarts the chat, which picks up where it was. **Claude and Chrome** in the ⋯ menu sets the starting point for every task.

**What the Open buttons do.** A plan's buttons open documents (Markdown, text, PDF, pictures, Word, Excel and PowerPoint files without macros…) and folders, never programs, scripts or shortcuts. A document inside the task's own folder opens straight away. Anything else asks first and shows the whole path: a link from the plan (once per link), an email draft with a recipient filled in, or a file or folder outside the task's folder. The plan is written by the AI from your project's files, so check that the address is one you expect.

**What a chat may change.** A Claude chat can only change files when the project's **The chat may change files** box is ticked (box 5). Otherwise Task Desk starts Claude Code with its editing tools *and* its command tools (Bash, PowerShell) turned off, because a command could change files too. Codex runs in a read-only sandbox in the same case, and Gemini gets its file-writing and command tools turned off. What this doesn't do: it doesn't stop a chat from *reading*. Like Claude Code run by hand, a chat can read files outside the project folder that your Windows account can read, and it can use the web.

**The plan writer and the task order.** Writing a task's plan and putting your tasks in order run Claude Code in the background, in the project's folder, with no chat window, so it can't ask you whether you trust that folder. Task Desk starts it with `--restricted --strict-mcp-config`: it ignores any settings, hooks and MCP servers the folder brings with it, can only read files inside the folder, and has no tools that run commands. A project folder someone else wrote can't run its own code this way. (Codex runs it in its read-only sandbox; Gemini gets no such switch, so in Company-safe mode only Claude Code is used.)

### Company-safe mode

For a work computer: tick **Company-safe mode (for a work computer)** in the ⋯ menu. On that computer only (your other computers aren't affected), Task Desk then:
- never updates by itself (**Check for updates now** still asks before installing anything),
- starts every chat without your Chrome browser,
- uses only Claude Code, never Codex or Gemini,
- keeps its data on this computer instead of OneDrive (it offers to move it back if it's there).

An IT team can switch it on for good with the environment variable `TASKDESK_SAFE_MODE=1`; it then can't be turned off in the app. The rest applies everywhere: the Open buttons, the chats' edit limits, and what the AI apps can see (below).

**What the AI apps can see.** Claude Code, Codex and Gemini start with only the environment variables they need to run (Windows' own folders and paths, language, your proxy and certificate settings, and where each app keeps its sign-in), not every variable on the computer. API keys and tokens set for other tools stay out. If an app really needs one more, add its name to `"passEnv": ["NAME"]` in `data\machine.json`.

**Only lines that mention me.** For a checklist shared with other people, a project can show only the lines that contain your name. Set your name with **Your name…** in the ⋯ menu.

**Advanced: a lanes workspace.** If you run several agents in one folder with a shared to-do file, Task Desk can read that too. See [docs/WORKSPACE.md](docs/WORKSPACE.md). It's off unless you connect one.

The full guide covers everything else: the look and moving frames, OneDrive sync between computers, switching AI mid-task, the size lock and autosave. It's in [docs/GUIDE.md](docs/GUIDE.md).

## Configuration

Most settings are changed in the app. They're stored as JSON in the data folder.

`data\settings.json` holds shared settings (they sync if you move your data to OneDrive):

| Key | Default | What it does |
|---|---|---|
| `userName` | empty | What the AI calls you. Also used by "only lines that mention me". Set it with **Your name…** in the ⋯ menu. |
| `userAbout` | empty | Optional line about you that the plan writer reads, e.g. "a designer who doesn't write code" |
| `factory` | `false` | The optional lanes workspace (see [docs/WORKSPACE.md](docs/WORKSPACE.md)) |
| `livePath` | empty | The workspace folder (**Connect a lanes workspace…** sets it) |
| `factoryName` | the folder's name | What the workspace is called in the box |
| `mode` | `test` | For the workspace only: `test` reads the sample copy in `test-fixtures\`, `live` reads `livePath` |
| `testPath` | `<app>\test-fixtures` | The sample workspace |
| `pollSeconds` | `60` | How often task files are re-read (they're also watched for changes) |
| `hotkey` | `Control+Alt+T` | Show/hide shortcut, in Electron accelerator format |
| `ai` | `claude` | Default AI: `claude`, `codex` or `gemini`. A project can override it, and so can a single task. |
| `plannerModel` | empty | Optional `--model` for Claude Code when it writes plans (and works out the task order) |
| `models` | empty | Claude's model and effort for task chats: `desk`, and one entry per project. Set them from the AI button in the box. |
| `perTaskModel` | `false` | Whether a task can have its own model and effort (right-click it in the box) |
| `orderTasks` | `true` | Whether the AI puts each project's tasks in order and guesses how far the project is |
| `chrome` | `off` | Whether Claude chats get your Chrome browser: `off`, `look` or `work`. A task's Chrome button can change it for that task. |
| `projects`, `view`, `look` | | Your projects, the box's current view and the look settings. Edit these in the app. |

`data\taskdesk.log` is the app's log: errors you never saw on screen, useful in a bug report. `data\update.log` is the self-updater's.

`data\machine.json` holds settings for this computer only: window position and size, the size lock, auto-start, the taskbar button, auto-update (`autoUpdate`, off for new installs), Company-safe mode (`safeMode`), extra variables the AI apps may see (`passEnv`), where the data folder is (`dataDir`, set by **Keep my data in OneDrive…**), and `folders`: where a project's folder (or the workspace's) is on this computer when it differs from your other computers'. With your data in OneDrive, folders can be at different paths on each computer; see [docs/GUIDE.md](docs/GUIDE.md).

Environment variables (mostly for tests and development):

| Variable | Required | What it does |
|---|---|---|
| `TASKDESK_LOCAL_DIR` | no | Use this folder instead of `data\` next to the app |
| `TASKDESK_LOCAL_DATA` | no | Ignore a OneDrive data folder, and turn off self-updates (the tests set this) |
| `TASKDESK_USERDATA` | no | Separate Electron profile, so a second copy can run beside the main one |
| `TASKDESK_NO_UPDATE` | no | Turn off the daily self-update |
| `TASKDESK_SAFE_MODE` | no | `1` turns on [Company-safe mode](#company-safe-mode) for good (for an IT team) |
| `TASKDESK_FAKE_AI` | no | `<node.exe>\|<script.js>`: run a pretend AI app instead of the real one. Only in a test run, and only a script from the app's own `test\` folder. `TASKDESK_FAKE_CLAUDE` is the older name. |
| `CODEX_HOME` | no | Read by the app to find Codex's saved sessions (defaults to `%USERPROFILE%\.codex`) |

`TASKDESK_PORT`, `TASKDESK_TOKEN_FILE` and `TASKDESK_TASK` are set by the app for its own chat-tool server (`src/mcp/taskdesk-mcp.js`); you don't set them. Each chat gets its own token, in a file in `data\mcp\` that's deleted when the chat stops.

## Updates

Updating by itself is **off** for a new install: choose **Check for updates now** in the ⋯ menu, which shows what changed and asks before installing. Tick **Update automatically (daily, 7 AM)** to have it update on its own instead (copies installed before this setting existed keep updating). Company-safe mode keeps it off. **Later** in that window means not now: nothing installs on its own, and the next check asks again. Every update has to be signed with the maintainer's key (listed in `tools/allowed_signers`), checked against the list your copy already has; an unsigned one is never installed and the desk tells you. A copy without that list installs no updates at all.

**Check your copy once.** The signature check protects updates *after* the version you have. Copies from 1.1.1 or earlier updated to 1.2.0 without it, and a fresh `git clone` trusts whatever GitHub sent. To check that your copy is the maintainer's, run this in the Task Desk folder:

```powershell
git -c gpg.format=ssh -c gpg.ssh.allowedSignersFile=tools/allowed_signers verify-commit HEAD
```

It should say `Good "git" signature` with the key `SHA256:tvI6fgvVF6/o8ppEBu3s1dwg8LwLY/DJHkxBqGHc31w`. Check the key against one you got another way, not only against this README: GitHub publishes the maintainer's signing keys at <https://api.github.com/users/P-1-K-E-M-1-N/ssh_signing_keys>, and the line in `tools/allowed_signers` should end with the same key. Releases also have signed tags (`git verify-tag v1.2.0` with the same `-c` options). When an update changes the packages, it reinstalls them the same careful way as the setup (`npm ci --ignore-scripts`, then Electron's checked download), and if that fails it goes back to the version you had and tells you so next time the desk starts.

With **Update automatically** on, a copy made with `git clone` checks its GitHub remote every day at 7 AM. It follows the `release` branch: changes merged into `main` reach installed copies only when the maintainer promotes them (see [CONTRIBUTING.md](CONTRIBUTING.md)), so a half-finished change never lands on your desk. If the computer was off at 7, it checks a couple of minutes after the next start. It only fast-forwards, and it waits for a quiet moment before installing. Updates that only change screens refresh the open windows in place, so chats keep running. Bigger ones restart the app and reopen the task windows that were open. A copy with local code changes or local commits is skipped, so work in progress isn't overwritten.

A copied folder (not a clone) runs fine but can't update itself. The log is `data\update.log`.

## Project structure

```
src/main/        Electron main process
  main.js        the wiring: starts everything below
  desk.js        the task list the box shows, read from every project
  windows.js     the box, task and project windows, and how they look
  menu.js        the ⋯ menu and the tray
  shortcuts.js   desktop, Startup and Start-menu shortcuts
  ipc.js         every channel the pages call, and the chat's plan tools
  update-flow.js the daily update check, quiet-moment install, restart and reopen
  data-folder.js moving the data folder to OneDrive, and the in-use lock
  tasks.js       reads checklists and the lanes workspace files
  projects.js    projects and their settings
  planner.js     writes each task's plan with the task's AI (read-only)
  order.js       which tasks wait on others, the A-to-Z order, and the rough goal line
  chat.js        runs the AI app for each task window in a pseudo-terminal
  ai.js          Claude Code / Codex / Gemini: finding them, their commands, hand-overs
  bridge.js      local link (127.0.0.1 + a token per chat) for the chat's plan tools
  safety.js      what Open buttons may open, paths inside a folder, what the AI apps see
  log.js         data\taskdesk.log: errors you never saw, kept under a megabyte
  updater.js     daily self-update; update-helper.js finishes ones that change packages
src/mcp/         the MCP server that gives each chat its plan tools
src/renderer/    the box, task and project windows; liveframe.js draws the animated frames
test/            Playwright tests; test/unit/ holds the fast node:test unit tests
test-fixtures/   a sample lanes workspace, used by the tests
tools/nightly.ps1  the nightly check: every test on dev, then main moves forward
docs/GUIDE.md    the full user guide
docs/WORKSPACE.md  the optional lanes workspace
```

## Tests

The tests run in their own temporary data folder and Electron profile (`test/env.js`), so they're safe to run while the app is open.

```powershell
npm run lint      # ESLint
npm test          # unit tests + the tests that need no AI app (this is what CI runs)
npm run test:unit # just the unit tests (a few seconds, no Electron)
npm run test:all  # every test, including the four that start a real Claude Code
node test/look.js # or any single test file
```

A few things to know:
- **Which tests use a real AI:** `e2e.js`, `projects.js`, `chat-tools.js` and `look.js` start the real Claude Code, so they need it signed in and use a little of your plan. `standalone.js` (a brand-new desk), `ai.js`, `seamless.js` and `updater.js` don't need any AI (`ai.js` and `seamless.js` use a pretend one, `test/fake-claude.js`).
- **Before the first `test:all`,** `npm run test:plans` builds and caches plans for the sample tasks (in `data\plans\test\`), and the tests reuse them.
- **Screenshots** are saved to `test/shots/`.
- **CI** runs lint and `npm test` on a Windows runner for every pull request and every push to `dev` (`.github/workflows/ci.yml`).
- **The nightly check** (`tools\nightly.ps1`) runs every test, including the AI-backed ones, on `dev` and moves `main` forward when they pass. [CONTRIBUTING.md](CONTRIBUTING.md) explains it.

## Contributing

Pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the checks every change has to pass and how releases work. [SECURITY.md](SECURITY.md) says what the app does and doesn't touch and how to report a problem privately. Changes a user would notice are listed in [CHANGELOG.md](CHANGELOG.md).

## Ground rules for changes

These hold for anyone (or any agent) changing the code:
- **What the app writes:** in a project folder, only its chosen results file. In a lanes workspace, it only appends to `ops/FROM_NICK.md`. (A task's chat may change project files when the project allows it, box 5 of the project form.)
- **Local only:** no accounts, cloud hosting or API keys. The AI apps use their own sign-in.
- **API keys:** go only into the `.env` file a task names, after the user confirms. Never into app data, logs or git.
- **Nothing on the user's behalf:** the app never sends, posts, buys or signs up for anything. It opens drafts and pages, and the user does the rest.

## License

[MIT](LICENSE).
