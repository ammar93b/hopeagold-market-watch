# Spec: Check pipeline

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

One check: get today's spot price, collect new listings from private sellers, find the gold and silver ones, value every find, re-check earlier finds, send the right phone alerts and save everything.

## Overview

`runOnce({ push, reason, progress })` in `src/watch.js` is the only place a check happens, whether started by the scheduler, the dashboard or `run.js` (02). Code does all the valuing and deciding; the AI only identifies coins (05). Reference code: appendix C, "src/watch.js · runOnce".

**Sources.** The links (defaults in `my-links.js`, changed in Settings, 09): **Tori** (any Tori search address pasted in Settings) and **Huuto** (the three Huuto links, each one category, with the metals it asks for; buy-now and auction listings both). Auctions are only checked inside the Huuto link; there is no separate Huuto auction search.

**Changes from the full review (17 Oct 2026)**
- **Time limit:** a check is stopped as failed after `runTimeLimitMin` (90 min). The abandoned work saves and sends nothing.
- **Sources fail on their own:** Huuto and Tori are read with `Promise.allSettled`. If one fails, the check goes on with the other and the run summary says "⚠ Huuto not read: …" or "⚠ Tori not read: …" (`stats.warnings`). Only both failing fails the check.
- **Stated in the listing means weight AND fineness:** without a coin-table id, an AI answer with `estimate: false` stays not estimated only when both its weight and its fineness (e.g. "925", "0,830", "999,9") are written in the title or description.
- **Open auctions are kept until they close**, even after `keepDays`, so long auctions still get their ⏰ alert.
- **A relisted item keeps its alert flags**, so it is not alerted again.
- **Every open find is re-checked** (buy-now every 3 h, auctions every check), not only those with a category, so a price drop turns into a deal. Bought and Not interested finds are skipped.
- **Tori listings already sold at first read** (`disposed`) are dropped before identify; the listing page's own price replaces the card price.
- **A check stopped by the time limit** logs nothing more, ends its AI program, and saves any alert marks it sends after the stop.
- **Alert groups are sent one by one:** if BUY alerts fail, offers and auctions are still sent. The failed group is marked unsent and retried next check; the check then reports "Some phone alerts failed".
- **End of check:** each save is guarded, so the check always ends and frees the lock.

**Stages.** Each stage logs a line. The dashboard shows it as the live status (11), with any trailing "…" removed.

| # | Stage (log text) | What happens |
|---|---|---|
| 0 | — | Take the run lock (10). If another check holds it, log `Another run is still going — skipping.` and return `null`. Set the running state `{ since, reason, stage: 'Starting' }`. |
| 1 | `Spot price…` | `getSpot()` (04). Save it to `spot.json`. If it fails, the check fails: never value with an old price. |
| 2 | `Collecting listings…` | Huuto and Tori **in parallel**, listings from the last `lookbackHours` (24) only (04). Tori companies and wanted ads are already dropped and counted. |
| 3 | `<N> new listings (Huuto <h>, Tori <t> in the last 24 h).` | `fresh` = listings whose key is not in `seen.json`. |
| 4 | `AI: screening <u> titles (<s> already matched by rules/keywords)…` | For each fresh listing, the title rules (05). `sure` = a rule match or a metal word. `unsure` = the rest, sent to the AI screen. Candidates = sure + screened. Skipped when nothing is fresh. |
| 5 | (no line) | **Private people only:** each Huuto candidate's seller is looked up (04, cached 30 days in `sellers.json`). Companies are dropped and counted. A failed seller lookup counts as a private person. |
| 6 | `Reading <n> descriptions…` | One at a time: Huuto details (description, shipping, quantity, offers allowed, condition; 300 ms pause) or the Tori item page (description; 1 s pause). A failure leaves an empty description and records `detailError`; the check goes on. |
| 7 | `AI: identifying metal content…` | AI identify (05), then the code checks for each candidate (below). Each that passes becomes a new finding. |
| 8 | `Re-checking earlier finds…` | Merge with earlier finds, refresh the ones that matter, value everything at today's spot (below). |
| 9 | summary line | Choose and send alerts, update `seen.json`, write the summary. |

**Step 7: from AI answer to finding** (per candidate, in order)
1. `r` = the AI's answer for this key.
2. If `r` is missing or its metal is not gold/silver, **and** exactly one title rule matched: keep it anyway, as an estimate. `r` becomes metal and `specId` from that rule's coin spec, `qty` 1, `estimate` true, `priceBasis` the AI's or `total`, `name` the AI's or the title, `note` `Rule says <spec label>; AI doubted it` plus `: <AI note>` when there is one.
3. Still not gold/silver: drop it.
4. No `specId` and `estimate` false: the weight must literally appear in the title or description (`weightStated`, 05). If it doesn't, set `estimate` true.
5. `metalContent(r)` (07). Null (no usable weight or fineness): drop it.
6. Build the finding: `key, platform, id, url, title, name` (AI's or title)`, note` (AI's or ''), `saleType, price, buyNowPrice, bidders, closingTime, deliveryPrice, offersAllowed, location, seller, listedAt, foundAt` (this check's start)`, status: 'open', metal, priceBasis` (AI's or `total`)`, content, notified: {}`.

**Step 8: merge, refresh, value**
- `earlier` = stored findings listed within `keepDays` (7, by `listedAt`) and not re-found in this check. Older ones are dropped for good.
- Apply decisions (09), value at today's spot (07), then `refresh(earlier)`:
  - Skip closed ones. An auction whose `closingTime` has passed becomes `closed` without a request.
  - Only findings with a category, or open auctions, are refreshed.
  - Auctions are refreshed every check. Everything else at most every 3 hours (`checkedAt`).
  - Huuto: details API (04). Status, and when open: price, bidders, closing time, offers allowed. 300 ms pause.
  - Tori: the item page. 404/410 or `disposed` means closed; when open, the current price is updated. 1 s pause.
  - A failed refresh changes nothing.
- Then **re-read the decisions** (the owner may have clicked during the check), apply them to new + earlier finds, and value all of them. This list is the new `findings`.

**Step 9: alerts and bookkeeping**
- `pushUntil` = the next run time (02) + `auctionAlertMarginHours` (1 h).
- **Category 1 to send:** findings in `buy` or `offer` that were never sent for that category (`notified.buy` / `notified.offer`) and have no owner status. BUY first, then OFFER, each most below spot first.
- **Auctions to send:** findings in `auction`, not yet sent as closing (`notified.closing`), status not "contacted", closing after now and at or before `pushUntil`. Most below spot first. So each auction alert goes out once, on the last check before it closes.
- Mark every fresh listing as seen at this check's time, and remove seen entries older than `lookbackHours + 48` hours. Save `seen.json`. **This only happens when the check got this far**, so a failed check retries the same listings.
- If `push`: send BUY alerts and set `notified.buy`, OFFER summary and set `notified.offer`, auction alerts and set `notified.closing` (08). Each flag is the check's time, set only after that batch was sent.
- **Morning summary:** if `push`, the morning summary setting is on, the reason starts with `scheduled`, and `state.lastMorning` is not today (`Date.toDateString()`): send the ☀️ summary (08) and save today as `lastMorning`, even when there was nothing to send. Manual checks never send it.
- Stats `pushedBuyOffer` and `pushedAuctions`: how many were chosen (0 without `push`).
- Summary: `<new> new · <found> gold/silver from people · now open: <b> buy now, <o> to offer, <a> auctions below spot, <c> to check`, plus ` · pushed <n>` when something was sent.

**When a check fails** (any error thrown in stages 1–9)
- `run.error` = the message. Log `FAILED: <message>`.
- If `push` and the last failure alert was more than `failureAlertEveryHours` (12 h) ago: send "⚠ Market Watch failed" (08) and save `state.lastFailurePush`. A failed alert send is ignored.

**Always, at the end** (success or failure)
- `durationSec` = whole seconds since the start.
- Save `findings.json`. After a failure before step 8 this is the list as it was loaded.
- Put the run first in `runs.json` and keep the newest 100.
- If a spot price exists, rewrite `report.html` and `latest.txt` (17) with the next run time.
- Remove the lock, clear the running state, report progress `null`.

**Run record:** `{ at, reason, stats, summary | error, durationSec }`. `stats` (10) fills as the check goes: `huuto, tori, catawiki, toriBusiness, wanted, toriBusinessNames, newListings, screened, huutoBusiness, found, morningSummary, pushedBuyOffer, pushedAuctions`.

## Acceptance criteria

- [ ] A listing seen in one successful check is never sent to the AI again (while it is in `seen.json`).
- [ ] If the AI fails in stage 4 or 7, the next check processes the same new listings again.
- [ ] A Huuto listing from a company seller never becomes a finding, and `stats.huutoBusiness` counts it.
- [ ] A title-rule match the AI called "none" appears as a `check` finding with the "AI doubted it" note.
- [ ] An AI answer "estimate: false, 23 g" for a listing whose text has no "23 g" is stored with `estimate: true`.
- [ ] A BUY NOW finding is alerted once. The next check does not alert it again, even if its price changes.
- [ ] With hourly checks, an auction below spot closing at 18:30 is alerted by the 17:00 check (next run 18:00 + 1 h margin), not by the 16:00 check, and only once.
- [ ] Marking a listing Bought during a check: the check's saved findings show it as bought, and no alert goes out for it.
- [ ] The morning summary goes out at most once a day, only from a scheduled check.
- [ ] A failing check keeps the previous findings, adds a run with `error`, and sends at most one failure alert per 12 hours.
- [ ] `runs.json` never holds more than 100 runs.

## Out of scope

- Valuation formulas and categories (07), alert texts (08), parsing (04), AI prompts (05).
- Re-checking finds older than `keepDays`.
- Alerting a BUY NOW again when its price drops further.

## Edge cases

- **Nothing new:** stages 4–7 are skipped. Earlier finds are still refreshed, re-valued and alerted if they newly qualify (e.g. spot rose and an OFFER became a BUY NOW).
- **A finding moves from OFFER to BUY:** `notified.buy` is not set yet, so it is alerted as BUY NOW.
- **The same listing is found again** (dropped from `seen.json`, then seen again): the new finding replaces the old one, and its `notified` flags start empty.
- **ntfy fails while sending:** the check fails after `seen.json` was saved. Batches already sent are marked. The failed batch is not marked and is sent again by the next check.
- **The owner marks "Contacted" on an auction:** it gets no ⏰ BID alert.
- **Spot fails:** the check fails at stage 1; nothing else changes, and the old `spot.json` stays.
- **A check that hangs** is stopped after 90 minutes (02).
- **AI time-outs on large batches (seen 13 Oct 2026):** after a day away, 300+ titles to screen. Calls of 150 titles hit the 10-minute AI time limit, and each failed check retried them all. Every check that day failed.

## Security impact

- The check reads public listing data and writes only inside `data/`.
- Listing text (titles, descriptions) goes into AI prompts. The AI has no tools (05), so the worst a malicious listing can do is mislead the identification. Code-side checks limit that (step 7, 07).
- Alerts go to the owner's ntfy topic only.

## Threat modeling

| Threat | Mitigation |
|---|---|
| A listing's text tells the AI to report a high-value coin | Weight claims must appear in the listing text or come from the verified table; otherwise the finding is an estimate and only shown under Check weight, never alerted |
| A crash mid-write leaves a half-written file | Every JSON file is written to `.tmp` and renamed (10) |
| Two checks at once double-send alerts | Run lock + in-process running flag |
| A failure goes unnoticed | Failure alert (max every 12 h), error banner on the dashboard, Runs tab. A hang is stopped after 90 minutes |

## Try your links (`try-links.js`)

`npm run try-links` runs the same steps once for anyone testing their own links, and prints the result in the terminal. It never writes `data/` (no seen, findings, sellers, settings or spot) and never sends alerts, so it is safe to run while the service is running.

- Links come from `my-links.js` (not the dashboard's saved settings), or from `--tori <url>` / `--huuto <url> --metals gold,silver`; `--only tori|huuto`; `--hours N` (default `lookbackHours`). Links pass the same checks as Settings (09) before anything is fetched.
- Deal rules come from `rules/deal-rules.js`.
- Steps: spot → read links (private sellers only, as 04) → title rules and metal words, then the AI screen for the rest → Huuto company sellers dropped (cache kept in memory only) → descriptions → AI identify → the same code checks as step 7 above (spec ids only from the table, stated weight AND fineness) → value (07).
- `--no-ai`: no AI calls. Only titles matching exactly one title rule are valued, as one coin each, with price basis `unclear` (so a below-spot one shows under Check weight); others are counted as "not valued".
- Output: BUY NOW, OFFER, auctions below spot, check weight first (each ranked as in 07, with link), and a count of finds above spot.
- [ ] After `npm run try-links`, every file in `data/` is byte-for-byte unchanged.
- [ ] A Tori link with `sort=` stops with "Remove "sort=" from the Tori link…" before any request.
- [ ] Without `AI_COMMAND` it stops with a message pointing to `--no-ai`.
