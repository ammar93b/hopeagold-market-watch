# Spec: Phone alerts

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

Phone notifications through ntfy that tell the owner exactly what to do: buy now, make an offer, or bid before an auction closes, with the price limit and a button that opens the listing.

## Overview

The owner acts from the phone, so every alert carries an **ACT** line with the action and the euro limit, and an "Open on Huuto/Tori" button. Which finds are sent and when is decided by the check (03). This spec covers the delivery and the texts. Exact code and texts: appendix C, "src/alerts.js" and "src/notify.js".

**Delivery** (`push({ title, message, priority, click, actions, tags })`)
- Topic = the dashboard setting if not empty, else `NTFY_TOPIC` from `.env` (01, 09). No topic: nothing is sent, and the result is `{ skipped: 'no ntfy topic (dashboard Settings or NTFY_TOPIC in .env)' }`.
- `POST https://ntfy.sh/` (the **root** URL) with JSON `{ topic, title, message, priority, click?, actions?, tags? }`. Posting JSON to `/<topic>` would deliver the raw JSON as text.
- `priority` must be a **number** (a word gives HTTP 400): min 1, low 2, default 3, high 4, urgent 5.
- `actions`: at most 3, each `{ action: 'view', label, url }`.
- Time limit 15 s. A non-OK answer throws `ntfy answered <status>: <first 200 chars of the body>`.
- 400 ms pause after every alert, to stay well inside ntfy's rate limit.

**Number and time formats** (Finnish style)
- Euros: `fi-FI` digits, 2 decimals under 100 €, none from 100 €, then " €" (e.g. `13,00 €`, `1 250 €`).
- Percent: a "+" sign when positive, 1 decimal when under 10 % either way, else none, then " %" (e.g. `−35 %`, `+4,5 %`).
- `hhmm` = `16.15`; `dayTime` = `la 24.10. klo 16.15` style (weekday, day, month, hour, minute, `fi-FI`); time left = `2 d 3 h`, `3 h 12 min`, `45 min` or `closed`.
- Metal line: `[<qty> × ]<grams> g × <fineness in thousandths> = <fine grams> g gold|silver` (up to 2 decimals).

**The ACT line** (`act(f)`)

| Category | Platform | Text |
|---|---|---|
| buy | Huuto | `ACT: buy it on Huuto now (Osta heti) for <price>[ + shipping <x>].` |
| buy | Tori | `ACT: message the seller on Tori and buy for <price> — never more than <max>.` |
| offer | any | `ACT: offer <offer price> (max <max>) — asking <price or "no price"> on <Huuto/Tori>.` |
| auction | Huuto | `ACT: bid up to <max> on Huuto before <dayTime of closing>.` |

**Alert types**

| Alert | When (03) | Title | Message | Priority | Tap / buttons |
|---|---|---|---|---|---|
| 🟢 BUY NOW | each new `buy` find; the **top 5** each get their own alert | `🟢 BUY NOW <pct> · save <saved> · <name>` | ACT line; `<price> vs metal value <melt> (<metal line>).`; if suspicious `⚠ Unusually cheap: check the photos, that it is genuine, and that the price is not per piece.`; the AI note if any | high (4) | listing; "Open on Huuto/Tori" |
| 🟢 more | when there are more than 5 | `🟢 <n> more below spot` | up to 8 lines `<#>. <pct> · save <saved> · <name> · <price> · <site>` numbered from 6, then `+<n> more on the dashboard` if needed | high (4) | first listing; up to 3 buttons `<#>. <name>` (40 chars) |
| 💬 OFFER | all new `offer` finds, **one summary** | `💬 <n> to make an offer on` | up to 8 lines `<#>. <name>: offer <offer> (max <max>) · asking <price or "no price"> · <site>`, `+<n> more on the dashboard`, then `Never offer above the max — that is the metal value.` | default (3) | first listing; up to 3 buttons |
| ⏰ BID | each auction below spot closing before the next check + 1 h, **once** | `⏰ BID before <hhmm> · <name>` | ACT line; `Closes <dayTime> — <time left> left.`; `Now <price> with <n> bids (<pct> vs spot). Metal value <melt>[ + shipping <x>].` | high (4) | listing; "Open on Huuto" |
| ☀️ Morning | first scheduled check of the day, if on in Settings and anything is open | `☀️ Today: <b> to buy · <o> offers · <a> auctions below spot` | `Buying all <b> saves <sum> vs spot.` (if any to buy); the top 4 (BUY, then auctions, then offers, each most below spot first) as `<#>. <name> — <ACT text without "ACT: ">`; `Checks every hour <first>:00–<last>:00. Full list: dashboard on your Mac (localhost:3002).` | default (3) | first of the top 4; up to 3 buttons |
| ⚠ Failed | a check failed, at most every 12 h | `⚠ Market Watch failed` | `<error>` + `\nIt retries at the next run. Help: README → Something wrong?` | low (2) | — |
| 🪙 Test (dashboard) | Settings → Send test alert | `🪙 Market Watch test` | `Phone alerts work. Deals will arrive on this topic.` | default | `http://localhost:<PORT>` |
| 🪙 Test (Terminal) | `npm run test-push` | `🪙 Market Watch test` | `If you can read this, phone alerts work.` | default | `https://www.huuto.net` |

The morning summary only counts finds with no owner status. It returns "nothing sent" when nothing is open, and the day still counts as done (03).

**Send open deals to my phone** (Settings, 15): sends everything currently open without an owner status, most below spot first: BUY NOW alerts (top 5 + "more"), the OFFER summary, then one auction summary:
- Title `⏰ <n> Huuto auctions below spot`.
- Up to 8 lines `<#>. <name>: bid max <max> · now <price> (<pct>) · <time left> left`, soonest closing first, then `+<n> more on the dashboard` if needed.
- Then `You get a ⏰ BID alert again on the last check before each one closes.`
- Default priority; up to 3 buttons.

Resending does not set the `notified` flags, so the ⏰ BID alert still comes later.

**Never sent:** `check` finds, finds marked Bought or Not interested, BUY/OFFER finds marked Contacted, and anything already sent for the same category.

## Acceptance criteria

- [ ] 7 new BUY NOW finds → 5 single alerts + one "🟢 2 more below spot", in that order, most below spot first.
- [ ] 3 new OFFER finds → exactly one 💬 alert, ending with "Never offer above the max — that is the metal value."
- [ ] Every single-deal alert has a tap target and an "Open on …" button for the listing.
- [ ] The ntfy request goes to `https://ntfy.sh/` with a numeric priority. A topic with 5 characters is rejected by Settings (09).
- [ ] With no topic set, the dashboard's test button shows "no ntfy topic (dashboard Settings or NTFY_TOPIC in .env)".
- [ ] A Huuto BUY NOW with shipping 3 € reads "ACT: buy it on Huuto now (Osta heti) for 12,00 € + shipping 3,00 €."
- [ ] A suspicious BUY NOW includes the "⚠ Unusually cheap" line.
- [ ] Two failing checks 1 hour apart send one failure alert, not two.
- [ ] Alerts are at least 400 ms apart.

## Out of scope

- Other channels (email, SMS, Telegram, push without ntfy).
- Self-hosted ntfy servers.
- Alerts in Finnish (the alert texts are English, numbers and dates Finnish style).
- Acting on the owner's behalf (buying, bidding, messaging sellers).

## Edge cases

- **Too many offers:** only the first 8 are listed, with `+N more on the dashboard`.
- **Button labels:** cut at 40 characters.
- **ntfy is down or answers an error:** the check fails after the seen list was saved; the unsent batch is retried next check (03). The failure alert itself may fail; that is ignored.
- **Topic changed in Settings:** the next alert uses it. Alerts already sent to the old topic stay there.
- **Subscribed on a new phone after alerts went out:** Settings → "Send open deals to my phone".
- **An auction closes between the check and the alert:** the alert still goes out, with "closed" as time left.

## Security impact

- Alerts go over HTTPS to the public ntfy.sh server. Anyone who knows the topic can read them (01). They contain listing names, prices and links, nothing about the owner.
- No ntfy account or token is used.

## Threat modeling

| Threat | Mitigation |
|---|---|
| A stranger guesses the topic and reads the alerts | Random topic name; settings check 6–64 characters of letters, digits, `-`, `_` |
| A stranger posts fake deals to the topic | Possible on public ntfy. Every alert links to the real listing, and the dashboard (local) shows the real finds |
| Alert flood if many deals appear at once | At most 5 single BUY alerts per check; offers and the rest are summaries |
| A listing title with odd characters breaks the alert | JSON body; ntfy shows plain text |
