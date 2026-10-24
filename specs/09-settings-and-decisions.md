# Spec: Settings and decisions

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

The back end for the owner's two kinds of input: settings changed in the dashboard (saved on top of `config.js` and applied live), and decisions on listings (Contacted, Bought, Not interested, confirmed weights), kept apart from the findings so a running check can never overwrite them.

## Overview

`src/settings.js` and `src/decisions.js`. Both save to `data/` (10). The Settings tab (15), Deals tab (12), Check weight tab (13) and history (14) call them through the API (16). Reference code: appendix C.

**Settings**

The defaults come from `config.js`, which reads the links from `my-links.js` and the deal rules from `rules/deal-rules.js` (appendix B). `data/settings.json` holds only what the owner changed. The effective settings = defaults overlaid with the saved file. They are applied onto the shared config object when the module loads and after every save, so a change takes effect in the running service immediately, with no restart.

| Setting | Default | Valid | Applied to |
|---|---|---|---|
| `runHours` | 9, 10, … 23 | at least one; each 0–23; duplicates removed; sorted | `CFG.runHours` (02) |
| `offerMaxPremium` | 0.20 | 0 to 1 | `CFG.deals.offerMaxPremium` (07) |
| `offerDiscount` | 0.10 | 0 to 0.5 | `CFG.deals.offerDiscount` (07) |
| `suspicious` | −0.5 | a negative fraction; its size 0.1 to 0.95 | `CFG.deals.suspicious` (07) |
| `toriUrl` | the Tori search address in `my-links.js` | a Tori search address: https, host `tori.fi`, path `/recommerce/forsale/search…`, no `sort=`, any `page=` removed; otherwise the message names what to fix | `CFG.tori.searchUrl` (04) |
| `huutoLinks` | the Huuto links in `my-links.js` (up to three) | up to three Huuto search addresses (`https://www.huuto.net/haku?category=<N>…`), each with its metals (gold, silver, or both). An empty row is ignored. Stored as `{url, category, metals}`. | `CFG.huuto.links` (04) |
| `ntfyTopic` | '' (use `.env`) | empty, or 6–64 of `A–Z a–z 0–9 _ -` (trimmed) | `CFG.ntfyTopic` (08) |
| `dailySummary` | true | boolean | `CFG.dailySummary` (03); anything but `false` counts as on |

`update(input)` takes any subset of these. Fields not given keep their value. It validates everything, then saves and applies. The first invalid field throws, and nothing is saved:

| Problem | Message |
|---|---|
| a number out of range or not a number | `<Name> must be between <min> and <max>` (names: `Run hour`, `Offer range`, `Offer discount`, `Unusually cheap limit`) |
| no run hours | `Pick at least one run hour` |
| no Huuto link, not a Huuto search, no category, no metal, more than three | `Paste at least one Huuto link.` / `Huuto link must be a Huuto search address (…)` / `Huuto link needs a category, for example ?category=1166.` / `Huuto link: choose gold, silver, or both.` / `At most three Huuto links.` |
| bad topic | `ntfy topic: 6–64 letters, numbers, - or _` |
| Tori link empty | `Paste your Tori link (the address of a Tori search).` |
| Tori link not a Tori search | `Tori link must be a Tori search address (…/recommerce/forsale/search…).` |
| Tori link with `sort=` | `Remove "sort=" from the Tori link: Tori does not allow it.` |

Config-only values (change the file, then `npm run service:restart`): in `config.js` `lookbackHours` 24, `keepDays` 7; in `rules/deal-rules.js` `auctionAlertMarginHours` 1; in `config.js` `failureAlertEveryHours` 12, `ai` (time limit 10 min, screen batch 150, identify batch 30), Huuto API URL and `maxPages` 10, Tori search URL and `maxPages` 8.

`run.js` is a separate process. It loads the saved settings when it starts.

**Decisions** (`data/decisions.json`: listing key → decision)

| Field | Meaning |
|---|---|
| `status` | `contacted`, `bought` or `dismissed` (Not interested). Missing = none. |
| `at` | when the status (or confirmation) was set |
| `confirm` | `{ grossG, fineness, qty, at }`: the owner's reading of the listing |
| `snapshot` | `{ name, url, platform, saleType, price, meltEur, metal }` of the finding when the decision was made |

- `setStatus(key, status, finding)`:
  - `reset` removes the status.
  - Any other status sets `status`, `at` and a fresh snapshot (or keeps the old snapshot when there is no finding).
  - An entry with no status and no confirmation is deleted.
  - Returns the entry or null.
- `confirmWeight(key, { grossG, fineness, qty }, finding)`:
  - `fineness` above 1 is thousandths (925 → 0.925). `qty` is rounded, at least 1 (empty → 1).
  - Weight must be > 0 and < 100 000, else `Weight must be grams, e.g. 24 or 24.2`.
  - Fineness must be > 0 and ≤ 1, else `Fineness must be like 925, 0.925 or 500`.
  - Saves `confirm` and a snapshot.
- `apply(findings)`: sets each finding's `userStatus` from its decision (or null). With a confirmation, it replaces the content: the confirmed numbers, `fineG` = grossG × fineness × qty, `estimate` false, `specLabel` "weight confirmed by you", `priceBasis` total. Then valuation (07) puts it in a real category.

**Why apart from the findings:** the check rewrites `findings.json` at its end (03). Decisions in their own file, re-read just before the final valuation, can't be lost to a check that was already running when the owner clicked.

**Why the snapshot:** findings are dropped after 7 days, but the Bought history is kept forever. History rows come from the snapshot (14).

## Acceptance criteria

- [ ] Saving run hours [23, 9, 9, 12] stores [9, 12, 23], and the next `tick()` uses them without a restart.
- [ ] `offerDiscount` 0.6 is refused with "Offer discount must be between 0 and 0.5", and nothing changes.
- [ ] Saving the three Huuto links keeps their order, categories 1166, 1165, 260 and metals; a fourth link is refused.
- [ ] Topic "abc" is refused; "" falls back to `.env`; "my-market-alerts-7f3k2" is accepted.
- [ ] Marking Bought, then Undo (reset) removes the entry entirely when there is no confirmation.
- [ ] Confirming 24 / 900 / 1 on a find stores fineness 0.9, and the find's next valuation uses 21.6 g fine, not an estimate.
- [ ] Confirming weight "abc" is refused with the weight message.
- [ ] A Bought listing still shows in the history 30 days later.

## Out of scope

- Editing `config.js` from the dashboard.
- Several setting profiles or users.
- Notes or tags on decisions beyond the three statuses.

## Edge cases

- **`data/settings.json` is missing or broken:** the defaults are used (a broken file is read as empty).
- **A setting saved while a check runs:** applied immediately; the running check may use either value for the rest of its run.
- **The owner sets a status on a listing that is no longer in the findings:** the API refuses everything except `reset` (16). `reset` works from the history for old entries.
- **Confirm, then later Not interested:** both are kept in the same entry. Undo keeps the confirmation.
- **The same listing marked Contacted, then Bought:** the status is replaced; `at` updates.

## Security impact

- Input comes only from the local dashboard. Every POST must come from the dashboard's own origin (16).
- Values are validated and typed before saving. The topic is limited to safe characters.
- `decisions.json` holds the owner's buying history (names, prices, links). It stays in `data/`, never in git.

## Threat modeling

| Threat | Mitigation |
|---|---|
| A web page in the owner's browser posts settings to localhost (e.g. its own ntfy topic) | Origin check: POSTs from any other origin get 403 (16) |
| A malformed value breaks the scheduler (e.g. no run hours) | Validation refuses it before saving |
| A running check overwrites a click | Decisions live in their own file and are re-read before the final valuation |
| A crash mid-save corrupts settings or decisions | Write to `.tmp`, then rename (10) |
