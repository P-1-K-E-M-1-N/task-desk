# Changelog

Changes a user would notice, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added
- `npm test` runs the tests that need no AI app; `npm run test:all` runs every test.
- ESLint (`npm run lint`), an `.editorconfig`, and CI on GitHub Actions that lints and tests every pull request on Windows.
- An MIT license, a contributing guide, a security policy, a code of conduct, issue and pull request templates, Dependabot.

### Changed
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
