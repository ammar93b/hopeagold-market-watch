# Spec: Deals tab

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

The main tab: every open gold and silver deal from private sellers, in two ranked tables (buy now / offer, and Huuto auctions), with filters and one-click actions.

## Overview

The owner opens this tab to see what to act on right now and to record what they did. It shows the same finds the phone alerts are about (08), plus older ones still open. Ranking: most below spot first.

## Backend dependency

- Back-end specs it relies on: 07 valuation and categories, 09 decisions, 16 (`GET /api/state`, `POST /api/action`).
- Backend ticket / MR: none (single-owner project).

## Interface

### UI

**Filters** (chips at the top; one choice per group; gold when active)
- Metal: `Gold + silver` (default) · `Gold` · `Silver`.
- Site: `Huuto + Tori` (default) · `Huuto` · `Tori`.
- Filters apply to both tables, live, in the browser only. They reset to the defaults on reload. The tab badge always counts everything.

**Category 1: heading `CATEGORY 1 — BUY NOW · Huuto buy-now + Tori`**
- Lead text: `BUY NOW = price below metal value. OFFER = up to +<offer range> % over (or no price) and the seller takes offers: offer <discount> % under metal value, never above it. Most below spot first.` (percentages from the current settings).
- Rows: all `buy` finds (ranked, 07), then all `offer` finds (ranked).
- Columns:

| Column | Content |
|---|---|
| # | 1, 2, 3 … |
| Action | `BUY NOW` badge (green), or `OFFER <offer price>` badge (blue) with `max <max price>` under it |
| Coin | the item cell (below) |
| Price | price, or "no price" (dim) |
| Metal value | `meltEur` |
| vs spot | premium; green when below 0 |
| You save | BUY: `savedEur` in green. OFFER: `at offer <metal value − offer price>` (dim) |
| Where | `Huuto buy now` / `Tori`, then `+ shipping <x>` if known, then the location |
| Listed | `N min/h/d ago` |
| (actions) | the action buttons (below) |

- Empty: "Nothing below spot right now."

**Category 2: heading `CATEGORY 2 — AUCTIONS below spot (Huuto, from your link)`**
- Lead text: `Current price is below the metal value. Bid at most the max bid (= metal value). Final prices usually rise near the close — your phone gets a ⏰ BID alert on the last check before each closes.`
- Rows: all `auction` finds, ranked.
- Columns: # · Coin (item cell) · Now (price, with `<n> bids` under it) · Metal value · vs spot (green) · Save now (green) · **Max bid** (bold) · Time left (amber live countdown, `closes <time>` under it, then shipping and location) · actions.
- Empty: "No auctions below spot right now."

**Item cell** (used by every table in 12 and 13)
- The name as a link to the listing (new tab).
- Badges after it: `unusually cheap — check` (amber) when suspicious; `contacted` (silver) when marked Contacted.
- The listing's own title in quotes (dim).
- The content line: `[<qty> × ]<grams> g × <fineness in thousandths> = <fine grams> g Au|Ag[ · <spec label>]`.
- The AI note in italics, if any.

**Action buttons** (per row)

| Button | Sends | Effect |
|---|---|---|
| `Contacted` / `✓ Contacted` (blue when on) | `contacted`, or `reset` when on | tags it; no more alerts; stays in the table |
| `Bought` | `bought` | moves it to the Bought history (14); no more alerts |
| `Not interested` | `dismissed` | hides it (Not interested list, 14); never alerted again |

Each click calls `POST /api/action { key, action }`, then reloads the state. An error shows in a browser alert.

### API contract

- `GET /api/state` → `findings` (with category, numbers and `userStatus`), `deals` (offer settings for the lead text).
- `POST /api/action` `{ key, action: 'contacted' | 'bought' | 'dismissed' | 'reset' }` → `{ decision }`; 404 `Listing not found`, 400 `Unknown action` (16).
- No new APIs.

### Permissions

| UI element | Access right | Without the right |
|---|---|---|
| Tables, filters, actions | the owner (whoever can open the page) | — (no accounts) |

### Config

The lead text reads `offerMaxPremium` and `offerDiscount` from the state. No other config.

## Acceptance criteria

- [ ] Finds at −35 % (buy), −5 % (buy) and +10 % (offer) appear in that order in Category 1.
- [ ] Choosing `Silver` hides gold finds in both tables. Choosing `Tori` hides Huuto finds, so Category 2 shows "No auctions below spot right now."
- [ ] `Bought` removes the row, and the coin appears in Bought & hidden.
- [ ] `Contacted` keeps the row, shows the `contacted` badge and turns the button into `✓ Contacted`. Clicking it again removes the tag.
- [ ] An OFFER row shows `OFFER 4,00 €` with `max 4,40 €` for a coin with metal value 4,4987 € (07).
- [ ] An auction's time left counts down while the page is open and reads `closed` after its closing time.
- [ ] The Deals badge shows buy + offer + auction finds, whatever the filters.

## Out of scope

- Sorting by other columns.
- Showing listing photos.
- Buying, bidding or messaging from the dashboard.
- Finds in `check` (13) or without a category.

## Edge cases

- **No price** (offer): "no price" in Price; vs spot "—".
- **A row's listing closed since the last check:** it disappears at the next state load after the check marks it closed (07).
- **Double-click on an action:** two requests with the same action (the button is not re-rendered between them). The end result is the same as one click.
- **A listing dropped from the findings while the page is open:** its action fails with "Listing not found", shown in an alert.

## Security impact

- Shows only public listing data and the owner's own decisions.
- Listing links come from the sources (04) and open with `rel="noopener"`. All text is escaped.
- Actions are POSTs checked for the dashboard's origin (16).

## Threat modeling

| Threat | Mitigation |
|---|---|
| A listing name or note carries HTML/script | Escaped before rendering |
| A crafted link in the data (e.g. `javascript:`) | URLs are built by the sources from the platforms' own ids or API links (04), not taken from free text |
| A cross-site POST marks listings as bought | Origin check (16) |
