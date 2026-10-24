# Spec: Dashboard

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

A single-page browser dashboard on the owner's Mac that shows today's spot price, the live status of the hourly check, every deal and every past check, and lets the owner act on finds and change settings.

## Overview

The owner opens `http://localhost:3002` (`npm run open`). It is the only user interface besides the phone alerts and the report files. One user, the owner. Plain HTML, CSS and JavaScript (`public/index.html`, `app.js`, `style.css`), no framework, no build step. Served by the service (02, 16). This spec covers the frame: header, tabs, banner, look and live updates. Each tab has its own spec (12–15).

## Backend dependency

- Back-end specs it relies on: 02 service, 03 check pipeline, 07 valuation, 09 settings and decisions, 16 HTTP API and live events.
- Backend ticket / MR: none (single-owner project).

## Interface

### UI

**Look** (`style.css`): dark navy and gold, matching the HopeaGold brand.
- CSS variables: `--bg #0B111E` (page), `--panel #142035`, `--panel2 #1D2A46`, `--line rgba(212,175,55,.2)`, `--line2 rgba(212,175,55,.08)`, `--gold #D4AF37`, `--silver #C2CAD6`, `--text #E8EAF0`, `--dim #8A93A8`, `--green #4CAF7D`, `--amber #F0A840`, `--red #E05A5A`, `--blue #8FB0F0`.
- Font: system UI (`-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif`), 14 px. Numbers use tabular figures, right-aligned.
- Content width at most 1400 px. Tables at least 900 px wide and scroll sideways inside their box.
- Page title "Market Watch".

**Header** (sticky at the top, wraps on narrow windows)
- Brand: 🪙, "HOPEAGOLD MARKET WATCH", and below it "Huuto + Tori · private sellers · below spot".
- Spot: `Gold <€/oz>/oz · <€/g>/g` (gold label in gold), `Silver <€/oz with 2 decimals> €/oz · <€/g with 3 decimals> €/g` (silver label in silver), and dim `spot <time>`. Before the first check: "No spot price yet".
- Run status and the **Run check now** button (gold):
  - Idle: `Next check <weekday day.month. hh.mm>`.
  - Running: `⏳ <stage>…` in amber (the stage from 03, e.g. "⏳ AI: identifying metal content…"), and the button is disabled.
  - Clicking calls `POST /api/run`, then shows "⏳ Starting…". If a check is already running, a browser alert shows "A check is already running."

**Tabs** (one row under the header, scrolls sideways if needed)

| Tab | Badge | Spec |
|---|---|---|
| Deals | number of finds in buy + offer + auction (unfiltered) | 12 |
| Check weight | number of `check` finds | 13 |
| Bought & hidden | — | 14 |
| Runs | — | 14 |
| Settings | — | 15 |

An empty badge is hidden. Deals is open on load. The active tab is underlined in gold. No deep links, and the active tab is not remembered across reloads.

**Your two links** (Settings tab, 15): the Tori link is one text box that takes any Tori search address; the Huuto part is three rows, each a Huuto search address with a metals choice (gold and silver, silver only, gold only). Both have short step-by-step instructions on the page. The Deals tab's second table is headed "AUCTIONS below spot (from your Huuto link)": only auctions in that link count.

**Last-check banner** (above every tab)
- Hidden before the first check.
- Success (gold edge): `Last check <time>: <summary>`.
- Failure (red edge): `Last check <time> failed: <error> — showing the previous results; the next run retries.`

**Formats** (same as alerts, 08): euros `fi-FI` with 2 decimals under 100 €, none from 100 €; percent with "+" when positive, 1 decimal under 10 %; times `fi-FI` short weekday, day.month., hh.mm; "listed" as `N min ago` / `N h ago` (under 48 h) / `N d ago`; time left `2 d 3 h` / `3 h 12 min` / `45 min` / `closed`. Missing values show "—".

**Live updates**
- On load: `GET /api/state` (16), then render everything.
- One `EventSource('/api/events')`:
  - `status` → update the run status and button only.
  - `update` → reload the state and render again.
- Every 30 s, every "time left" counter is recalculated without a reload.
- The Settings form is not re-rendered while the owner is typing in it (focus inside the form), so a live update never wipes unsaved input.

**Coding rules**
- Buttons inside rendered tables use `data-*` attributes with one delegated click handler on `<main>`: `data-filter` / `data-val`, `data-act` inside a `data-key` container, `data-confirm`. **Never inline `onclick` with content.**
- Every string from data is HTML-escaped (`& < > "`). Links open in a new tab with `rel="noopener"`.
- Action errors show in a browser `alert()`, except Confirm (inline red text, 13) and Settings (inline, 15).

### API contract

Uses `GET /api/state`, `POST /api/run` and the SSE stream from 16, plus the tab routes in 12–15. No dashboard-only endpoints. No breaking changes.

### Permissions

Single owner on their own Mac; no roles.

| UI element | Access right | Without the right |
|---|---|---|
| Everything | whoever can open `http://localhost:3002` on this Mac | — (no accounts) |

### Config

- None in the browser. The service's `PORT` sets the address (01).
- Texts that show settings values (offer %, run hours) read them from `/api/state`.

## Acceptance criteria

- [ ] With the service running, `http://localhost:3002` shows the header, spot price, the five tabs and the last-check banner.
- [ ] Starting a check (button or schedule) changes the status to "⏳ Spot price…" and through each stage within a second, without reloading. The button is disabled until it ends.
- [ ] When a check ends, the tables update by themselves.
- [ ] A failed last check shows the red banner with its error.
- [ ] Typing in Settings while a check finishes doesn't lose the typed values.
- [ ] A listing title containing `<script>` shows as text.
- [ ] Every "time left" counts down at least every 30 s.

## Out of scope

- Mobile layout (desktop browser on the owner's Mac; phone use is via alerts).
- Login, accounts, several users.
- Opening the dashboard from another device.
- Browser storage of any kind.

## Edge cases

- **Before the first check:** "No spot price yet", no banner, empty tables with their empty texts.
- **The service is down:** the page doesn't load. If it goes down while open, the state request fails silently and the page keeps the last data; EventSource retries by itself.
- **The page loads during a check:** the first `status` event shows the running stage.
- **A very long listing title or note:** wraps inside the cell.

## Security impact

- No login: anyone who can reach 127.0.0.1:3002 on this Mac can use it (02, 16).
- All content is HTML-escaped; no inline handlers with content.
- No data in URLs or browser storage. Everything comes from the local service.

## Threat modeling

| Threat | Mitigation |
|---|---|
| Script injection through a listing title, description note or seller name | Every string escaped before rendering; `data-*` delegation instead of inline handlers |
| A malicious website opened in the same browser changes settings or decisions | The service rejects POSTs from other origins (16) |
| Another device on the network opens the dashboard | Bound to 127.0.0.1 (02) |
