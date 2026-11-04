# Nightly check: run every test on the dev branch and, if all of it passes, move
# main forward to it. Run it from a SEPARATE clone that sits on `dev`, never from
# the copy you use as your desk (that one sits on `release`).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\nightly.ps1
#
#   -DryRun     do everything except push
#   -SkipTests  skip the slow Electron tests (to try the script itself; main is then never moved)
#   -Pause      keep the window open at the end (the desktop shortcut uses this)
#
# What it does, in order:
#   1. fetch; make sure this clone is clean and on dev
#   2. bring main's merged pull requests into dev (a merge, pushed to dev)
#   3. stop early when dev has nothing main doesn't have (no tests, no tokens)
#   4. npm ci (no install scripts), lint, format check
#   5. npm run test:plans (fills in missing cached plans; uses your Claude plan)
#   6. npm run test:all   (every test, including the four that start Claude Code)
#   7. wait for GitHub's own check on the dev commit
#   8. git push origin dev:main  (fast-forward only; nothing is rewritten)
# Everything it did is written to data\nightly\REPORT.md in this clone, newest run
# first, so you can read the outcome in the morning. The full test output is in
# data\nightly\test-output.txt.

param([switch]$DryRun, [switch]$SkipTests, [switch]$Pause)

$ErrorActionPreference = 'Continue'
# Node prints UTF-8; without this the console shows "·" as "┬╖".
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo =Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repo
$nightDir = Join-Path $repo 'data\nightly'
New-Item -ItemType Directory -Force $nightDir | Out-Null
$report = Join-Path $nightDir 'REPORT.md'
$testOut = Join-Path $nightDir 'test-output.txt'
$started = Get-Date
$lines = @()

function Say($text) {
  Write-Host $text
  $script:lines += $text
}

function Finish($verdict, $detail) {
  $took = [int]((Get-Date) - $started).TotalMinutes
  $head = "## $($started.ToString('yyyy-MM-dd HH:mm')) - $verdict ($took min)"
  $body = @($head, '', $detail, '') + ($script:lines | ForEach-Object { "    $_" }) + @('')
  $old = ''
  if (Test-Path $report) { $old = Get-Content $report -Raw }
  if (-not $old) { $old = "# Nightly runs`n`nNewest first. Written by tools\nightly.ps1.`n`n" }
  $parts = $old -split "(?m)^(?=## )", 2
  $new = $parts[0] + ($body -join "`n") + "`n" + ($(if ($parts.Count -gt 1) { $parts[1] } else { '' }))
  Set-Content -Path $report -Value $new -Encoding utf8
  Write-Host ''
  Write-Host "=== $verdict ===" -ForegroundColor $(if ($verdict -like 'PROMOTED*' -or $verdict -like 'NOTHING*') { 'Green' } else { 'Yellow' })
  Write-Host $detail
  Write-Host "Report: $report"
  if ($Pause) { Write-Host ''; Write-Host 'Press Enter to close.'; [void](Read-Host) }
  exit $(if ($verdict -like 'FAILED*' -or $verdict -like 'STOPPED*') { 1 } else { 0 })
}

function Run($label, $command) {
  Say "> $label"
  $out = & cmd /c "$command 2>&1"
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    $tail = ($out | Select-Object -Last 40) -join "`n"
    Finish "FAILED: $label" "``$command`` exited $code. Last lines:`n`n``````text`n$tail`n``````"
  }
  return $out
}

# 1. Safety checks. This script resets branches, so it must not run in a desk's own copy.
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -eq 'release') {
  Finish 'STOPPED: this is an installed copy' "This clone is on ``release``, so it is probably the Task Desk you use. Run the nightly check from a separate clone on ``dev`` (for example ``git clone -b dev <repo> task-desk-dev``)."
}
if (git status --porcelain) {
  Finish 'STOPPED: uncommitted changes' 'This clone has uncommitted changes. Commit or stash them first; the nightly check only works on what is pushed.'
}
Run 'git fetch' 'git fetch origin --prune'
if ($branch -ne 'dev') { Run 'git checkout dev' 'git checkout -q dev' }
$unpushed = git rev-list origin/dev..dev
if ($unpushed) {
  Finish 'STOPPED: unpushed commits on dev' "dev has $(@($unpushed).Count) commit(s) that are not on GitHub yet. Push them first (``git push origin dev``)."
}
Run 'update dev' 'git merge -q --ff-only origin/dev'

# 2. Pull requests merged into main during the day have to come along, or main
#    would lose them when it moves to dev.
$mainOnly = git rev-list dev..origin/main
if ($mainOnly) {
  Say "main has $(@($mainOnly).Count) commit(s) dev lacks; merging main into dev"
  git merge -q --no-ff origin/main -m "Bring main's merged pull requests into dev" 2>&1 | ForEach-Object { Say "  $_" }
  if ($LASTEXITCODE -ne 0) {
    git merge --abort 2>$null
    Finish 'STOPPED: dev and main conflict' 'Merging main into dev hit a conflict. Someone has to resolve it by hand (`git merge origin/main` in this clone), then push dev.'
  }
  if ($DryRun) { Say '(dry run: not pushing the merge to dev)' } else { Run 'push dev' 'git push -q origin dev' }
}

# 3. Nothing new? Then no tests and no tokens spent.
$sha = (git rev-parse HEAD).Trim()
$ahead = @(git rev-list origin/main..HEAD)
if ($ahead.Count -eq 0) {
  Finish 'NOTHING NEW' 'dev has nothing that main does not already have.'
}
$commits = (git log --oneline origin/main..HEAD) -join "`n"
Say "dev is $($ahead.Count) commit(s) ahead of main:"
(git log --oneline origin/main..HEAD) | ForEach-Object { Say "  $_" }

# 4. Dependencies and the quick checks.
$env:TASKDESK_NO_UPDATE = '1'
$env:TASKDESK_LOCAL_DATA = '1'
# Claude Code runs on Opus for the plans and the tests that start the real Claude (unless a test picks its own model).
$env:ANTHROPIC_MODEL = 'opus'
Say 'Claude model for this run: opus'
# Exactly the locked versions, with no package install scripts; then Electron's own checked download.
Run 'npm ci' 'npm ci --ignore-scripts --no-audit --no-fund --loglevel=error' | Out-Null
Run 'electron' 'node node_modules/electron/install.js' | Out-Null
Run 'lint' 'npm run lint --silent' | Out-Null
Run 'format check' 'npm run format:check --silent' | Out-Null

# 5 + 6. The tests. test:plans only writes plans that are missing, so it is
#        quick when nothing changed; test:all is the long part (10-20 minutes).
if ($SkipTests) {
  Say '(skipping the Electron tests)'
} else {
  Run 'test:plans' 'npm run test:plans --silent' | ForEach-Object { Say "  $_" }
  Say '> test:all (this is the long part)'
  & cmd /c "npm run test:all --silent 2>&1" | Tee-Object -FilePath $testOut | Out-Null
  $code = $LASTEXITCODE
  $summary = (Get-Content $testOut | Select-String -Pattern 'test files passed' | Select-Object -Last 1)
  Say "  $summary"
  if ($code -ne 0) {
    $tail = (Get-Content $testOut | Select-Object -Last 40) -join "`n"
    Finish 'FAILED: tests' "``npm run test:all`` exited $code. $summary`n`nmain was left alone. Full output: data\nightly\test-output.txt. Its last lines:`n`n``````text`n$tail`n``````"
  }
}

# 7. GitHub runs lint + npm test on every push to dev. main's branch rule needs
#    that check to be green on the commit before it can land there.
$check = $null
for ($i = 0; $i -lt 40; $i++) {
  # Parsed here rather than with --jq: PowerShell 5.1 mangles the quotes a jq filter needs.
  $json = & cmd /c "gh api repos/{owner}/{repo}/commits/$sha/check-runs 2>nul"
  $run = $null
  try { $run = ($json | ConvertFrom-Json).check_runs | Where-Object { $_.name -eq 'Lint and test (Windows)' } | Select-Object -First 1 } catch {}
  if ($run -and $run.status -eq 'completed') { $check = $run.conclusion; break }
  if ($i -eq 0) { Say "waiting for GitHub's check on $($sha.Substring(0,7))..." }
  Start-Sleep -Seconds 30
}
if ($check -ne 'success') {
  Finish "STOPPED: GitHub check is '$check'" "The tests passed here, but GitHub's own check on $($sha.Substring(0,7)) is '$check' (empty means it never finished). main was left alone. See https://github.com/P-1-K-E-M-1-N/task-desk/actions"
}
Say "GitHub's check: success"

# 8. Move main forward. A plain push of the same commit: nothing is rewritten.
#    Never after -SkipTests: main only moves when every test ran and passed.
if ($SkipTests) {
  Finish "SKIPPED TESTS: not promoted" "The checks ran without the Electron tests (-SkipTests), so main was left alone."
}
if ($DryRun) {
  Finish 'DRY RUN: would promote' "Everything passed. Without -DryRun this would have moved main to $($sha.Substring(0,7)):`n`n$commits"
}
Run 'push main' "git push -q origin ${sha}:main"
Finish 'PROMOTED' "main now has these $($ahead.Count) commit(s):`n`n$commits`n`nTo put them on every desk: ``git checkout release; git merge --ff-only main; git push origin release`` (see CONTRIBUTING.md, 'How releases work')."
