# Spec: Valuation and categories

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

Code-only valuation: each find's metal value at today's spot, how far its price is from spot, the most to pay, a suggested offer, and which category it belongs in (BUY NOW, OFFER, AUCTION, CHECK or none).

## Overview

`src/value.js` turns metal content and a price into the numbers the owner acts on. Spot (the metal value) is the **maximum price worth paying**. The AI never takes part. Every find is re-valued at the latest spot in every check (03) and every time the dashboard loads its state (16). Reference code: appendix C, "src/value.js".

**Metal content** (`metalContent(ai)`, from the identify answer, 05)
- With a `specId` found in the coin table (06): `metal`, `grossG`, `fineness` from the table; `specLabel` = the table label.
- Otherwise: `metal`, `grossG`, `fineness` from the AI; `specLabel` null.
- A fineness above 1 is read as thousandths (925 → 0.925).
- `qty` = 1 when `priceBasis` is `each`, else the AI's `qty` rounded, at least 1.
- No content (returns null, and the listing is dropped) unless `grossG > 0` and `0 < fineness ≤ 1`.
- `fineG = grossG × fineness × qty`.
- `estimate`: with a table spec, true only when the AI said `estimate: true` (an uncertain lot count). Without one, true unless the AI said `estimate: false`.
- Result: `{ metal, specLabel, grossG, fineness, qty, fineG, estimate }`.

A weight the owner confirms (09, 13) replaces `grossG`, `fineness`, `qty` and `fineG`, sets `estimate` false and `specLabel` "weight confirmed by you", and sets `priceBasis` to `total`.

**Numbers** (`evaluate(f, spot)`)

| Field | Formula |
|---|---|
| `meltEur` (metal value) | `fineG × spot[metal].eurG`; null without content |
| `premium` (vs spot) | `price ÷ meltEur − 1`; null when there is no metal value or the price is 0 or missing |
| `savedEur` | `meltEur − price`; null in the same cases |
| `maxPrice` | `meltEur` rounded **down**: to 10 cents under 100 €, to whole euros from 100 € |
| `offerPrice` | `meltEur × (1 − offerDiscount)` rounded down the same way (default discount 10 %) |
| `suspicious` | not an auction, and `premium` < the "unusually cheap" limit (default −0.5, i.e. more than 50 % under spot) |
| `valuedAt` | the spot's time |

A price of 0 € (an auction starting at zero) says nothing, so it gives no premium.

**Category** (only when there is a metal value, the listing is not closed, and the owner hasn't marked it Bought or Not interested)

| Sale type | Condition | Category |
|---|---|---|
| auction | `premium < 0` | `auction` (Category 2) |
| buy-now | `premium < 0` | `buy` (Category 1, BUY NOW) |
| buy-now | seller takes offers, and no premium (no price) or `premium ≤ offerMaxPremium` (default +20 %) | `offer` (Category 1, OFFER) |
| anything else | | none |

Then: if the content is an estimate, or `priceBasis` is `unclear`, the category becomes `check` instead. `checkReason` is `unclear if price is per piece` (when `priceBasis` is unclear) or `weight/fineness estimated`. `estCategory` keeps the category it would have had. Estimated finds are never ranked with confirmed deals and never alerted (08).

"Seller takes offers": every Tori listing; Huuto when the listing allows offers (04).

"Contacted" doesn't change the category. It only stops alerts (03).

**Ranking** (`rank(list)`, comparator `compareDeals`, the only copy since 18 Oct 2026; the dashboard's browser code keeps its own copy): `premium` ascending (most below spot first), a missing premium counted as 0; ties by `savedEur` descending. The dashboard and report rank the same way.

## Acceptance criteria

- [ ] 1 markka 1874 (table: 5.1828 g × 0.868) with silver at 1.00 €/g: metal value 4.4987 €, max price 4.40 €, offer price 4.00 €.
- [ ] Price 3.50 € for that coin: premium −22 %, saved 1.00 €, category `buy`.
- [ ] Price 5.00 € on Tori: premium +11 %, category `offer`. Price 6.00 € (+33 %): no category.
- [ ] A Huuto buy-now at +10 % without offers allowed: no category.
- [ ] A Huuto auction at 2.00 € for that coin: `auction`. At 0 €: no premium, no category.
- [ ] Metal value 150.70 € → max price 150 €. Metal value 99.99 € → max price 99.90 €.
- [ ] An AI-estimated find with premium −30 %: category `check`, `estCategory` `buy`, reason "weight/fineness estimated".
- [ ] `priceBasis` `each` with qty 5 in the AI answer: valued as one piece.
- [ ] A Tori listing at 20 % of its metal value (premium −80 %): `buy` and `suspicious`. An auction at −80 %: not suspicious.
- [ ] Bought, Not interested or closed findings have no category. Contacted findings keep theirs.

## Out of scope

- Shipping costs (shown separately when known, never subtracted).
- Fees, VAT, collector premiums, condition.
- Predicting final auction prices.
- Spot changes during the day (values use the latest spot at check or page load).

## Edge cases

- **No price shown, buy-now, offers allowed:** `offer`, with "no price" shown. Offer price is still metal value − 10 %.
- **No spot price for the metal** (should not happen): no metal value, no category.
- **Exactly at spot** (premium 0): not `buy`. It is `offer` if the seller takes offers.
- **Rounding never goes over the metal value:** both max and offer prices round down.
- **A confirmed weight on a per-piece listing:** `priceBasis` becomes `total`, so the owner's pieces count is used against the price.

## Security impact

None. Pure functions over data already in `data/`.

## Threat modeling

| Threat | Mitigation |
|---|---|
| A typo or per-piece price looks like a huge deal | `suspicious` flag (more than 50 % under spot) shown on the dashboard and in the alert; `priceBasis` unclear goes to Check weight |
| An AI-guessed weight triggers a purchase | Estimated content can only be `check`, which is never alerted |
| Rounding makes a suggested price exceed the metal value | Max and offer prices are always rounded down |
