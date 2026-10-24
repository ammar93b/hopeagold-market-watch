# Spec: Data files

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

Every file Market Watch reads and writes at run time, all in `<project>/data/`, with its shape, writer, reader and lifetime.

## Overview

There is no database. State is a handful of JSON files plus two generated reports and a log, created on first use. `data/` is git-ignored and is the only thing (besides `.env`) to copy when moving to a new Mac (SETUP.txt Part G). Reference code: appendix C, "src/store.js".

**How files are written** (`src/store.js`)
- `load(name, fallback)`: parse `data/<name>.json`; on any error (missing, broken) return the fallback.
- `save(name, data)`: create `data/` if needed, write pretty JSON (2 spaces) to `<name>.json.tmp`, then rename over `<name>.json`. A killed process never leaves half a file.
- `writeText(name, text)`: plain write (reports).

**Run lock** (`data/run.lock`, the process id as text)
- `lock()`: created atomically (`wx`). If it exists, is younger than **2 hours** and its process is alive, refuse. An older lock is a crashed check and is taken over (a check is stopped after 90 minutes, 02).
- `isLocked()`: a lock younger than 2 hours exists **and its process is still running** (a run killed by a restart no longer blocks; the scheduler and "Run check now" wait only for a live one).
- Taking over a stale lock moves it aside first (rename), so two processes can't both take it.
- `unlock()`: removes the lock only if it holds this process's id. Always called at the end of a check (03).

**Files**

| File | Written by | Read by | Shape | Kept |
|---|---|---|---|---|
| `spot.json` | check, stage 1 | check, API state, reports | `{ gold: { eurOz, eurG, usdOz }, silver: {…}, usdEur, fxDate, at, source }` (04) | latest only |
| `findings.json` | check, at the end | check, API | array of findings (below) | finds listed within 7 days |
| `seen.json` | check, after success | check | `{ "<key>": "<ISO time first seen>" }` | 24 + 48 h |
| `sellers.json` | check, stage 5 | check | `{ "<huuto seller id>": { business, name, type, checkedAt } }` | re-checked after 30 days; never pruned |
| `decisions.json` | API (09) | check, API | `{ "<key>": { status?, at?, confirm?: { grossG, fineness, qty, at }, snapshot } }` | forever |
| `settings.json` | API (09) | service, `run.js` | only the changed settings (09) | forever |
| `runs.json` | check, at the end | scheduler, API, reports | array of runs, newest first | newest 100 |
| `state.json` | scheduler, check | scheduler, check | `{ lastSlot: "YYYY-MM-DD H:00", lastMorning: "<Date.toDateString()>", lastFailurePush: "<ISO>" }` | latest only |
| `report.html` | check, at the end | the owner (browser) | 17 | latest only |
| `latest.txt` | check, at the end | `npm run summary` | 17 | latest only |
| `logs/service.log` | the service (launchd stdout + stderr) | `npm run log` | text lines with local times | trimmed to the last 500 kB when over 2 MB |
| `run.lock` | check | check | process id | during a check |

`logs/run.log` may exist from an older version. Nothing writes or reads it now.

**Finding** (one element of `findings.json`)

| Field | Set by | Meaning |
|---|---|---|
| `key`, `platform`, `id`, `url`, `title` | sources (04) | identity and link |
| `name`, `note` | AI identify (05) | short name; ≤15-word note |
| `saleType` | sources | `auction` or `buy-now` |
| `price`, `buyNowPrice`, `bidders`, `closingTime` | sources, refreshed (03) | current price (auction: current bid), Huuto buy-now price, bid count, closing time |
| `deliveryPrice`, `offersAllowed` | details (04) | shipping if known; seller takes offers (always true on Tori) |
| `location`, `seller` | sources | as listed |
| `listedAt`, `foundAt` | sources, check | when listed; when found |
| `status` | check, refresh | `open` or `closed` |
| `metal`, `priceBasis`, `content` | identify + valuation (05, 07) | `gold`/`silver`; `total`/`each`/`unclear`; `{ metal, specLabel, grossG, fineness, qty, fineG, estimate }` |
| `notified` | check (03) | `{ buy?, offer?, closing? }`: when each alert went out |
| `checkedAt` | refresh | last refresh |
| `userStatus` | decisions (09) | the owner's status or null |
| `meltEur`, `premium`, `savedEur`, `maxPrice`, `offerPrice`, `suspicious`, `valuedAt`, `category`, `checkReason`, `estCategory` | valuation (07) | recomputed at every check and every state load |

**Run** (one element of `runs.json`)
- `at`, `reason`, `durationSec`, and either `summary` or `error` (03).
- `stats`:

| Key | Meaning |
|---|---|
| `huuto`, `tori` | listings in the window (Tori after dropping companies and wanted ads) |
| `catawiki`, `toriBusiness`, `toriBusinessNames`, `wanted` | Tori listings dropped |
| `newListings` | not seen before |
| `screened` | candidates after rules + AI screen |
| `huutoBusiness` | Huuto candidates dropped as companies |
| `found` | new gold/silver finds |
| `morningSummary` | true if the ☀️ summary went out |
| `pushedBuyOffer`, `pushedAuctions` | alerts chosen |

A failed check has only the stats filled before the failure.

## Acceptance criteria

- [ ] Killing the service during a save never leaves a broken JSON file; at worst a stray `.tmp` remains.
- [ ] Deleting `data/` and starting the service recreates every file it needs on the first check. Bought history and settings are lost, nothing else breaks.
- [ ] `seen.json` has no entry older than 72 hours after a successful check.
- [ ] `runs.json` has at most 100 entries; `findings.json` has no find listed more than 7 days ago after a check.
- [ ] `decisions.json` keeps Bought entries indefinitely.
- [ ] A lock file older than 2 hours doesn't stop a check; one process never removes another's lock.

## Out of scope

- Backups (the owner copies `data/` when moving Macs).
- A database or any file outside `data/` (except the LaunchAgent plist, 02).
- Pruning `sellers.json`.

## Edge cases

- **A broken JSON file** (edited by hand): read as its fallback (empty). For `decisions.json` that hides the history until fixed, and the next decision overwrites the file.
- **Two processes write the same file:** prevented for checks by the lock. A dashboard click during a check writes `decisions.json` only, which the check does not write.
- **The disk is full:** the write throws. The check fails and the error shows in Runs.
- **`data/` deleted while the service runs:** recreated on the next save.

## Security impact

- `data/` holds the owner's buying history, settings (possibly the ntfy topic) and cached public seller info. It is git-ignored and stays on the Mac.
- No passwords or keys are stored.

## Threat modeling

| Threat | Mitigation |
|---|---|
| Buying history or topic pushed to GitHub | `data/` in `.gitignore`; the auto-sync hook skips secret-looking files |
| A half-written file after a crash | Write `.tmp`, then rename |
| A stale lock blocks all checks after a crash | Locks older than 2 hours are taken over |
| Endless growth | runs: 100; findings: 7 days; seen: 72 h; log: trimmed at 2 MB. Only `sellers.json` grows (a few KB per hundred sellers) |
