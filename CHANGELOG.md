# Changelog

Changes a user would notice, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

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
