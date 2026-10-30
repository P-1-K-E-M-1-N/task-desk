# Contributing to Task Desk

Thanks for helping. This page says how changes get in. The [README](README.md) says what the app is and how to run it.

## Before you start

- **Small fixes:** just open a pull request.
- **Anything bigger** (a new screen, a new setting, a change to how tasks are read or written): open an issue first and say what you have in mind. It saves both of us from building the wrong thing.
- **Security problems:** don't open an issue. See [SECURITY.md](SECURITY.md).

## Setting up

```powershell
git clone https://github.com/P-1-K-E-M-1-N/task-desk
cd task-desk
npm install
npm start
```

You need Windows 10 or 11, Node.js 24 (see `.nvmrc`) and Git. For the tests that use a real AI, Claude Code has to be installed and signed in.

Work on a branch, not on `main`:

```powershell
git checkout -b fix/what-you-are-fixing
```

## Ground rules

These hold for every change, by a person or by an AI agent. The app's whole value is that people can trust what it touches.

1. **What the app writes.** In a project folder, only the results file the user chose. In a lanes workspace, only `ops/FROM_NICK.md`, append-only. Everything else in a project is read-only. `src/main/handback.js` enforces this; don't go around it.
2. **Local only.** No accounts, cloud hosting, telemetry or API keys. The AI apps use their own sign-in.
3. **API keys** go only into the `.env` file a task names, after the user confirms. Never into app data, logs or git.
4. **Nothing on the user's behalf.** The app never sends, posts, buys or signs up for anything. It opens drafts and pages, and the user does the rest.
5. **Plain language.** Screens, docs and commit messages are written for someone who doesn't write code. Say "the box" and "the task window", not "the renderer".

## Checks every pull request has to pass

```powershell
npm run lint     # ESLint; `npm run lint:fix` repairs the simple cases
npm test         # the tests that need no AI app (CI runs these on Windows)
npm run test:all # every test, including the four that start a real Claude Code
```

`npm test` runs `test/updater.js`, `test/standalone.js`, `test/ai.js` and `test/seamless.js`. They start Electron with a temporary data folder and their own hotkey (`test/env.js`), so they're safe to run while your own Task Desk is open. The AI-backed tests (`e2e.js`, `projects.js`, `chat-tools.js`, `look.js`) use a little of your Claude plan; run `npm run test:plans` once first to cache their plans.

If you change how plans, chats or tasks work, run `npm run test:all` and say so in the pull request.

## Code style

- ESLint's recommended rules, configured in `eslint.config.js`. Two-space indent, single quotes, LF line endings (`.editorconfig`).
- Comments explain *why*, in full sentences. The top of each file says what the file is for.
- `let x = []; try { x = read() } catch { return }` is fine for "best effort" reads. Don't swallow an error the user would want to know about.
- Keep the main process and the pages apart: pages talk to the app only through the `desk` API in `src/preload.js`, and every new IPC channel is added there.
- No new dependencies without a reason in the pull request. Electron apps get heavy fast.

## Commits and pull requests

- One change per pull request. A fix and an unrelated tidy-up are two pull requests.
- Commit messages: a one-line summary in plain words, like the ones in `git log`. "Lava lamp frame, your own colors" beats "feat(look): add material".
- Fill in the pull request template. If a user would notice the change, add a line to `CHANGELOG.md` under **Unreleased**.
- CI (lint + `npm test` on Windows) has to be green before a merge.

## How releases work

`main` is where changes land. Installed copies follow the `release` branch, and the daily self-updater (`src/main/updater.js`) only fast-forwards to it. So a merge into `main` reaches nobody until it's promoted:

```powershell
git checkout release
git merge --ff-only main
git tag -a v1.2.0 -m "v1.2.0"
git push origin release --tags
```

Before promoting: `npm run test:all` is green, `CHANGELOG.md` has moved the **Unreleased** lines under the new version, and `package.json`'s version matches the tag. Then every installed copy picks it up at 7 AM.

## Questions

Open an issue with the "idea" template, or ask in the pull request. There are no silly questions here; the app exists for people who don't write code.
