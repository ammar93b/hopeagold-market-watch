# Spec: Check weight tab

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

A list of possible deals whose metal content is an AI estimate (or whose price may be per piece), with a form to enter the real weight from the listing so the find is valued properly.

## Overview

Code never alerts on a guessed weight (05, 07). These finds would be deals if the guess is right, so the owner opens the listing, reads the stated weight and fineness, and confirms them here. A confirmed find is re-valued with the owner's numbers and moves to Deals if it is below spot, where it alerts like any other.

## Backend dependency

- Back-end specs it relies on: 07 (category `check`, `checkReason`), 09 (`confirmWeight`, statuses), 16 (`POST /api/confirm`, `POST /api/action`).
- Backend ticket / MR: none (single-owner project).

## Interface

### UI

- Heading `CHECK WEIGHT FIRST`.
- Lead text: `These would be deals, but the metal content is an AI estimate (or it's unclear if the price is per piece). Open the listing, then enter the weight and fineness it states — the coin moves to Deals with the real numbers. Never sent to your phone until confirmed.`
- Rows: every `check` find, ranked (07). No filters on this tab.
- Columns:

| Column | Content |
|---|---|
| Coin | the item cell (12) |
| Price | price, or "—" |
| Est. metal | the estimated metal value |
| vs spot | premium |
| Where | `Huuto auction` / `Huuto buy now` / `Tori`; for auctions `<time left> left`; then the reason (`weight/fineness estimated` or `unclear if price is per piece`) |
| Confirm from the listing | the confirm form |

- **Confirm form** (per row), prefilled with the current estimate:
  - grams (number, step 0.01, min 0, placeholder "grams");
  - fineness in thousandths (number, step 1, 1–1000, placeholder "925");
  - pieces (number, step 1, min 1, placeholder "pieces", default 1);
  - `Confirm` → `POST /api/confirm { key, grossG, fineness, qty }`, then reload. On error, the message shows in red next to the buttons (no alert).
  - `Not silver/gold` → `POST /api/action { key, action: 'dismissed' }` (Not interested, 14).
- The tab badge = the number of rows. Empty: "Nothing to check."

### API contract

- `POST /api/confirm` `{ key, grossG, fineness, qty }` → `{ decision }`. Fineness may be 925 or 0.925. Errors (400): `Weight must be grams, e.g. 24 or 24.2`, `Fineness must be like 925, 0.925 or 500`; 404 `Listing not found` (09, 16).
- `POST /api/action` as in 12.

### Permissions

| UI element | Access right | Without the right |
|---|---|---|
| Table and form | the owner | — (no accounts) |

### Config

None.

## Acceptance criteria

- [ ] An AI-estimated find below spot appears here, not in Deals, and no alert was sent for it.
- [ ] Confirming 24 / 900 / 1 on a buy-now find priced below the value of 21.6 g of silver moves it to Deals as BUY NOW on the next state load, and the next check alerts it.
- [ ] Confirming numbers that put it above spot removes it from this tab; it shows in Deals only if it qualifies as an OFFER.
- [ ] Confirming an empty weight shows "Weight must be grams, e.g. 24 or 24.2" in red in that row.
- [ ] `Not silver/gold` removes the row and lists it under Not interested.
- [ ] After confirming, the find's content line ends with "· weight confirmed by you".

## Out of scope

- Editing a find's price or name.
- Confirming finds that are already in Deals (their weight comes from the table or the listing).
- Bulk confirm.

## Edge cases

- **`unclear if price is per piece`:** confirming sets the price basis to total. To value one piece of a per-piece listing, enter that one piece's weight and pieces 1.
- **Fineness typed as 0.925:** accepted (09).
- **Pieces empty or 0:** stored as 1.
- **The listing closed:** the row disappears at the next check.
- **A live update arrives while typing in a confirm field:** the table is re-rendered and the typed values are lost. Only the Settings form is protected from this (11).

## Security impact

The owner's numbers are validated as numbers in range (09) and stored in `decisions.json`. Nothing else changes.

## Threat modeling

| Threat | Mitigation |
|---|---|
| A wrong confirmation creates a false BUY NOW alert | The owner enters numbers from the listing; the alert and Deals show the confirmed grams × fineness, so a typo is visible |
| A cross-site POST confirms a fake weight | Origin check (16) |
| Out-of-range input breaks valuation | Server-side validation: 0 < grams < 100 000, 0 < fineness ≤ 1 |
