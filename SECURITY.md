# Security

## Reporting a problem

Please don't report security problems in a public issue. Use GitHub's private
reporting instead: open the repository's **Security** tab and choose **Report a
vulnerability**. If that's not available to you, open an issue that says only
"security, please contact me" and the maintainer will reach out.

You'll get a reply within 7 days. Fixes ship through the normal release branch,
so installed copies pick them up on their next daily update.

## What Task Desk does and doesn't touch

Knowing the boundaries makes it clear what counts as a bug.

- **Files it writes.** Inside a project folder, only the results file the user
  chose (`TASK_RESULTS.md` by default). In a lanes workspace, only
  `ops/FROM_NICK.md`, append-only. Its own data lives in `data\` next to the app,
  or in `OneDrive\Task Desk` if the user moved it. Anything else being written is
  a bug.
- **Network.** The app itself makes one kind of network call: `git fetch` and
  `git pull` against its own GitHub remote for the daily update. It has no
  accounts, telemetry or API keys. The AI apps it starts (Claude Code, Codex,
  Gemini CLI) talk to their own services with their own sign-in.
- **The chat's tools.** Each task's chat gets three tools (read the plan, tick a
  step, add a note) through a local server on `127.0.0.1`. The port is random,
  every request needs a token made fresh at each start, and the token names one
  task, so a chat can only change the task it was opened for. The server never
  listens on the network.
- **Secrets.** The only secret the app handles is an API key a task asks the user
  to paste. It goes straight into the `.env` file the task names, after a
  confirmation dialog, and is never stored, logged or synced.
- **On the user's behalf.** The app opens pages and drafts. It never sends,
  posts, buys or signs up for anything itself.

## The self-updater

Installed copies are `git clone`s that follow the `release` branch. Once a day
the app fast-forwards to whatever that branch holds and, if `package.json`
changed, runs `npm install`. That means **anyone who can push to `release` can
run code on every installed computer.** Only the maintainer can push to it. A
copy with local changes or local commits is never updated, and a failed
`npm install` is rolled back.

If you'd rather not have that, turn off **Update automatically** in the menu
or set `TASKDESK_NO_UPDATE=1`.

## The AI chats

A task's chat is a real Claude Code (or Codex, or Gemini CLI) session running in
the project's folder. By default it's told not to change files there, and Codex
is started in a read-only sandbox, but Claude Code's behaviour is governed by its
own permission prompts, not by Task Desk. If a project's form has **The chat may
change files** turned on, the chat can edit that folder. Treat each project's
chat with the trust you'd give that AI app run by hand in that folder.
