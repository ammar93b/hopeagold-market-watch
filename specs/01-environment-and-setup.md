# Spec: Environment and setup

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

The machine, tools, folder, secrets file and commands Market Watch needs, and how a fresh Mac gets to a running service.

## Overview

Market Watch runs on the owner's own Mac, all the time, as a background service. It needs no server, no database and no npm packages. The AI steps use an AI command-line tool on the owner's own account. Phone alerts go through the free ntfy app.

**Requirements**

| What | Detail |
|---|---|
| Mac | macOS 13 or newer, logged in as the owner's normal user. Checks only happen while the Mac is on or asleep (it catches up on wake, 02). |
| Raspberry Pi | Raspberry Pi 5 (4 GB or more) with **64-bit** Raspberry Pi OS, Node.js 22, an AI command-line tool. Runs around the clock as a systemd user service with lingering on (`deploy/raspberry-pi.md`). Set the time zone to Europe/Helsinki. Only one machine may run Market Watch at a time. |
| Node.js | 18 or newer (built and tested on v22.13). Plain CommonJS. Only built-ins: `http`, `fs`, `path`, `os`, `child_process`, global `fetch`, `AbortSignal`. **No dependencies and no `npm install` step.** |
| AI command-line tool | Built and tested with Claude Code on a claude.ai subscription; any other AI command-line tool can be linked. Installed and logged in with the owner's own account. Set in `.env` as `AI_COMMAND`, `AI_ARGS`, `AI_MODEL`, `AI_OUTPUT` (README → "AI tool" has examples). |
| ntfy | The ntfy app on the owner's phone, subscribed to a private topic on ntfy.sh. |
| Network | HTTPS to `api.huuto.net`, `www.tori.fi`, `api.gold-api.com`, `api.frankfurter.dev` and `ntfy.sh`. |

**Folder.** `~/Documents/hopeagold-market-watch/`. All code paths are relative to the project folder, so it works anywhere. Inside Documents, macOS asks once for "node" to access the Documents folder (see Edge cases).

```
server.js            the service: dashboard, API, live events, scheduler (02, 16)
run.js               one check from the Terminal (02)
my-links.js          the Tori and Huuto search links (README → Your links)
rules/               coin-specs.js (06), title-rules.js (05), deal-rules.js (07), README
try-links.js         try your links: one check, nothing saved, no alerts (03)
config.js            defaults (appendix B): reads my-links.js and rules/deal-rules.js
src/env.js           .env loader and paths
src/store.js         JSON files and the run lock (10)
src/settings.js      dashboard settings applied on top of config.js (09)
src/decisions.js     the owner's choices (09)
src/sources.js       spot, Huuto, Tori (04); shared web requests, pauses and HTML text helpers
src/logfile.js       keeps data/logs/service.log under 2 MB (used by the service and run.js)
src/rules.js         matching titles against rules/title-rules.js (05)
src/ai.js            AI program calls (05)
src/value.js         valuation and categories (07)
src/alerts.js        phone alert texts (08)
src/notify.js        ntfy POST (08)
src/watch.js         one check (03)
src/report.js        report.html and latest.txt (17)
public/              dashboard: index.html, app.js, style.css (11–15)
scripts/service.js   background service: launchd (macOS) or systemd (Linux); install / remove / restart / status / print (02)
scripts/open.js      opens the dashboard (macOS `open`, Linux `xdg-open`)
deploy/              Raspberry Pi setup guide
test/                tests on saved copies of the live pages: `npm test` (18)
specs/               these specs
README.md            the short guide shown on GitHub
data/                created at run time (10). Never committed.
```

**`.env` (secrets file).** Created by copying `.env.example` (appendix B). The loader in `src/env.js` runs once, when the first module requires it:
- Reads `<project>/.env` if it exists. A missing file is not an error.
- Each line matching `^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$`, unless it starts with `#`, sets that variable, but **only if it is not already set** in the real environment.
- One pair of surrounding quotes (`"` or `'`) is removed from the value.

| Key | Use |
|---|---|
| `NTFY_TOPIC` | The phone alert topic. The dashboard setting (09) overrides it when not empty. |
| `AI_COMMAND`, `AI_ARGS`, `AI_MODEL`, `AI_OUTPUT`, `AI_ERROR_FIELD`, `AI_STRIP_ENV` | The AI program and how to call it (05). |
| `PORT` | Optional, from the real environment. Default 3002. The LaunchAgent writes the `PORT` of the shell it was installed from (02). |

Any API key that would make the AI tool bill an API account instead of the owner's subscription goes in `AI_STRIP_ENV`: the runner removes those variables from the tool's environment (05).

**Commands** (`package.json`, appendix B). Run inside the project folder.

| Command | Runs | What it does |
|---|---|---|
| `npm start` | `node server.js` | The service in the foreground (normally the LaunchAgent runs it) |
| `npm run open` | `node scripts/open.js` | Opens the dashboard (macOS and Linux) |
| `npm run check` | `node run.js` | One check now, with phone alerts |
| `npm run dry` | `node run.js --no-push` | One check, no alerts |
| `npm run test-push` | `node run.js --test-push` | One test alert |
| `npm run summary` | `cat data/latest.txt` | The text summary of the latest check |
| `npm run log` | `tail -n 80 data/logs/service.log` | The last 80 log lines |
| `npm run service:install` | `node scripts/service.js install` | Install or reinstall the LaunchAgent and start it |
| `npm run service:remove` | `... remove` | Stop it and remove it from login |
| `npm run service:restart` | `... restart` | Restart (after changing code, `.env`, `config.js`, `my-links.js` or `rules/`) |
| `npm run service:status` | `... status` | Running? pid, last exit code |
| `npm run service:print` | `... print` | Shows the service file that would be installed, changes nothing |
| `npm test` | `node --test …` | Tests on saved copies of the live pages |

**Ports.** Market Watch uses 3002. It never shares a port, folder, ntfy topic or data with another app.

**Set up from scratch** (README):
1. Get the code: `git clone https://github.com/ammar93b/hopeagold-market-watch.git ~/Documents/hopeagold-market-watch` (public, no account needed), or copy the folder from a backup.
2. Check `node --version` (18+). Install an AI command-line tool and log in to it once.
3. Phone: install ntfy, make a topic with `echo hopeagold-market-$(openssl rand -hex 5)`, subscribe to it, allow notifications (and Time Sensitive).
4. `cp .env.example .env`, then set `NTFY_TOPIC` and the `AI_…` lines.
5. `npm run test-push`: "🪙 Market Watch test" arrives.
6. Optional: `npm run dry` (about 5 minutes the first time, ~400 listings).
7. `npm run service:install`, `npm run service:status`, `npm run open`.
8. Allow "node" to access the Documents folder when macOS asks.
9. Dashboard → Settings → Send test alert. The header shows "Next check …".

**Source control.** Public GitHub repo `ammar93b/hopeagold-market-watch`, MIT licence, commits by "HopeaGold: Coins, History and Precious Metals". The Raspberry Pi installs from `main` only. `.gitignore`: `node_modules/`, `.env*` except `.env.example`, `data/`, `.DS_Store`. Every change is committed and pushed. A local hook pushes anything left uncommitted, and skips any file that looks like a secret.

## Acceptance criteria

- [ ] `package.json` has no `dependencies` or `devDependencies`, and the service starts on a clean clone with only Node installed.
- [ ] With `.env` holding `NTFY_TOPIC=x` and the shell also exporting `NTFY_TOPIC=y`, the topic used is `y`.
- [ ] `NTFY_TOPIC="abc123"` in `.env` gives the topic `abc123` (quotes removed). Lines starting with `#` are ignored.
- [ ] With no `.env` and no topic in Settings, `npm run test-push` prints "Not sent: no ntfy topic (dashboard Settings or NTFY_TOPIC in .env)" and exits 0.
- [ ] The AI program never sees the variables listed in `AI_STRIP_ENV`, even when the shell sets them.
- [ ] `git status` never shows `.env`, `.env.local` or anything in `data/` as a file to commit.
- [ ] Every command in the Commands table works as described.

## Out of scope

- Windows and Linux. The service manager is macOS `launchd` only.
- Running on a server or in the cloud. It uses the AI tool's login on this computer.
- Any npm package, build step, database or Docker.
- Paid APIs (AI API keys, paid spot feeds).

## Edge cases

- **The AI program is not found:** every check fails with "Could not start the AI program at <path>: <reason>" until `AI_COMMAND` is set and the service restarted.
- **The AI tool asks to log in again:** checks fail with its error. Fix: run it in the Terminal, log in, `npm run service:restart`.
- **macOS Documents permission not given:** the service waits on file access and nothing happens. Fix: System Settings → Privacy & Security → Files and Folders → node → Documents Folder on, then `npm run service:restart`.
- **Node upgraded or moved:** the LaunchAgent stores the absolute Node path from install time (02). Reinstall with `npm run service:install`.
- **The folder is moved:** reinstall the LaunchAgent. It stores absolute paths.
- **A `.env` value contains `=`:** everything after the first `=` is the value.

## Security impact

- Secrets are the ntfy topic (whoever knows it can read the alerts) and the AI tool's login (kept by the tool, never read by this code). The topic lives in `.env` or `data/settings.json`. Both are git-ignored.
- No API keys are used anywhere.
- The dashboard listens on 127.0.0.1 only (02, 16).
- Nothing is installed outside the folder except the LaunchAgent plist in `~/Library/LaunchAgents/`.

## Threat modeling

| Threat | Mitigation |
|---|---|
| The ntfy topic leaks and a stranger reads the alerts | Random 10-hex-digit topic; `.env` and `data/` are git-ignored; the GitHub repo is private |
| A stray API key makes the AI tool bill an API account | List it in `AI_STRIP_ENV`: the runner removes it from the tool's environment |
| Secrets are pushed to GitHub by the auto-sync | `.gitignore` covers `.env*` and `data/`; the Stop hook refuses to commit files whose names look like secrets |
| A supply-chain attack through npm packages | There are none |
