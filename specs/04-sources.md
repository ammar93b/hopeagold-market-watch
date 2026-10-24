# Spec: Sources: spot, Huuto, Tori

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

Plain HTTP readers for today's gold and silver spot price in euros, new coin listings on Huuto.net and Tori.fi, each listing's details, and whether a Huuto seller is a company.

## Overview

`src/sources.js` has no AI and no browser. It turns three public sources into one listing shape for the check (03). It also enforces the rule that only private people count (Catawiki cross-posts are spam and are never counted as finds). Reference code: appendix C, "src/sources.js".

**HTTP requests** (`get(url, { json, allow404 })`)
- Headers: `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36` and `Accept-Language: fi-FI,fi;q=0.9,en;q=0.8`.
- Time limit 30 s per request.
- With `allow404`, a 404 or 410 returns `null`.
- Any other non-OK answer throws `<hostname> answered <status>`.

**Spot** (`getSpot()`)
- In parallel: `https://api.gold-api.com/price/XAU`, `https://api.gold-api.com/price/XAG` (USD per troy ounce, no key) and `https://api.frankfurter.dev/v1/latest?from=USD&to=EUR` (the ECB rate).
- If either price or the rate is missing or not above 0, throw `Spot price feed returned no price`.
- €/oz = USD/oz × rate. €/g = €/oz ÷ 31.1035.
- Returns `{ gold: { eurOz, eurG, usdOz }, silver: { … }, usdEur, fxDate, at, source: 'gold-api.com spot (USD/oz) × ECB rate (frankfurter.dev)' }`.

**Huuto list** (`fetchHuuto(since)`)
- Huuto's API can only filter by **category**. Tested 17 Oct 2026: the `keyword`, `q`, `search`, `text`, `query` and `saleMethod` parameters are all ignored (the total count does not change). The Huuto website answers automated requests with HTTP 403 (Cloudflare), so it is never read.
- For each link: `GET https://api.huuto.net/1.1/items?category=<link category>&sort=newest&limit=100&page=<N>`, pages 1 to 10, with a pause between links.
- Each of the owner's three Huuto links is one category (`huuto.links`: `my-links.js`, Settings 09). Buy-now and auction listings in it are both kept, in the API's newest-first order. Each listing carries its link's `metals` (gold, silver, or both). Silver-only links drop gold items later, in the check (03).
- The three default links (17 Oct 2026): 1166 Kultarahat ja -harkot (gold coins mainly; gold and silver), 1165 Ulkomaalaiset juhlarahat ja vuosisarjat (foreign commemoratives; gold and silver), 260 Ulkomaiset kolikot (ei eurot) (foreign coins; silver only). Huuto's website addresses (`https://www.huuto.net/haku?category=<N>&sort=newest`) are the owner's way to set them; the number after `category=` is what the API uses. Verified 17 Oct 2026: the API returns the same category names and both sale methods.

| Id | Name |
|---|---|
| 1166 | Kultarahat ja -harkot |
| 258 | Suomalaiset kolikot - markka |
| 257 | Suomalaiset juhlarahat ja vuosisarjat - markka |
| 260 | Ulkomaiset kolikot (ei eurot) |
| 1165 | Ulkomaalaiset juhlarahat ja vuosisarjat (ei eurot) |
| 1161 | Euro juhlarahat (kaikki maat) |

  Huuto has no silver-only category, so silver is found by screening all of these.
- Skip items whose `listTime` is before `since`.
- Map each item to a listing: `key huuto:<id>`, `platform 'huuto'`, `id` (string), `title`, `category`, `url` = `links.alternative` or `https://www.huuto.net/kohteet/<id>`, `saleType` `auction` when `saleMethod` is `auction`, else `buy-now`; `price` = `currentPrice` for auctions, else `buyNowPrice` (or `currentPrice`); `buyNowPrice` or null; `bidders` (`bidderCount`, default 0); `closingTime` or null; `listedAt` (ISO); `location`; `seller`; `sellerId`.
- Stop when a page is empty, its last item is older than `since`, or there is no `links.next`. 500 ms between pages.
- The Huuto website has a Cloudflare check; the API doesn't. Use only the API.

**Huuto details** (`huutoDetails(id)`): `GET /1.1/items/<id>`.
- 404/410: `{ status: 'closed' }`.
- Else `{ description` (HTML to text)`, deliveryPrice, quantity` (default 1)`, offersAllowed, condition, status` (`open` only when the API says `open`, else `closed`)`, price` (same rule as the list)`, bidders, closingTime }`.
- HTML to text: `<br>` and `</p>` become new lines, other tags spaces; `&nbsp; &amp; &quot; &#39;` decoded; runs of spaces and blank lines collapsed; trimmed.

**Huuto seller** (`huutoSeller(sellerId)`): `GET /1.1/users/<id>`.
- 404/410: a person.
- Business when `type` is `company` or `companyName` is set. Returns `{ business, name: companyName or null, type }`.
- The check caches the answer per seller id for 30 days in `sellers.json`, with a 200 ms pause after each new lookup (03).

**Tori list** (`fetchTori(since)`)
- The Tori link (`tori.searchUrl`: `my-links.js`, Settings 09), with `page=<N>` set for pages 2 to 8. Every filter in the link is kept (for example `product_category` and `q`). Tested 17 Oct 2026: `q=` changes the results, so any Tori search address works.
- The link must start with `https://www.tori.fi/recommerce/forsale/search`, must not contain `sort=` (Tori's robots.txt forbids it), and any `page=` in it is dropped.
- Tori's default order is newest first. **Never add `sort=`**: Tori's robots.txt disallows it.
- Parsing one page (`parseToriPage`):
  - Split the HTML on `class="sf-search-ad-link` and drop the part before the first card.
  - In each chunk, match the card pattern (exact regex `CARD_RE` in appendix C): `<span>PRICE</span></div><h2 … id="search-ad-<ID>-…">TITLE</h2> … <span class="whitespace-nowrap truncate mr-8">LOCATION</span><span class="whitespace-nowrap">AGE</span>`. A chunk that doesn't match is skipped.
  - **Company badge:** Tori's seller-name element between the end of that match and `Lisää suosikkeihin`: `<div class="… s-text-subtle truncate"><span>NAME</span></div>`. Private people have none. Since 18 Oct 2026 only this element counts, so another label on a card (shipping, a promotion) is not taken for a company. Checked on the live page: 20 company cards and 33 private, the same as the old rule.
  - Text decoding: `&amp; &quot; &#x27; &#39; &lt; &gt; &nbsp;` and non-breaking/thin spaces; whitespace collapsed.
  - Price: only if the text has a digit and `€`. Remove everything but digits and the comma, comma to dot, parse (`1 200 €` → 1200, `12,50 €` → 12.5). Else null.
  - Wanted ad: the price text is exactly `Ostetaan` (any case).
  - Age to minutes: `<n> s|sek` 0, `min` 1, `t|h` 60, `pv` 1440, `vk` 10080, `kk` 43200 per unit; `nyt` 0; anything else unknown (null).
- Window in **whole minutes**: `round((now − since) / 60000)`. A card is outside it when its age is unknown or ≥ the window. So "1 pv" (shown for 24–47 h) is outside a 24 h window.
- For each card inside the window: a badge containing "catawiki" (any case) counts as `catawiki`; any other badge counts as `business` (and its name in `businessNames`); a wanted ad counts as `wanted`. All of those are dropped. The rest become listings: `key tori:<id>`, `platform 'tori'`, `title`, `category 'Kolikot ja setelit'`, `url https://www.tori.fi/recommerce/forsale/item/<id>`, `saleType 'buy-now'`, `price`, `priceText`, `listedAt` = now − age, `location`, `offersAllowed: true` (Tori sellers are messaged directly, so every price is negotiable).
- Stop when a page has no cards. Without search words (no `q=`), also stop when the last card is outside the window (newest first). With search words, Tori orders by relevance, so all `maxPages` pages are read and filtered by age. 1 s between pages.
- **Zero cards across all pages** throws `Tori returned no listing cards — the page layout may have changed`. Since 17 Oct 2026 this only skips Tori for that check (the Huuto part still runs), because a narrow Tori search can be empty.
- Returns `{ items, skipped: { catawiki, business, wanted, businessNames } }`.

**Tori item** (`toriItem(id)`, parsing in `parseToriItem`): `GET https://www.tori.fi/recommerce/forsale/item/<id>`.
- **Sold or removed (18 Oct 2026):** the page data has `"disposed":true` (escaped inside a script) → `closed`. A live page has `"disposed":false`.
- **Current price:** from the page's own schema.org `Product` record (`offers.price`, in a `<script type="application/ld+json">`), never from other prices on the page. The refresh (03) and the first read update a Tori find's price with it. `offers.availability` `SoldOut`/`Discontinued` also counts as closed.
- The `disposed` flag counts only where it belongs to the ad (directly before its `adViewTypeLabel`).
- 404/410: `{ status: 'closed', description: '' }`.
- Else `{ status: 'open', description }`, where the description is the first `<div class="whitespace-pre-wrap">` after `data-testid="description"`, HTML to text. Empty if not found.

## Acceptance criteria

- [ ] A silver-only link (260) keeps a silver lot and drops a gold lot found in it. A gold+silver link (1166) keeps both.
- [ ] A Tori link with `sort=` is refused in Settings.
- [ ] `getSpot()` returns €/g = (USD/oz × rate) ÷ 31.1035 for both metals, and throws when any feed returns 0 or nothing.
- [ ] A Huuto auction listing has `price` = current price; a buy-now listing has `price` = buy-now price.
- [ ] Huuto paging stops at the first page whose last item is older than 24 h, or after page 10.
- [ ] A Tori card with a "Catawiki" badge is counted in `catawiki` and never returned. One with "Rahaliike JNCoins" is counted in `business` and `businessNames`.
- [ ] A Tori card priced "Ostetaan" is counted in `wanted` and never returned.
- [ ] A Tori card aged "1 pv" is outside a 24 h window; "23 t" is inside.
- [ ] Prices "1 200 €" → 1200, "12,50 €" → 12.5, "Annetaan" → null.
- [ ] No Tori request URL ever contains `sort=`.
- [ ] A Tori page with the expected HTML but zero cards on every page makes the check fail with the "layout may have changed" message.
- [ ] A Huuto seller whose profile type is `company` is reported as business, with its company name.

## Out of scope

- Other marketplaces (Catawiki, eBay, Facebook, auction houses).
- Logging in to any site, or a headless browser.
- Reading photos.
- Shipping costs on Tori (not shown in the list).

## Edge cases

- **A Tori listing is sold but the page still exists:** closed by its `disposed` flag. If Tori renames that field, sold listings stay `open` until their page is removed (404/410).
- **Tori changes its HTML:** zero cards → the check fails with a clear message (Troubleshooting: fix `parseToriPage`). If only the badge or age markup changes, cards may parse wrongly without an error; the Runs tab counts (Catawiki, companies) show it.
- **Huuto or Tori is down:** the error (e.g. `api.huuto.net answered 503`) fails the check, which retries next hour.
- **A Tori price with a decimal point instead of a comma:** the dot is removed (e.g. "12.50 €" → 1250). Tori uses commas.
- **Huuto seller lookup fails** (network): the check treats the seller as a private person (03).
- **A Huuto item has no `links.alternative`:** the URL is built from the id.

## Security impact

- Only public pages and APIs are read. No accounts, cookies or personal data of the owner are sent.
- Requests identify as a desktop Chrome browser.
- Pauses between requests keep the load to a few requests per second at most. Tori's robots.txt rule on `sort=` is followed.
- Seller ids and company names are cached locally (`sellers.json`).

## Threat modeling

| Threat | Mitigation |
|---|---|
| Malformed or hostile HTML from Tori | Parsed with fixed regexes into plain strings; everything shown later is HTML-escaped (11, 17) |
| A company hides its badge to look private | Not detectable from the list. Huuto: the seller API is checked too. The owner can mark "Not interested" |
| The site blocks the tool for heavy use | 500 ms (Huuto) and 1 s (Tori) between pages, 300 ms / 1 s between detail requests, hourly checks only |
| A hung request stalls the check | 30 s time limit per request (a whole-check time limit is still missing, 02) |
