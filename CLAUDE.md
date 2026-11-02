# For AI agents working on Task Desk

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the ground rules. This page is the short version of how work moves.

## Branches

- **`dev`** is where work lands during the day. Commit and push straight to it (or open a pull request against it).
- **`main`** only moves when the nightly check (`tools\nightly.ps1`) has run every test on `dev` and they passed. Don't push to `main` by hand.
- **`release`** is what installed copies update to. Only the maintainer promotes it.

## What to run before a commit

```powershell
npm run lint
npm run format:check   # or: npm run format
npm run test:unit
```

That's all. **Don't run the Playwright tests (`npm test`, `npm run test:all`, or a single `node test/*.js`) during the day unless the user asks**: they take minutes, their output is long, and the AI-backed ones spend the user's Claude plan. GitHub runs `npm test` on every push to `dev`, and the nightly check runs everything else. If you changed how plans, chats or tasks work, say so in the commit message so the nightly report is easy to read.

## Which folder

- Work in a clone that sits on `dev` (the user's is `task-desk-dev`, next to the installed one). Never edit the copy the user runs as their desk; it updates itself from GitHub.
- **Never `npm start` in a clone that isn't the user's desk.** The app rewrites the desktop, Startup and Start-menu shortcuts to point at whichever folder it starts from.
- Leave the clone on `dev` with everything committed and pushed when you finish; the nightly check refuses to run over uncommitted or unpushed work.

## Checking last night

The nightly report is `data\nightly\REPORT.md` in the `dev` clone, newest run first. If it says FAILED, the fix goes on `dev` like any other change.
