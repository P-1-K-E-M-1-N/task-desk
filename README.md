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
npm install --omit=dev
npm start
```

`--omit=dev` installs only what the desk needs to run: 24 packages instead of 103. Leave it off if you want to change the code or run the tests: plain `npm install` adds the code checker, the formatter and the test tools. Updates keep whichever you chose.

**On a work computer with security software** (SentinelOne, CrowdStrike, Defender for Endpoint…), `npm install` can be flagged: one PowerShell window downloads and unpacks thousands of files, including programs (`electron.exe`, `ffmpeg.dll`). That's normal for an npm install, but it's your IT team's call, not something to work around. Ask them to allow it, and tell them what it does:
- it runs from the folder you cloned it to, as you, with no admin rights and no installer;
- `node_modules\electron\dist\electron.exe` is the app; it starts the AI apps you installed (`claude`, `codex`, `gemini`) and `git`;
- every morning at 7 it runs `git pull` from this GitHub repo and, if the packages changed, `npm install` again (turn that off with **Update automatically** in the ⋯ menu);
- it adds a desktop, Startup and Start-menu shortcut, and talks to nothing on the internet itself (the AI apps use their own sign-in).

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
| `projects`, `view`, `look` | | Your projects, the box's current view and the look settings. Edit these in the app. |

`data\taskdesk.log` is the app's log: errors you never saw on screen, useful in a bug report. `data\update.log` is the self-updater's.

`data\machine.json` holds settings for this computer only: window position and size, the size lock, auto-start, the taskbar button, auto-update, where the data folder is (`dataDir`, set by **Keep my data in OneDrive…**), and `folders`: where a project's folder (or the workspace's) is on this computer when it differs from your other computers'. With your data in OneDrive, folders can be at different paths on each computer; see [docs/GUIDE.md](docs/GUIDE.md).

Environment variables (mostly for tests and development):

| Variable | Required | What it does |
|---|---|---|
| `TASKDESK_LOCAL_DIR` | no | Use this folder instead of `data\` next to the app |
| `TASKDESK_LOCAL_DATA` | no | Ignore a OneDrive data folder, and turn off self-updates (the tests set this) |
| `TASKDESK_USERDATA` | no | Separate Electron profile, so a second copy can run beside the main one |
| `TASKDESK_NO_UPDATE` | no | Turn off the daily self-update |
| `TASKDESK_FAKE_AI` | no | `<node.exe>\|<script.js>`: run a pretend AI app instead of the real one (tests). `TASKDESK_FAKE_CLAUDE` is the older name. |
| `CODEX_HOME` | no | Read by the app to find Codex's saved sessions (defaults to `%USERPROFILE%\.codex`) |

`TASKDESK_PORT`, `TASKDESK_TOKEN` and `TASKDESK_TASK` are set by the app for its own chat-tool server (`src/mcp/taskdesk-mcp.js`); you don't set them.

## Updates

A copy made with `git clone` checks its GitHub remote every day at 7 AM. It follows the `release` branch: changes merged into `main` reach installed copies only when the maintainer promotes them (see [CONTRIBUTING.md](CONTRIBUTING.md)), so a half-finished change never lands on your desk. If the computer was off at 7, it checks a couple of minutes after the next start. It only fast-forwards, and it waits for a quiet moment before installing. Updates that only change screens refresh the open windows in place, so chats keep running. Bigger ones restart the app and reopen the task windows that were open. A copy with local code changes or local commits is skipped, so work in progress isn't overwritten.

A copied folder (not a clone) runs fine but can't update itself. Turn updates off with **Update automatically (daily, 7 AM)** in the ⋯ menu. The log is `data\update.log`.

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
  bridge.js      local link (127.0.0.1 + secret token) for the chat's plan tools
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
