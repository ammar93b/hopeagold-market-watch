# Spec: Service, scheduler and LaunchAgent

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

One always-on Node process that serves the dashboard and starts a check at every run hour, kept alive by a macOS LaunchAgent, plus a command-line runner for one-off checks.

## Overview

`server.js` is the whole service: the HTTP server (16) and the scheduler. macOS starts it at login and restarts it if it stops. It decides by itself when a check is due, so no cron job is used. Reference code: appendix C, "server.js" and "scripts/service.js".

**Startup**
- Listen on `127.0.0.1:<PORT>` (default 3002). Never on other interfaces.
- On listening, log `Market Watch dashboard: http://localhost:<PORT>  (runs at 9:00, 10:00, …)`.
- Run `tick()` once after 5 seconds, then every 30 seconds.
- If the port is taken, log `Port <PORT> is already in use — is Market Watch already running? (npm run service:status)` and exit with code 1. launchd tries again after 30 s.

Every log line starts with the local time in `fi-FI` format.

**Run hours and slots** (`src/watch.js`)
- Run hours come from the settings (09). Default 9, 10, … 23.
- `dueSlot(now)`: the latest run hour at or before the current hour, **today**, as `YYYY-MM-DD H:00` (hour not padded). Before the first run hour of the day, there is no slot.
- `nextRunAfter(now)`: the first run hour greater than the current hour, today, at :00. If none is left, the first run hour tomorrow. Only the hour is compared, so at 9:30 with hours [9, 10] the next run is 10:00.
- `inRunWindow(now)`: the current hour is between the smallest and largest run hour, inclusive. Used only by `run.js --scheduled`.

**`tick()`** (every 30 s)

1. Trim the log: if `data/logs/service.log` is over 2 MB, keep only its last 500 kB.
2. `slot = dueSlot()`. Stop if there is no slot, or a check is already running in this process.
3. Stop if `state.lastSlot` (10) equals the slot, or the newest run in `runs.json` started at or after the slot's start time.
4. Save `state.lastSlot = slot`, then start a check with reason `scheduled H:00` (e.g. `scheduled 14:00`).

So restarts never run a slot twice, a manual check after a slot's start counts as that slot done, and a slot missed while the Mac slept runs on wake (same day only, and only the latest missed slot).

**Starting a check** (`startRun(reason)`)
- If a check is running, return false (the API answers 409, 16).
- Log `Run started (<reason>)`, then call `runOnce({ push: true, reason, progress })` (03).
- `progress` broadcasts the SSE event `status` with `{ running }` at every stage change, and `{ running: null }` at the end.
- When it ends, log `Run finished: <summary>` or `Run finished: FAILED <error>`, and broadcast `update` with `{ at }`.
- A crash outside `runOnce` is logged as `Run crashed: <message>`.

**Linux / Raspberry Pi** (`scripts/service.js` on Linux): the same commands install a **systemd user service** `hopeagold-marketwatch.service`: `WantedBy=default.target`, `Restart=always`, `RestartSec=30`, the same working folder, PATH, HOME and PORT, logs appended to `data/logs/service.log`. Install prints `sudo loginctl enable-linger <user>` when lingering is off: it lets the service start at boot without a login. `print` shows the unit without installing anything. The Pi setup is in `deploy/raspberry-pi.md`.

**LaunchAgent** (`scripts/service.js` on macOS)
- Label `fi.hopeagold.marketwatch`. Plist `~/Library/LaunchAgents/fi.hopeagold.marketwatch.plist`. Domain `gui/<uid>`.
- Plist keys: `Label`; `ProgramArguments` [absolute Node path of the installing process, `<project>/server.js`]; `WorkingDirectory` the project; `RunAtLoad` true; `KeepAlive` true; `ThrottleInterval` 30; `EnvironmentVariables` `PATH` (Node's folder, `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/bin`, `/usr/sbin`, `/sbin`), `HOME`, `PORT`; `StandardOutPath` and `StandardErrorPath` both `data/logs/service.log`; `ProcessType` Background. Values are XML-escaped.

| Command | Does | Prints |
|---|---|---|
| `install` | creates `data/logs/` and the LaunchAgents folder, removes any old agent quietly, writes the plist, `launchctl bootstrap gui/<uid> <plist>` | `Installed <plist>` and `Dashboard: http://localhost:<PORT>   Log: <log>` |
| `remove` | `launchctl bootout gui/<uid>/<label>` (errors ignored), deletes the plist | `Removed: the Market Watch service is stopped and will not start at login.` |
| `restart` | `launchctl kickstart -k gui/<uid>/<label>` | `Restarted.`, or `Not installed. Run: npm run service:install` |
| `status` | `launchctl print gui/<uid>/<label>` | `Service: <state> · pid <pid> · last exit code <code>` and the dashboard URL; `Not installed. Run: npm run service:install` without a plist; `Plist exists but is not loaded. Run: npm run service:install` |
| anything else | — | `Usage: node scripts/service.js install \| remove \| restart \| status`, exit 1 |

**`run.js`** (one check from the Terminal, a separate process)
- First trims the log the same way as `tick()`.
- `--test-push`: sends "🪙 Market Watch test" / "If you can read this, phone alerts work." (click: huuto.net). Prints `Test notification sent.` or `Not sent: <reason>`. Exit 0.
- `--scheduled`: outside the run window, prints `<time> Outside run hours — skipped.` and exits 0. Inside, runs with reason `scheduled`.
- Otherwise runs with reason `manual`. `--no-push` sends no alerts.
- Exit code 1 if the check failed or crashed, else 0.
- It shares the run lock with the service (03), so it never runs at the same time as a service check.

## Acceptance criteria

- [ ] The dashboard is reachable at `http://localhost:3002` and not from another device on the network.
- [ ] With run hours 9–23, a check starts within 30 s after each full hour from 9:00 to 23:00, and never between 0:00 and 8:59.
- [ ] Restarting the service at 14:20, after the 14:00 check ran, does not start another check before 15:00.
- [ ] The Mac sleeps 11:30–14:45: on wake, exactly one check runs (slot 14:00), then the next at 15:00.
- [ ] A manual check that starts after a slot's start time counts as that slot: no scheduled check follows it in the same hour.
- [ ] `npm run service:install` twice in a row leaves exactly one running agent.
- [ ] `service.log` never grows past 2 MB for longer than 30 s while the service runs.
- [ ] A second service on the same port exits with the "already in use" message.

## Out of scope

- Running more than one check at a time.
- Checks on a fixed minute other than :00, or several per hour.
- Catching up missed slots from earlier days, or every missed hour of today.
- Any service manager other than launchd.

## Edge cases

- **The service restarts during a check:** the old check dies. Its lock file is fresh, so a check started within 30 minutes logs "Another run is still going — skipping." and returns nothing. `tick()` has already saved that slot as done, so it is not retried; the next hour runs normally.
- **A run hour is removed in Settings while its slot is due:** the next `tick()` uses the new list.
- **The clock moves (daylight saving):** slots use local time. A repeated hour is skipped by `lastSlot`; a skipped hour is missing that day.
- **A check that never finishes (fixed 17 Oct 2026).** On 13 Oct a check stopped at "Collecting listings…" and blocked every later check for 4 days. Now every check has a time limit (`runTimeLimitMin`, 90 min). Past it, the check is stopped as failed: the failure alert fires, the running flag and lock are cleared, and the next slot runs. Saving at the end of a check is guarded step by step, so a disk error can't leave the check "running" either.
- **A Terminal check holds the lock:** `tick()` waits instead of using up the slot, and "Run check now" answers 409.
- **Time zone:** the service sets `TZ=Europe/Helsinki` when no TZ is set, so run hours are Finnish time on a Pi set to UTC.

- **Stale comments (fixed 17 Oct 2026):** the headers of `scripts/service.js` and `server.js` said checks were 2-hourly. They now say hourly, as in this spec.

## Security impact

- The HTTP server binds to 127.0.0.1 only. There is no login (16).
- The LaunchAgent runs as the owner, not as root, and only in their login session.
- The plist holds paths and the port. No secrets.

## Threat modeling

| Threat | Mitigation |
|---|---|
| Another device on the network uses the dashboard | Bound to 127.0.0.1 |
| A crash loop burns CPU | `ThrottleInterval` 30 s between restarts |
| The log fills the disk | Trimmed to 500 kB when over 2 MB, by both the service and `run.js` |
| Two checks run at once and corrupt the data files | One-at-a-time flag in the service, plus the lock file shared with `run.js` (03) |
| A hung check silently stops all alerts | Time limit per check (90 min), then the failure path runs |
