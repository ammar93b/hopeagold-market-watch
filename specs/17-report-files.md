# Spec: Report files

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

Two files rewritten after every check: `data/report.html`, a self-contained page with the same deals as the dashboard, and `data/latest.txt`, a plain-text summary for the Terminal.

## Overview

The reports let the owner see the latest results without the service running (open the HTML file) or from the Terminal (`npm run summary`). They are read-only snapshots: no buttons, no API calls. Reference code: appendix C, "src/report.js".

## Backend dependency

- Back-end specs it relies on: 03 (written at the end of every check when a spot price exists), 07 (categories and ranking), 10.
- Backend ticket / MR: none (single-owner project).

## Interface

### UI

**Sections** (both files): findings grouped by category and ranked (07): `buy`, `offer`, `auction`, `check`. Formats as in 11.

**`report.html`** (one file, inline CSS and a small inline script, the same colours as the dashboard; content up to 1280 px wide)
- Title "HOPEAGOLD MARKET WATCH".
- Bar: `Gold <€/oz>/oz · <€/g>/g`, `Silver <€/oz>/oz · <€/g, 3 decimals> €/g`, `spot <time> · updated <check time> · next run <time>`.
- If the check failed: red box `Last run failed: <error>` with `Showing the last results. Nothing was lost — the next run retries these listings.`
- `Private sellers only. Scanned <h> Huuto + <t> Tori listings from the last 24 h · excluded Catawiki <n>, other companies <n>, wanted ads <n>.`
- `CATEGORY 1 — BUY NOW · Huuto buy-now + Tori` with its lead text (settings values in it) and the table: # · Action · Item · Price · Metal value · vs spot · You save · Where · Listed. Same cells as the dashboard (12), without action buttons. Empty: "Nothing below spot right now."
- `CATEGORY 2 — AUCTIONS below spot (Huuto, from your link)`: # · Item · Now · Metal value · vs spot · Save now · Max bid · Time left. Empty: "No auctions below spot right now."
- `CHECK WEIGHT FIRST` (only when there are any): Why (reason badge) · Item · Price · Est. metal · vs spot · Where. Lead: `Would be deals, but the metal content is an AI estimate (or it's unclear whether the price is per piece). Open the listing and confirm before acting. Never sent to your phone.`
- `RUNS`: the newest 8 checks: When · Why · Took · Result (error in red).
- Footer: `Metal value = fine weight × spot (<spot source>). Shipping is not included. Specs come from the verified table (rules/coin-specs.js) or the listing's own weight and fineness; AI-estimated weights are listed under "Check weight first" only.` and `Runs at <hours>. Settings: config.js. Setup and troubleshooting: SETUP.txt.`
- The script recalculates every "time left" on open and every 30 s.
- Every text is HTML-escaped; links open in a new tab with `rel="noopener"`.

**`latest.txt`** (plain text, one line per item plus its URL)
```
HOPEAGOLD MARKET WATCH — <check time>
Spot: gold <€/oz>/oz (<€/g>/g) · silver <€/oz>/oz (<€/g>/g)
⚠ LAST RUN FAILED: <error>                      (only after a failure)
Next run: <time>

CATEGORY 1 — BUY NOW (Huuto buy-now + Tori), most below spot first
  1. BUY NOW  <pct>  save <saved>  <name> — <price> (metal <melt>)  <where>[  ⚠ unusually cheap — check]
     <url>
  2. OFFER <offer> (max <max>)  <name> — asking <price or no price> (<pct>)  <where>
     <url>
  (or "  nothing below spot right now")

CATEGORY 2 — AUCTIONS below spot (Huuto, from your link), most below spot first
  1. <pct>  now <price> (<n> bids)  bid max <max>  <name>  — <time left> left (closes <time>)
     <url>
  (or "  none right now")

CHECK WEIGHT FIRST — possible deals, metal content estimated by AI     (only when any)
  • <pct>  <name> — <price or no price> vs est. metal <melt>  <where> (<reason>)
     <url>
```
OFFER numbering continues after the BUY rows.

### API contract

None. Files on disk only.

### Permissions

| UI element | Access right | Without the right |
|---|---|---|
| Both files | whoever can read the owner's `data/` folder | — |

### Config

Run hours and the offer percentages in the texts come from the effective settings at the time of the check (09). `lookbackHours` from `config.js`.

## Acceptance criteria

- [ ] After every check, successful or not, both files are rewritten, as long as any spot price exists (this check's or an earlier one).
- [ ] `report.html` opens from disk in a browser with no network access and shows the same Category 1 and 2 rows as the dashboard at that moment, in the same order.
- [ ] `npm run summary` prints `latest.txt` with one URL line under every item.
- [ ] After a failed check, `latest.txt` has the "⚠ LAST RUN FAILED" line and `report.html` the red box.
- [ ] The Check weight section is absent from both files when there are no `check` finds.

## Out of scope

- Action buttons or any write action in the reports.
- History of past reports (each check overwrites them).
- Emailing or uploading the reports.

## Edge cases

- **No spot price ever fetched** (the very first check failed at stage 1): neither file is written.
- **A failed check:** the files show the previous findings with the error.
- **Stale comments in the source:** `src/report.js` says to open the HTML "with `npm run report`", but there is no such script. Open `data/report.html` directly. The footer's "Settings: config.js" is also out of date: dashboard settings (09) override `config.js`.

## Security impact

Local files in `data/` (git-ignored). Same content as the dashboard. All text escaped. No external resources, so opening the file sends no requests.

## Threat modeling

| Threat | Mitigation |
|---|---|
| Script in a listing title runs when the report is opened | Escaped before writing |
| The report is shared and leaks the owner's interests | It stays in `data/` unless the owner copies it out |
