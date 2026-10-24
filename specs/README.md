# HopeaGold Market Watch: rebuild specifications

These files fully specify HopeaGold Market Watch: a service on the owner's Mac that checks Huuto.net and Tori.fi every hour for gold and silver coins listed **below spot** by **private sellers**, shows them on a local dashboard, and sends phone alerts that say what to do. Give this folder to a builder in a new environment and they can rebuild the system from it alone.

Every spec follows one of the owner's two templates (in the project root):
- `_spec-template.md` for the back end: the service, the check, sources, AI, valuation, alerts and data.
- `TEMPLATE.md` for the dashboard and anything else the owner sees or clicks. It adds UI, API contract, permissions and config sections.

Each spec starts with the same rule: it is the single source of truth, and nothing outside it may be assumed. Where a spec says "verbatim", the exact text is in `appendix/`.

## Build order

| # | Spec | Template | What it covers |
|---|---|---|---|
| 01 | [Environment and setup](01-environment-and-setup.md) | spec | Mac, Node, the AI command-line tool, ntfy, folder, `.env`, commands, port, GitHub |
| 02 | [Service, scheduler and LaunchAgent](02-service-and-scheduler.md) | spec | The always-on process, hourly slots, sleep catch-up, the macOS LaunchAgent, `run.js` |
| 03 | [Check pipeline](03-check-pipeline.md) | spec | One check from spot price to alerts: stages, stats, what is saved, failures |
| 04 | [Sources: spot, Huuto, Tori](04-sources.md) | spec | Spot feed, Huuto API, Tori page parsing, private sellers only |
| 05 | [Gold/silver detection](05-gold-silver-detection.md) | spec | Title rules, metal words, the AI screen and identify calls, code safety checks |
| 06 | [Verified coin specs](06-coin-specs.md) | spec | The coin table, what it covers, how to add a coin |
| 07 | [Valuation and categories](07-valuation-and-categories.md) | spec | Metal value, premium, max and offer prices, BUY / OFFER / AUCTION / CHECK, ranking |
| 08 | [Phone alerts](08-phone-alerts.md) | spec | ntfy, every alert type and text, when each is sent |
| 09 | [Settings and decisions](09-settings-and-decisions.md) | spec | Dashboard settings on top of my-links.js, rules/ and config.js, the owner's Contacted / Bought / Not interested / confirmed weights |
| 10 | [Data files](10-data-files.md) | spec | Every file in `data/`, with its shape |
| 11 | [Dashboard](11-dashboard.md) | TEMPLATE | Layout, header, tabs, live updates, look |
| 12 | [Deals tab](12-deals-tab.md) | TEMPLATE | Category 1 and Category 2 tables, filters, actions |
| 13 | [Check weight tab](13-check-weight-tab.md) | TEMPLATE | AI-estimated finds and the confirm form |
| 14 | [Bought & hidden and Runs tabs](14-history-and-runs-tabs.md) | TEMPLATE | Bought history, hidden listings, Undo, the run log |
| 15 | [Settings tab](15-settings-tab.md) | TEMPLATE | Run hours, prices, your two links, ntfy topic, test and resend |
| 16 | [HTTP API and live events](16-http-api-and-events.md) | TEMPLATE | Every route and every SSE event |
| 17 | [Report files](17-report-files.md) | TEMPLATE | `data/report.html` and `data/latest.txt` |

## Appendices (verbatim, generated from the working system)

| File | Contents |
|---|---|
| [appendix/A-ai-prompts.md](appendix/A-ai-prompts.md) | The AI program call and both AI prompts, word for word |
| [appendix/B-config-and-data.md](appendix/B-config-and-data.md) | `config.js`, `my-links.js`, `rules/coin-specs.js`, `rules/title-rules.js`, `rules/deal-rules.js`, `src/rules.js`, `.env.example`, `package.json` |
| [appendix/C-reference-algorithms.md](appendix/C-reference-algorithms.md) | Reference code for every rule enforced in code, including the exact alert texts |

## Words used in every spec

- **Owner**: the single user. They run Market Watch on their own Mac and decide everything. There are no other roles.
- **Check** (also "run"): one pass of the pipeline in 03: spot price, new listings, AI, valuation, alerts.
- **Run hour / slot**: a scheduled hour (default 9:00–23:00). A slot is one run hour on one day, written `YYYY-MM-DD H:00`.
- **Listing**: one item for sale on Huuto or Tori. Its **key** is `huuto:<id>` or `tori:<id>`.
- **Finding**: a listing identified as gold or silver and kept for up to 7 days (`data/findings.json`).
- **Spot**: today's gold or silver price in euros per gram. **Metal value** = fine grams × spot. It is the **maximum price worth paying**.
- **Premium** ("vs spot"): price ÷ metal value − 1. −20 % means 20 % below spot.
- **Category**: `buy` (BUY NOW), `offer` (OFFER), `auction` (Huuto auction below spot), `check` (would be a deal, but the weight is an AI estimate), or none.
- **Decision**: the owner's choice on a listing: Contacted, Bought, Not interested, or a confirmed weight (`data/decisions.json`).

## Design rules

- Only Huuto.net and Tori.fi, and only listings by **private people**. Catawiki and every other company are excluded and never counted as finds.
- The goal is **below spot**. Spot (the metal value) is the maximum price.
- Category 1 = buy now or make an offer (Huuto buy-now and Tori). Category 2 = Huuto auctions with time remaining.
- Rank by how far below spot, and show the euros saved.
- Check every hour during the day (9–23), with phone alerts that say what to do.
- Its own folder, service, dashboard (port 3002) and ntfy topic. Nothing is shared with other apps.
- The AI only identifies coins. Code sets every price, value and verdict.
- The Tori link is any Tori search address pasted in Settings. Huuto is three links, each one category (1166, 1165, 260), with the metals wanted from each (gold and silver; silver only for 260). Huuto's API cannot filter any other way. Only those places are watched. Auctions count only inside those links.
- Links in `my-links.js`, editable rules in `rules/` (coin specs, title rules, deal rules), `npm run try-links` to test links without saving or alerting (03).
- The same code runs on a Raspberry Pi 5 as a systemd service (`deploy/raspberry-pi.md`).

## Keeping these specs current

`README.md` is the public guide. When the system changes:

1. Update `README.md` (and `rules/README.md` for rule changes) and the matching spec here.
2. Regenerate the appendices from the source:
   ```sh
   node specs/tools/build-appendix.js
   ```
3. Commit and push to GitHub (`ammar93b/hopeagold-market-watch`). Do this after every change.
