# Security

## Reporting a problem

Please don't report security problems in a public issue. Use GitHub's private
reporting instead: open the repository's **Security** tab and choose **Report a
vulnerability**. If that's not available to you, open an issue that says only
"security, please contact me" and the maintainer will reach out.

You'll get a reply within 7 days. Fixes ship through the normal release branch.

## What Task Desk does and doesn't touch

Knowing the boundaries makes it clear what counts as a bug.

- **Files it writes.** Inside a project folder, only the results file the user
  chose (`TASK_RESULTS.md` by default), and only when it's a `.md` or `.txt`
  file really inside that folder. That is checked every time it's written, not
  only when the project is saved, because settings can come from OneDrive. In a
  lanes workspace, only `ops/FROM_NICK.md`, append-only. Its own data lives in
  `data\` next to the app, or in `OneDrive\Task Desk` if the user moved it.
  Settings are written atomically, and a settings file that can't be read is
  kept aside instead of being overwritten. Anything else being written is a bug.
- **Network.** The app itself makes one kind of network call: `git fetch` and
  `git pull` against its own GitHub remote, when the user checks for updates (or
  daily, if they turned that on). It has no accounts, telemetry or API keys. The
  AI apps it starts (Claude Code, Codex, Gemini CLI) talk to their own services
  with their own sign-in.
- **The chat's tools.** Each task's chat gets three tools (read the plan, tick a
  step, add a note) through a local server on `127.0.0.1` with a random port.
  Each chat gets its own token, made when the chat starts and dropped when it
  stops, and the app decides which task a request is for from that token alone,
  so a chat can only change the task it was opened for. The token reaches the
  tools in a file in `data\mcp\` (never on a command line), compared in constant
  time; requests also need the exact `Host`, a JSON body and no browser
  `Origin`. The chat's config files are deleted when the chat stops. The folder holding them is
  readable by the signed-in Windows user only (and Windows itself), and each chat
  can make at most 120 tool calls a minute.
- **The windows.** The three pages run in Chromium's sandbox with context
  isolation and a strict content security policy (`script-src 'self'`, no inline
  scripts, nothing from the network). Data from tasks, plans and settings is
  escaped before it's put on the page, and colours are checked. The windows
  can't open pop-ups, navigate away, embed web views or get browser
  permissions. They reach the app only through the small `desk` API in
  `src/preload.js`, and the app answers only messages from exactly its own three
  pages.
- **Open buttons.** They open documents (an allowlist of types in
  `src/main/safety.js`) and folders, never programs, scripts, shortcuts, web
  pages or macro-enabled Office files, and never network paths. A document inside
  the task's own folder (links followed) opens straight away; a link, an email
  draft with a recipient, or a file or folder outside that folder shows the full
  address and asks first.
- **Secrets.** The only secret the app handles is an API key a task asks the user
  to paste. It goes only into a `.env` or `.env.local` file inside the task's own
  folder, never through a link, after a dialog that shows the variable and the
  file. It is written atomically and never stored, logged or synced.
- **On the user's behalf.** The app opens pages and drafts. It never sends,
  posts, buys or signs up for anything itself.

## The self-updater

Installed copies are `git clone`s that follow the `release` branch. **Updating
by itself is off for new installs**: the user checks for updates from the menu,
sees what changed, and says yes. If they turn **Update automatically** on, the
app fast-forwards once a day to whatever `release` holds. Either way, **anyone
who can push to `release` can run code on every copy that installs that
update.** Only the maintainer can push to it, and the branch is protected.

**Updates must be signed.** `tools/allowed_signers` lists the maintainer's
signing keys (SSH keys kept on the maintainer's computer). Before installing,
the app checks that the newest commit of the update carries a good signature
from one of those keys, using the list in the copy that is installed now, not
the one in the update, so an update can't vouch for itself. It then installs
exactly that commit, nothing pushed after the check. An unsigned update, or one
signed by another key, is never installed, and the user is told. So pushing to
GitHub is not enough to get code onto installed copies: it also takes the key.

When an update changes the packages, the app reinstalls them with
`npm ci --ignore-scripts` from the public npm registry: exactly the versions and
checksums in `package-lock.json`, with no package install scripts. Electron's
own download then runs as a separate step and is checked against the checksums
in its package. `git`, `node` and `npm` are run by their full paths, never
through a shell. A failed install goes back to the previous version, and the
user is told on the next start. A copy with local changes or local commits is
never updated.

To be sure a copy never updates, use Company-safe mode (below), set
`TASKDESK_NO_UPDATE=1`, or point the clone's `origin` at a copy you control.

## The AI chats and plans

A task's chat is a real Claude Code (or Codex, or Gemini CLI) session running in
the project's folder, and the plan writer is the same app run without a chat.
They read task lists and project files that other people may have written, so:

- The plan writer is told that text from files is data, and that text is put
  between markers it's told never to take instructions from. The plan that
  comes back is checked strictly (web links only, plain strings of a sane length,
  at most eight steps, only the fields each button uses) before any button is
  made from it.
- Restrictions are enforced by the apps' own switches, not only by the prompt.
  Unless the project allows it, Claude Code starts with its editing tools turned
  off (`--disallowedTools`), Codex runs in a read-only sandbox, and Gemini
  starts in its asking mode with its file-writing tools turned off. Claude Code's
  other actions are governed by its own permission prompts.
- Claude gets the user's Chrome browser (`--chrome`) only when the user turns it
  on, for one task or the desk.
- The AI apps start with only the environment variables they need to run, not
  the user's API keys, tokens or cloud logins for other tools.
- When the user switches a task to another AI, the end of the conversation is
  handed over marked as a record, not as instructions.

Treat each project's chat with the trust you'd give that AI app run by hand in
that folder, and only add project folders you trust.

## Company-safe mode

A per-computer switch in the menu (or `TASKDESK_SAFE_MODE=1`, which the user
can't turn off) for a work computer: no automatic updates, no Chrome for chats,
Claude Code only (no Codex or Gemini), and the data kept off OneDrive. See the
README.

## What a company should still decide

Some risks are about where the data goes, not about the code: task text, file
contents and chats go to the AI provider the user signs in to (Anthropic by
default), and transcripts are kept by that app in the user's profile. Before
using Task Desk at work, check that the AI provider and account are approved,
install it outside synced folders, and consider pinning installs to a copy of the
repository you control.
