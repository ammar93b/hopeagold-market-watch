# Spec: Bought & hidden and Runs tabs

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

Two record tabs: the owner's bought coins (kept forever, with the total saved) and hidden listings, both with Undo; and a log of every check with what it scanned, excluded and found.

## Overview

"Bought & hidden" lets the owner see their buying record and undo a mistaken click. "Runs" shows whether the hourly checks are working and why one failed. Both read `GET /api/state` (16).

## Backend dependency

- Back-end specs it relies on: 09 (decisions and snapshots), 03 (run records), 10 (`runs.json`, `decisions.json`), 16.
- Backend ticket / MR: none (single-owner project).

## Interface

### UI

**Bought & hidden tab**
- Heading `BOUGHT`. Lead: `Coins you marked as bought — <n> coins, saved <sum> vs spot at the time. Kept permanently.` (Without any: `Coins you marked as bought. Kept permanently.`)
  - Sum = Σ (snapshot metal value − snapshot price).
- Heading `NOT INTERESTED`. Lead: `Hidden from Deals and never alerted again.`
- Both tables, newest decision first, columns:

| Column | Content |
|---|---|
| Coin | the name linked to the listing, with `Huuto auction` / `Huuto` / `Tori` under it |
| Price | snapshot price |
| Metal value | snapshot metal value |
| Saved | metal value − price, green; "—" if either is missing |
| When | when it was marked |
| (action) | `Undo` → `POST /api/action { key, action: 'reset' }`, then reload |

- Empty: "Nothing marked as bought yet." / "Nothing hidden."
- Rows come from the decision snapshots, so they stay after the listing leaves the findings.

**Runs tab**
- Heading `RUNS`. Lead: `Every check, newest first. Scheduled at <run hours as H:00, comma-separated>.`
- The newest 30 checks. Columns:

| Column | Content |
|---|---|
| When | start time |
| Why | the reason: `scheduled 14:00`, `manual`, `scheduled` (from `run.js`) |
| Took | `<seconds> s` |
| Scanned | `Huuto <n> · Tori <n> · new <n>` |
| Excluded | `Catawiki <n> · companies <Tori + Huuto companies> · wanted <n>` |
| Result | the summary, or the error in red |

- "—" where a failed check has no numbers yet.

### API contract

- `GET /api/state` → `bought`, `hidden` (each: `{ key, at, name, url, platform, saleType, price, meltEur, metal }`, newest first), `runs` (newest 30), `settings.runHours`.
- `POST /api/action` with `reset` works even when the listing is no longer in the findings (16).

### Permissions

| UI element | Access right | Without the right |
|---|---|---|
| Both tabs, Undo | the owner | — (no accounts) |

### Config

None.

## Acceptance criteria

- [ ] Marking two coins Bought (saved 5,00 € and 2,50 €) shows "— 2 coins, saved 7,50 € vs spot at the time".
- [ ] Undo on a Bought coin still in the findings puts it back in Deals (if it still qualifies) and removes it from the history.
- [ ] Undo on a Bought coin from 3 weeks ago removes it from the history without an error.
- [ ] A coin marked Not interested appears under NOT INTERESTED and never in Deals or alerts.
- [ ] After a failed check, its row shows the error in red; after a successful one, the summary.
- [ ] The Runs table shows at most 30 rows.

## Out of scope

- Editing a bought coin's price (the snapshot is as it was when marked).
- Export to CSV or accounting.
- Runs older than the newest 30 on the dashboard (`runs.json` keeps 100).

## Edge cases

- **Bought with no price, or no metal value:** Saved "—" in its row, and it adds 0 to the total (fixed 17 Oct 2026).
- **A coin is bought, then confirmed (Check weight):** both kept; the snapshot is from the last change.

## Security impact

Shows the owner's own buying history on their own Mac. Never sent anywhere.

## Threat modeling

| Threat | Mitigation |
|---|---|
| A mistaken Undo loses history | Undo only removes the status; the coin can be marked again while still listed |
| Script in a stored name | Escaped before rendering |
