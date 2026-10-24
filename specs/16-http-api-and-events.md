# Spec: HTTP API and live events

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

The local HTTP interface of the service: the dashboard's static files, a JSON API for state and actions, and a Server-Sent Events stream for live status.

## Overview

`server.js` serves everything on `127.0.0.1:<PORT>` (default 3002) with Node's `http` module, no framework. The dashboard (11–15) is the only client. Reference code: appendix C, "server.js".

## Backend dependency

- Back-end specs it relies on: 02 (process, scheduler, `startRun`), 03, 07, 08, 09, 10.
- Backend ticket / MR: none (single-owner project).

## Interface

### UI

None of its own. It serves `public/` (11).

### API contract

**General rules**
- Every response has `Cache-Control: no-store`. JSON responses are `application/json; charset=utf-8`.
- POST bodies are JSON. A body over 100 000 characters is refused (400 `Request too large`) and the connection closed. Unparseable JSON → 400 `{ "error": "Bad JSON" }`. An empty body counts as `{}`.
- **Origin check:** any non-GET route whose request has an `Origin` header other than `http://localhost:<PORT>` or `http://127.0.0.1:<PORT>` → 403 `{ "error": "Forbidden" }`. Requests without `Origin` (curl, the same page in some browsers) are allowed.
- A route that throws → 400 `{ "error": "<message>" }`.
- After every successful POST **except** `/api/test-push` and `/api/resend`, the SSE event `update` is broadcast with `{}`.
- No CORS headers are sent, so other websites cannot read any response.

**Routes**

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `GET /api/state` | — | the state object (below) | — |
| `POST /api/run` | — | `{ started: true }`; starts a manual check (02) | 409 `A check is already running.` (also while a Terminal check holds the lock) |
| `POST /api/action` | `{ key, action }`, action `contacted` \| `bought` \| `dismissed` \| `reset` | `{ decision }` (09; null after a reset that removed it) | 400 `Unknown action`; 404 `Listing not found` (not for `reset`) |
| `POST /api/confirm` | `{ key, grossG, fineness, qty }` | `{ decision }` | 404 `Listing not found`; 400 validation message (09) |
| `POST /api/settings` | any subset of the settings (09) | `{ settings }` (the full saved settings) | 400 validation message (09) |
| `POST /api/resend` | — | `{ sent: { buy, offer, auction } }` (08) | 400 `Nothing open to send.`; 400 ntfy error |
| `POST /api/test-push` | — | `{ sent: true }` | 400 `no ntfy topic (dashboard Settings or NTFY_TOPIC in .env)`; 400 ntfy error |
| `GET /api/events` | — | SSE stream (below) | — |
| `GET /<file>` | — | a file from `public/`; `/` = `index.html` | 404 `Not found` (text) |

`/api/action` saves a snapshot of the finding as valued at the current spot (09).

**State object** (`GET /api/state`), built fresh on every call:

| Field | Content |
|---|---|
| `now` | server time |
| `spot` | `spot.json` or null |
| `findings` | all findings with the decisions applied and **re-valued at the stored spot** (07) |
| `bought`, `hidden` | decisions with status `bought` / `dismissed`: `{ key, at, ...snapshot }`, newest first |
| `runs` | the newest 30 runs |
| `running` | the running check `{ since, reason, stage }` or null |
| `nextRunAt` | next scheduled run (02) |
| `settings` | the effective settings (09) |
| `huutoCategoryNames` | id → name (04) |
| `ntfy` | `{ topic: <in use or null>, fromEnv: <true when it comes from .env> }` |
| `deals` | `{ offerMaxPremium, offerDiscount, suspicious }` |
| `keepDays` | 7 |

**Live events** (`GET /api/events`, `text/event-stream`)
- On connect: `event: status` with `{ running }` (the current check or null).
- A comment line `: hb` every 25 s keeps the connection open.

| Event | Data | When |
|---|---|---|
| `status` | `{ running: { since, reason, stage } }` or `{ running: null }` | each stage change of a check, and when it ends (02) |
| `update` | `{ at }` after a check, `{}` after a POST | a check ended, or a decision or setting changed |

- Disconnected clients are removed. A write to a dead client is ignored.

**Static files**
- Path = `public/` + the normalized URL path. Anything that resolves outside `public/`, is missing, or is a folder → 404.
- Types: `.html` text/html, `.js` text/javascript, `.css` text/css (all UTF-8), `.svg` image/svg+xml, anything else application/octet-stream.

### Permissions

| UI element | Access right | Without the right |
|---|---|---|
| All routes | any process on this Mac that can reach 127.0.0.1:<PORT> | — |
| POST routes from a browser | pages served from `http://localhost:<PORT>` or `http://127.0.0.1:<PORT>` | 403 Forbidden |

### Config

`PORT` from the environment (01). The host is fixed to 127.0.0.1.

## Acceptance criteria

- [ ] `curl http://localhost:3002/api/state` returns the state with findings valued at the stored spot.
- [ ] `POST /api/run` twice in a row: the first returns `{ started: true }`, the second 409.
- [ ] A POST with `Origin: https://example.com` returns 403 and changes nothing.
- [ ] `GET /../config.js` and `GET /%2e%2e/server.js` return 404.
- [ ] An SSE client receives `status` immediately, `status` at each stage of a check, and `update` when it ends.
- [ ] After `POST /api/action`, every open dashboard reloads (via `update`).
- [ ] `POST /api/settings` with `{"runHours": []}` returns 400 "Pick at least one run hour".
- [ ] No response carries an `Access-Control-Allow-Origin` header.

## Out of scope

- Authentication or HTTPS (local only).
- Access from other devices.
- Any write API for findings themselves (only decisions and settings).
- WebSockets.

## Edge cases

- **Many open dashboards:** each holds one SSE connection; all get the same events.
- **A POST without `Content-Type`:** the body is still parsed as JSON.
- **`/api/state` while a check runs:** returns the last saved findings plus `running`.
- **A route path with a trailing slash** (`/api/state/`): not a route; served as a static file path → 404.
- **`GET /api/run`:** not a route (only POST) → 404.

## Security impact

- New local interface on 127.0.0.1 only. No login.
- The origin check blocks cross-site request forgery from web pages in the owner's browser. GET routes are read-only, and without CORS headers other sites can't read their responses.
- Static serving is limited to `public/`, with path normalization and a prefix check.

## Threat modeling

| Threat | Mitigation |
|---|---|
| A web page posts to `localhost:3002` (CSRF) to change the topic or start checks | Origin check → 403 |
| A web page reads the owner's deals via `fetch` | No CORS headers; the browser blocks reading the response |
| DNS rebinding (an attacker's domain resolving to 127.0.0.1) | POSTs from it carry the attacker's origin → 403. **Not mitigated for GET:** such a page could read `/api/state`. The `Host` header is not checked. Low value (public listing data and the owner's decisions), but a Host check would close it |
| Path traversal to read `.env` or `data/` | Normalized path must stay inside `public/` |
| A huge POST body exhausts memory | Connection destroyed over 100 000 characters |
| Other local processes call the API | Accepted: same user, same Mac |
