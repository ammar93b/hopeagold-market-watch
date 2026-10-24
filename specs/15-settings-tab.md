# Spec: Settings tab

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

A form where the owner changes the run hours, price thresholds, the Huuto links, phone topic and morning summary, and can send a test alert or re-send all open deals to the phone.

## Overview

Settings apply live to the running service, with no restart (09). Everything else is config-only (09).

## Backend dependency

- Back-end specs it relies on: 09 (settings validation and storage), 08 (test alert, resend), 16 (`POST /api/settings`, `/api/test-push`, `/api/resend`).
- Backend ticket / MR: none (single-owner project).

## Interface

### UI

One form, at most 760 px wide, in fieldsets:

**Run hours (local time)**: 24 checkboxes `00`–`23` in a 12-column grid; checked = a run hour.

**Prices**: shown as whole percent; sent as fractions.

| Label | Input | Sent as |
|---|---|---|
| `Suggest an OFFER when the asking price is at most [ ] % over metal value` | 0–100, step 1 | `offerMaxPremium` = value ÷ 100 |
| `Suggested offer = metal value minus [ ] %` | 0–50, step 1 | `offerDiscount` = value ÷ 100 |
| `Mark "unusually cheap — check" when more than [ ] % under spot` | 10–95, step 5 | `suspicious` = −value ÷ 100 |

**Your two links** (first fieldset, with the steps written on the page):
- `Tori link [ ]`: a text box with the current Tori search address. Saved as `toriUrl` (09). Rejected with its message if it is not a Tori search or has `sort=`.
- Huuto: three rows, `Huuto link 1…3 [ ]` (a Huuto search address) with `Metals [gold and silver | silver only | gold only]`. Saved as `huutoLinks` (09).

**Phone alerts (ntfy)**
- `Topic [ ]`: the saved topic. When the topic comes from `.env`, it shows as the placeholder.
- Under it: `In use: <topic or "none">[ (from .env)]. Subscribe to exactly this topic in the ntfy iPhone app. Leave empty to use .env.`
- Checkbox `☀️ Morning summary on the first check of the day`.
- Note: `Always sent: 🟢 BUY NOW (one alert per deal), 💬 offers (one summary), ⏰ auctions on the last check before they close.`
- Buttons (they don't save the form):
  - `Send test alert` → `POST /api/test-push`. Shows "Sending…", then `Sent — check your phone.` (green) or the error (red).
  - `Send open deals to my phone` → `POST /api/resend`. Shows "Sending…", then `Sent: <b> buy now, <o> offers, <a> auctions.` (green) or the error (red), e.g. `Nothing open to send.`

**Save settings** (gold button): sends all fields to `POST /api/settings`. Shows `Saved.` (green) and reloads the state, or the validation message (red, 09). The form is not re-rendered while it has focus (11), so live updates never wipe typing.

### API contract

- `POST /api/settings` `{ runHours: number[], huutoLinks: [{url, metals}], offerMaxPremium, offerDiscount, suspicious, ntfyTopic, dailySummary }` → `{ settings }`; 400 `{ error }` with the messages in 09.
- `POST /api/test-push` → `{ sent: true }`; 400 `{ error: 'no ntfy topic (dashboard Settings or NTFY_TOPIC in .env)' }` or the ntfy error.
- `POST /api/resend` → `{ sent: { buy, offer, auction } }`; 400 `Nothing open to send.`
- `GET /api/state` → `settings`, `huutoCategoryNames` (id → name), `ntfy: { topic, fromEnv }`.

### Permissions

| UI element | Access right | Without the right |
|---|---|---|
| The whole form and buttons | the owner | — (no accounts) |

### Config

The form edits the settings in 09. Values not in the form need a `config.js` change and `npm run service:restart`.

## Acceptance criteria

- [ ] Unchecking 9 and 23 and saving: the Runs lead and next-check time show the new hours; no check runs at 9:00 the next day.
- [ ] Saving offer range 30: a +25 % Tori find becomes an OFFER on the next state load.
- [ ] Unchecking every run hour and saving shows "Pick at least one run hour" in red, and nothing changes.
- [ ] A Tori link `…/recommerce/forsale/search?q=hopea&sort=price` is refused with "Remove \"sort=\"…" and the old link stays.
- [ ] Topic "abc" shows "ntfy topic: 6–64 letters, numbers, - or _".
- [ ] With an empty topic field and `NTFY_TOPIC` in `.env`, the line reads "In use: <topic> (from .env)".
- [ ] `Send test alert` with a working topic shows "Sent — check your phone." and the phone gets "🪙 Market Watch test".
- [ ] `Send open deals to my phone` with nothing open shows "Nothing open to send." in red.
- [ ] A check finishing while the owner types in the form doesn't reset their input.

## Out of scope

- Editing config-only values (09).
- Choosing the AI model.
- Several topics or per-alert-type topics.

## Edge cases

- **Unsaved changes, then focus leaves the form:** they are lost at the next live update, which re-renders the form from the saved settings. Nothing is saved automatically.
- **Saving with a topic and the morning summary off:** both apply to the next check.
- **A value outside the input's range typed by hand** (e.g. 200 %): the browser may allow it; the server refuses it with the range message.
- **Resend while a check is running:** allowed; uses the last saved findings.

## Security impact

- Changes the alert topic, which decides who receives the alerts. Only accepted from the dashboard's own origin (16).
- The topic is shown on screen (local only).

## Threat modeling

| Threat | Mitigation |
|---|---|
| Another website in the browser silently changes the topic to its own and receives the owner's deals | Origin check on every POST (16); topic format validated |
| Settings that break the scheduler | Server-side validation (09) |
| Resend spams the phone | Same limits as normal alerts: 5 single BUY alerts, the rest summarised (08) |
