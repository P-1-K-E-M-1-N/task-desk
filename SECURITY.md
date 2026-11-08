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
- **The chat's tools.** Each task's chat gets four tools (read the plan, tick a
  step, add a note, and snooze the task until a day the user asked for) through
  a local server on `127.0.0.1` with a random port.
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
- **Claude Code's saved sessions.** To find a project's main chat, the app reads
  (never changes) the session files Claude Code keeps in
  `%USERPROFILE%\.claude\projects`, on this computer only. Which session is a
  project's main chat is a setting of this computer (`mainChats` in
  `data\machine.json`), never taken from synced settings. The main chat runs as
  the user's own unrestricted Claude Code session (`claude --resume`, as if they
  ran it by hand), in a window that only it can type into: the other pages
  can't send it keys.
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
A copy without the list installs no updates at all; a missing list never means
"skip the check". **Later** in the update window installs nothing: the next
check asks again.

**Changing or retiring a key.** The list travels with the app, so it changes
the same way as any other code: a new key is added in an update signed with a
key that is already listed, and a key is retired (lost, leaked or replaced) by
an update, signed with a key that stays listed, that removes it. Each copy stops
trusting the retired key as soon as it installs that update. Today there is one
key, kept on the maintainer's computer; if it were stolen, the thief could sign
updates until copies install the one that removes it, and if it were lost, the
copies would need to be reinstalled by hand. A second, offline key is the
planned fix for both.

**Where trust starts.** The check protects every update after the version a
copy already has. It can't vouch for that first version: a fresh `git clone`
trusts whatever GitHub sends, and copies on 1.1.1 or earlier updated to 1.2.0
before they had the check. To check a copy once, run
`git -c gpg.format=ssh -c gpg.ssh.allowedSignersFile=tools/allowed_signers verify-commit HEAD`
in its folder, and compare the key in `tools/allowed_signers` with the one
GitHub publishes at <https://api.github.com/users/P-1-K-E-M-1-N/ssh_signing_keys>
(fingerprint `SHA256:tvI6fgvVF6/o8ppEBu3s1dwg8LwLY/DJHkxBqGHc31w`). Release
tags are signed with the same key.

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
- The plan writer and the task ordering run Claude Code without a window (`-p`),
  which skips its "do you trust this folder?" prompt. So they run it with
  `--restricted --strict-mcp-config`: the folder's own settings, hooks and MCP
  servers are ignored, the file tools stay inside the folder, and there are no
  tools that run commands. Tested against a folder with a planted hook and
  `.mcp.json` server: without these switches both ran, with them neither did.
  Codex writes plans in its read-only sandbox. Gemini has no equivalent switch,
  which is one reason Company-safe mode allows only Claude Code.
- Restrictions are enforced by the apps' own switches, not only by the prompt.
  Unless the project allows it, Claude Code starts with its editing tools and
  its command tools (Bash, PowerShell) turned off (`--disallowedTools`), Codex
  runs in a read-only sandbox, and Gemini starts in its asking mode with its
  file-writing and command tools turned off. This limits *changes*, not
  *reading*: a chat can read whatever the user's Windows account can read, as
  Claude Code run by hand can, and can use the web. A chat runs in a visible
  window, so Claude Code's own trust prompt and permission prompts apply.
- Settings that change what runs on a computer (`passEnv`, `dataDir`, and the
  rest of `data\machine.json`) are never taken from a synced `settings.json`:
  the one-time move of older settings only reads the computer's own data folder,
  and machine settings found in a shared file are ignored.
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
Claude Code only (no Codex or Gemini), no Startup shortcut, and the data kept
off OneDrive. See the README.

## What endpoint security sees

Nothing Task Desk runs is signed by a publisher: `electron.exe` comes from the
Electron package on npm without a signature, and so do the native parts of the
terminal (`conpty.node`). Free signing for open source through SignPath
Foundation wasn't available to this project, and a certificate of our own is
being looked into. Until then, endpoint security on a managed computer will
report the app. Here is what SentinelOne reported on one work computer, in its
own words, and what each item was:

| Reported | What it was |
| --- | --- |
| Process hollowing; code injection during the target process's initialization; PE injection | Chromium's sandbox. Electron starts each window's process suspended, patches that process's copy of `ntdll` so the sandbox holds, then lets it run. Every Chromium-based program (Chrome, Edge, Teams, VS Code) does the same. |
| A vectored exception handler was registered | Chromium's and Node's crash handler. |
| Startup file created; persistence through a startup directory; persistence registered by an LNK process | Task Desk 1.2.1 and earlier put a shortcut in the Startup folder on its first run. It no longer does: **Start with Windows** is a choice in the menu, and Company-safe mode keeps it off. |
| Redirection of data to a pipe from an interpreter with a hidden window | Task Desk 1.2.1 and earlier ran Windows' `where.exe` in a hidden console to find `claude` and `git`. It now looks along PATH itself. The chat's terminal (ConPTY, `OpenConsole.exe`) still works through pipes: that is how every terminal program runs a shell. |
| Indirect command execution; obfuscated PowerShell command from an LNK file | The way it was started: `npm start` typed in a PowerShell window that was opened from a taskbar shortcut, which goes through npm's `.cmd` shim and `cmd.exe`. The desktop shortcut starts `electron.exe` directly. |

Because the install had been started from a PowerShell window, SentinelOne
named that window the threat, killed it with everything under it, and
quarantined the files it had written (the clone and its packages).

What to ask the security team for, in their console's terms:

- Mark the detection a false positive, and exclude the folder the app is cloned
  to (by path, or by the hash of `node_modules\electron\dist\electron.exe` from
  `Get-FileHash`; the hash changes with each Electron version).
- Let the install run from that folder, or have IT run the four install lines
  from the README themselves.
- Set `TASKDESK_SAFE_MODE=1` for the computer, which also keeps the Startup
  folder clear.

## What a company should still decide

Some risks are about where the data goes, not about the code: task text, file
contents and chats go to the AI provider the user signs in to (Anthropic by
default), and transcripts are kept by that app in the user's profile. Before
using Task Desk at work, check that the AI provider and account are approved,
install it outside synced folders, and consider pinning installs to a copy of the
repository you control.
