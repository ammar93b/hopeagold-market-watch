#!/usr/bin/env node
// HopeaGold Market Watch — the service.
//   • dashboard at http://localhost:3002 (this Mac only)
//   • runs a check at every hour in runHours (default 9:00 … 23:00, Settings)
// Started at login and kept running by the service manager (npm run service:install):
// launchd on macOS, systemd on Linux (Raspberry Pi). See deploy/raspberry-pi.md.

const http = require('http');
const fs = require('fs');
const path = require('path');
const CFG = require('./config');
const settings = require('./src/settings');
const store = require('./src/store');
const decisions = require('./src/decisions');
const notify = require('./src/notify');
const alerts = require('./src/alerts');
const { evaluate, compareDeals } = require('./src/value');
const { runOnce, isRunning, nextRunAfter, dueSlot } = require('./src/watch');
const { trimLog } = require('./src/logfile');
const { NTFY_TOPIC } = require('./src/env');

const PORT = Number(process.env.PORT) || 3002;
const HOST = '127.0.0.1'; // never reachable from other devices
const PUBLIC = path.join(__dirname, 'public');
const log = (...a) => console.log(new Date().toLocaleString('fi-FI'), ...a);

// ── Live updates (Server-Sent Events) ───────────────────────────────────────

const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) { try { c.write(msg); } catch {} }
}

// ── Runs ────────────────────────────────────────────────────────────────────

function startRun(reason) {
  if (isRunning()) return false;
  log(`Run started (${reason})`);
  runOnce({ push: true, reason, progress: (r) => broadcast('status', { running: r }) })
    .then(run => { log(`Run finished: ${run?.error ? `FAILED ${run.error}` : run?.summary}`); broadcast('update', { at: run?.at }); })
    .catch(err => log('Run crashed:', err.message));
  return true;
}

// Every 30 s: is a run hour due that hasn't run yet? A slot counts as done when
// any run happened after its start, so restarts never double-run.
function slotStart(slot) {
  const [d, h] = slot.split(' ');
  return new Date(`${d}T${h.padStart(5, '0')}:00`).getTime();
}
function tick() {
  const slot = dueSlot();
  if (!slot || isRunning()) return;
  const state = store.load('state', {});
  const lastRun = new Date(store.load('runs', [])[0]?.at || 0).getTime();
  if (state.lastSlot === slot || lastRun >= slotStart(slot)) return;
  // A check from the Terminal (npm run check) holds the lock: wait, don't use up the slot
  if (store.isLocked()) return;
  store.save('state', { ...state, lastSlot: slot });
  startRun(`scheduled ${slot.split(' ')[1]}`);
}

// ── State for the dashboard ─────────────────────────────────────────────────

function state() {
  const spot = store.load('spot', null);
  const all = decisions.load();
  const findings = decisions.apply(store.load('findings', []));
  if (spot) findings.forEach(f => evaluate(f, spot));
  const byStatus = (st) => Object.entries(all).filter(([, d]) => d.status === st).map(([key, d]) => ({ key, at: d.at, ...d.snapshot }))
    .sort((a, b) => b.at.localeCompare(a.at));
  return {
    now: new Date().toISOString(),
    spot,
    findings,
    bought: byStatus('bought'),
    hidden: byStatus('dismissed'),
    runs: store.load('runs', []).slice(0, 30),
    running: isRunning(),
    nextRunAt: nextRunAfter(new Date()).toISOString(),
    settings: settings.get(),
    huutoCategoryNames: CFG.huuto.categoryNames,
    ntfy: { topic: CFG.ntfyTopic || NTFY_TOPIC || null, fromEnv: !CFG.ntfyTopic && !!NTFY_TOPIC },
    deals: { ...CFG.deals },
    keepDays: CFG.keepDays,
  };
}

// ── HTTP ────────────────────────────────────────────────────────────────────

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 1e5) { reject(new Error('Request too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('Bad JSON')); } });
  });
}

// Changes are only accepted from this dashboard (blocks other web pages
// open in your browser from posting to localhost)
function sameOrigin(req) {
  const o = req.headers.origin;
  return !o || o === `http://localhost:${PORT}` || o === `http://127.0.0.1:${PORT}`;
}

const findingByKey = (key) => store.load('findings', []).find(f => f.key === key);

const routes = {
  'GET /api/state': () => state(),
  'POST /api/run': () => (!store.isLocked() && startRun('manual') ? { started: true } : [409, { error: 'A check is already running.' }]),
  'POST /api/action': (b) => {
    if (!['contacted', 'bought', 'dismissed', 'reset'].includes(b.action)) return [400, { error: 'Unknown action' }];
    const f = findingByKey(b.key);
    if (!f && b.action !== 'reset') return [404, { error: 'Listing not found' }];
    const spot = store.load('spot', null);
    return { decision: decisions.setStatus(b.key, b.action, f && spot ? evaluate(decisions.apply([f])[0], spot) : f) };
  },
  'POST /api/confirm': (b) => {
    const f = findingByKey(b.key);
    if (!f) return [404, { error: 'Listing not found' }];
    return { decision: decisions.confirmWeight(b.key, b, f) };
  },
  'POST /api/settings': (b) => ({ settings: settings.update(b) }),
  // Re-send everything open (e.g. after subscribing on a new phone)
  'POST /api/resend': async () => {
    const st = state();
    const open = (c) => st.findings.filter(f => f.category === c && !f.userStatus).sort(compareDeals);
    const [buy, off, auc] = [open('buy'), open('offer'), open('auction')];
    if (!buy.length && !off.length && !auc.length) return [400, { error: 'Nothing open to send.' }];
    await alerts.buyNow(buy); await alerts.offers(off); await alerts.auctionsOpen(auc);
    return { sent: { buy: buy.length, offer: off.length, auction: auc.length } };
  },
  'POST /api/test-push': async () => {
    const r = await notify.push({ title: '🪙 Market Watch test', message: 'Phone alerts work. Deals will arrive on this topic.', click: `http://localhost:${PORT}` });
    return r.skipped ? [400, { error: r.skipped }] : { sent: true };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: status\ndata: ${JSON.stringify({ running: isRunning() })}\n\n`);
    clients.add(res);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(hb); clients.delete(res); });
    return;
  }

  const route = routes[`${req.method} ${url.pathname}`];
  if (route) {
    if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
    try {
      const out = await route(req.method === 'POST' ? await readJson(req) : {});
      if (Array.isArray(out)) return send(res, out[0], out[1]);
      if (req.method === 'POST' && !['/api/test-push', '/api/resend'].includes(url.pathname)) broadcast('update', {});
      return send(res, 200, out);
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  // Static dashboard files
  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, HOST, () => {
  log(`Market Watch dashboard: http://localhost:${PORT}  (runs at ${CFG.runHours.map(h => `${h}:00`).join(', ')})`);
  trimLog();
  setInterval(trimLog, 10 * 60e3); // keep the log small
  setTimeout(tick, 5000);
  setInterval(tick, 30000);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') { log(`Port ${PORT} is already in use — is Market Watch already running? (npm run service:status)`); process.exit(1); }
  throw err;
});
