# Task Desk

A small always-on-top Windows app that lists what your projects need you to do, and opens each task with a step-by-step plan and an AI chat that already knows the task.

It's for people who run projects with AI agents and end up with a pile of human-only jobs: send this email, sign up for that, decide between two options, paste a reply back. Task Desk reads those to-do items from your project folders and shows them in a floating box. Click one and a task window opens with two halves. On the left is a plan with buttons for each step (copy text, open a link, draft a Gmail message, paste a result). On the right is a real Claude Code chat running in that project's folder. You can also use OpenAI's Codex or Google's Gemini CLI there instead. The chat can tick steps and add notes as you go. When you press Done, your notes go back into the project, where its agents can pick them up.

**Status:** built for one person's workflow and in daily use, so some of it is personal. The app is called "Nick's Task Desk" in the window title and shortcuts. Its prompts address the user as Nick. The optional Idea Factory source expects files named `NEEDS_NICK.md` and `FROM_NICK.md`. Everything else works for anyone.

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
git clone <this repo's URL> task-desk
cd task-desk
npm install
npm start
```

The first start does three things:
- creates a `data\` folder next to the app,
- puts a shortcut on the desktop and one in the Startup folder (so it starts with Windows, in the tray),
- adds a Start menu entry.

To pin it to the taskbar, right-click its taskbar button and choose **Pin to taskbar**.

A fresh install shows sample tasks from `test-fixtures\`. Add your own projects with **Add a project…** in the box's project switcher (top left of the box).

## Usage

1. **Open the box:** press **Ctrl+Alt+T**, or click the taskbar or tray icon.
2. **Open a task:** click it. The plan is on the left and the chat on the right.
3. **Work the steps:** tell the chat what you did ("sent it") and it ticks the step and leaves a comment. You can also tick steps yourself.
4. **Finish:** type what happened into the notes box and press **Done** (or **Skip**, or **Snooze**).

`npm run hidden` starts it straight to the tray without showing the box.

**Where tasks come from.** Each project you add reads one of two things:
- **A checklist file in its folder.** Every unchecked `- [ ] ...` line is a task, and `## Headings` become groups. The app only reads this file.
- **Only the tasks you type into the box.**

**Where your Done notes go.** You choose per project: kept inside Task Desk, or appended to a results file in the project folder (`FROM_NICK.md` by default). The results file is the only file Task Desk writes in a project folder.

**The Idea Factory source** is optional. It's a fixed layout for a multi-lane agent workspace. Tasks come from `ops/NEEDS_NICK.md` plus unchecked lines that mention "Nick" in `lanes/*/LANE.md`. Done notes are appended to `ops/FROM_NICK.md`, the only factory file the app writes. Switch between the sample copy and your real folder in the ⋯ menu (**Idea Factory: test copies** / **live**). [HANDOFF.md](HANDOFF.md) has a note to paste into the factory's own agent session, so it reads those notes.

The full guide covers everything else: the look and moving frames, OneDrive sync between computers, switching AI mid-task, the size lock and autosave. It's in [docs/GUIDE.md](docs/GUIDE.md).

## Configuration

Most settings are changed in the app. They're stored as JSON in the data folder.

`data\settings.json` holds shared settings (they sync if you move your data to OneDrive):

| Key | Default | What it does |
|---|---|---|
| `mode` | `test` | `test` reads the sample factory in `test-fixtures\`; `live` reads `livePath` |
| `livePath` | a fixed path from the original setup | Your Idea Factory folder. Set it if you use one. |
| `testPath` | `<app>\test-fixtures` | The sample factory |
| `pollSeconds` | `60` | How often task files are re-read (they're also watched for changes) |
| `hotkey` | `Control+Alt+T` | Show/hide shortcut, in Electron accelerator format |
| `ai` | `claude` | Default AI: `claude`, `codex` or `gemini`. A project can override it, and so can a single task. |
| `plannerModel` | empty | Optional `--model` for Claude Code when it writes plans |
| `projects`, `view`, `look` | | Your projects, the box's current view and the look settings. Edit these in the app. |

`data\machine.json` holds settings for this computer only: window position and size, the size lock, auto-start, the taskbar button, auto-update, and where the data folder is (`dataDir`, set by **Keep my data in OneDrive…**).

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

A copy made with `git clone` checks its GitHub remote every day at 7 AM. If the computer was off at 7, it checks a couple of minutes after the next start. It only fast-forwards, and it waits for a quiet moment before installing. Updates that only change screens refresh the open windows in place, so chats keep running. Bigger ones restart the app and reopen the task windows that were open. A copy with local code changes or local commits is skipped, so work in progress isn't overwritten.

A copied folder (not a clone) runs fine but can't update itself. Turn updates off with **Update automatically (daily, 7 AM)** in the ⋯ menu. The log is `data\update.log`.

## Project structure

```
src/main/        Electron main process
  main.js        windows, menus, IPC, updates
  tasks.js       reads checklists and the Idea Factory files
  projects.js    projects and their settings
  planner.js     writes each task's plan with the task's AI (read-only)
  chat.js        runs the AI app for each task window in a pseudo-terminal
  ai.js          Claude Code / Codex / Gemini: finding them, their commands, hand-overs
  bridge.js      local link (127.0.0.1 + secret token) for the chat's plan tools
  updater.js     daily self-update; update-helper.js finishes ones that change packages
src/mcp/         the MCP server that gives each chat its plan tools
src/renderer/    the box, task and project windows; liveframe.js draws the animated frames
test/            Playwright and Node tests
test-fixtures/   a sample Idea Factory, used by test mode and the tests
docs/GUIDE.md    the full user guide
```

## Tests

The tests run in their own temporary data folder and Electron profile (`test/env.js`), so they're safe to run while the app is open.

```powershell
node test/e2e.js
node test/projects.js
node test/look.js
node test/chat-tools.js
node test/ai.js
node test/seamless.js
node test/updater.js
```

A few things to know:
- **Which tests use a real AI:** `e2e.js`, `projects.js`, `chat-tools.js` and `look.js` start the real Claude Code, so they need it signed in and use a little of your plan. `ai.js`, `seamless.js` and `updater.js` don't need any AI (the first two use a pretend one, `test/fake-claude.js`).
- **Before the first run,** `node test/gen-plans.js` builds and caches plans for the sample tasks (in `data\plans\test\`), and the tests reuse them.
- **Screenshots** are saved to `test/shots/`.

## Ground rules for changes

These hold for anyone (or any agent) changing the code:
- **What the app writes:** in an Idea Factory folder, only appends to `ops/FROM_NICK.md`. In a project folder, only its chosen results file. (A task's chat may change project files when the project allows it, box 5 of the project form.)
- **Local only:** no accounts, cloud hosting or API keys. The AI apps use their own sign-in.
- **API keys:** go only into the `.env` file a task names, after the user confirms. Never into app data, logs or git.
- **Nothing on the user's behalf:** the app never sends, posts, buys or signs up for anything. It opens drafts and pages, and the user does the rest.

## License

There's no license file, and `package.json` marks the package `UNLICENSED`, so all rights are reserved.
