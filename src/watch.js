// One Market Watch run:
//   spot → collect new listings (private sellers only) → AI screens titles →
//   seller check + descriptions → AI identifies metal → value + rank (code) →
//   re-check earlier finds → report → phone push

const CFG = require('../config');
require('./settings'); // dashboard settings on top of config.js
const src = require('./sources');
const ai = require('./ai');
const { metalContent, evaluate, compareDeals } = require('./value');
const report = require('./report');
const notify = require('./notify');
const alerts = require('./alerts');
const store = require('./store');
const decisions = require('./decisions');
const { matchRules, hasMetalWord } = require('./rules');
const COIN_SPECS = require('../rules/coin-specs');

const { sleep } = src;
const escRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let onStage = () => {}; // the dashboard listens to run progress
const log = (...a) => { console.log(new Date().toLocaleTimeString('fi-FI'), ...a); onStage(a.join(' ')); };

// ── Schedule helpers ────────────────────────────────────────────────────────

// Start of the first run hour after `now` (tomorrow's first hour after the last)
function nextRunAfter(now = new Date()) {
  const h = CFG.runHours.find(x => x > now.getHours());
  const d = new Date(now);
  if (h == null) { d.setDate(d.getDate() + 1); d.setHours(CFG.runHours[0], 0, 0, 0); } else d.setHours(h, 0, 0, 0);
  return d;
}

const inRunWindow = (now = new Date()) => now.getHours() >= Math.min(...CFG.runHours) && now.getHours() <= Math.max(...CFG.runHours);

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The run slot due now: the latest run hour at or before this hour, today. A
// slot missed while the Mac slept still runs on wake (same day only).
function dueSlot(now = new Date()) {
  const past = CFG.runHours.filter(h => h <= now.getHours());
  return past.length ? `${dayKey(now)} ${Math.max(...past)}:00` : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Does the listing text contain this weight ("23g", "24,2 g", "1 kg", "31,1 grammaa")?
function weightStated(text, grossG, qty) {
  if (!(grossG > 0)) return false;
  const forms = (n) => { const s = String(Math.round(n * 100) / 100); return [s, s.replace('.', ',')]; };
  const has = (n, unit) => forms(n).some(v => new RegExp(`(^|[^\\d.,])${escRe(v)}\\s*${unit}`, 'i').test(text));
  const grams = [grossG, grossG * (qty || 1)];
  return grams.some(g => has(g, '(g\\b|gr\\b|gramm)') || (g >= 1000 && has(g / 1000, '(kg|kilo)')));
}

// Does the listing text state this fineness ("925", "0,925", "Ag 830", "999,9")?
// The AI's fineness only counts as the listing's own when it is written there.
function finenessStated(text, fineness) {
  const f = Number(fineness);
  if (!(f > 0 && f <= 1)) return false;
  let forms;
  if (f === 1) forms = ['1000', '999,9', '999.9', '9999'];
  else if (f > 0.999) forms = ['999,9', '999.9', '9999', '0,9999', '0.9999']; // not "1000": that is any number
  else {
    const t = String(Math.round(f * 1000)).padStart(3, '0');
    forms = [String(Math.round(f * 1000)), `0.${t}`, `0,${t}`];
  }
  return forms.some(v => new RegExp(`(^|[^\\d.,])${escRe(v)}($|[^\\d])`).test(text));
}

async function sellerIsBusiness(item, cache) {
  const id = String(item.sellerId);
  if (!cache[id] || Date.now() - new Date(cache[id].checkedAt).getTime() > 30 * 86400e3) {
    cache[id] = { ...(await src.huutoSeller(item.sellerId)), checkedAt: new Date().toISOString() };
    await sleep(200);
  }
  return cache[id].business ? (cache[id].name || item.seller) : null;
}

async function addDetails(item) {
  try {
    if (item.platform === 'huuto') {
      const d = await src.huutoDetails(item.id);
      Object.assign(item, {
        description: d.description, deliveryPrice: d.deliveryPrice, quantity: d.quantity,
        offersAllowed: d.offersAllowed, condition: d.condition,
      });
      await sleep(300);
    } else {
      // The listing page also says if it is already sold, and its current price
      const t = await src.toriItem(item.id);
      item.description = t.description;
      if (t.status === 'closed') item.closed = true;
      if (t.price > 0) item.price = t.price;
      await sleep(1000);
    }
  } catch (err) {
    item.description = '';
    item.detailError = err.message;
  }
}

// Live status/price for earlier finds that matter (in a category, or open auctions)
async function refresh(findings) {
  const now = Date.now();
  for (const f of findings) {
    if (f.status === 'closed') continue;
    if (f.closingTime && new Date(f.closingTime).getTime() < now) { f.status = 'closed'; continue; }
    if (['bought', 'dismissed'].includes(f.userStatus)) continue;
    // Every open find is re-checked (a price drop can turn it into a deal)
    // Hourly checks: auctions every time (bids move), everything else every 3 h
    if (f.saleType !== 'auction' && f.checkedAt && now - new Date(f.checkedAt).getTime() < 3 * 3600e3) continue;
    f.checkedAt = new Date(now).toISOString();
    try {
      if (f.platform === 'huuto') {
        const d = await src.huutoDetails(f.id);
        f.status = d.status;
        if (d.status === 'open') Object.assign(f, { price: d.price, bidders: d.bidders, closingTime: d.closingTime, offersAllowed: d.offersAllowed });
        await sleep(300);
      } else {
        const t = await src.toriItem(f.id);
        f.status = t.status;
        if (t.status === 'open' && t.price > 0) f.price = t.price;
        await sleep(1000);
      }
    } catch {}
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

let _running = null;
const isRunning = () => _running;

async function runOnce({ push = true, reason = 'manual', progress = null } = {}) {
  if (!store.lock()) { log('Another run is still going — skipping.'); return null; }
  _running = { since: new Date().toISOString(), reason, stage: 'Starting' };
  onStage = (msg) => { if (_running) _running.stage = msg.replace(/…$/, ''); if (progress && _running) progress(_running); };
  const started = new Date();
  const run = { at: started.toISOString(), reason, stats: {} };
  const st = run.stats;
  const ctx = { spot: store.load('spot', null), findings: store.load('findings', []), stopped: false };
  const stopIfStopped = () => { if (ctx.stopped) throw new Error('stopped'); };

  // A check that runs past runTimeLimitMin is stopped as failed, so a stuck request can
  // never block every later check (13–17 Oct 2026). The stuck work is abandoned: it
  // checks ctx.stopped before it saves or sends anything.
  const limitMin = CFG.runTimeLimitMin || 90;
  let timer;
  const work = checkWork({ push, reason, run, st, ctx, stopIfStopped });
  work.catch(() => {});
  try {
    await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => {
        ctx.stopped = true;
        ai.abortAll(); // end any AI program still running for this check
        reject(new Error(`Check stopped after ${limitMin} min: stuck at "${_running?.stage || '?'}". The next check runs normally.`));
      }, limitMin * 60e3);
    })]);
  } catch (err) {
    run.error = err.message;
    log('FAILED:', err.message);
    const state = store.load('state', {});
    if (push && Date.now() - new Date(state.lastFailurePush || 0).getTime() > CFG.failureAlertEveryHours * 3600e3) {
      await notify.push({ title: '⚠ Market Watch failed', message: `${err.message}\nIt retries at the next run. Help: README → Something wrong?`, priority: 'low' }).catch(() => {});
      store.save('state', { ...store.load('state', {}), lastFailurePush: run.at });
    }
  } finally {
    clearTimeout(timer);
    run.durationSec = Math.round((Date.now() - started.getTime()) / 1000);
    // Saving must never keep the check "running": each step is guarded on its own
    const guard = (what, fn) => { try { fn(); } catch (e) { log(`Could not save ${what}:`, e.message); } };
    guard('findings', () => store.save('findings', ctx.findings));
    let runs = [run];
    guard('runs', () => { runs = [run, ...store.load('runs', [])].slice(0, 100); store.save('runs', runs); });
    if (ctx.spot) {
      const next = nextRunAfter(new Date()).toISOString();
      guard('report.html', () => store.writeText('report.html', report.html({ findings: ctx.findings, spot: ctx.spot, run, runs, nextRunAt: next })));
      guard('latest.txt', () => store.writeText('latest.txt', report.text({ findings: ctx.findings, spot: ctx.spot, run, nextRunAt: next })));
    }
    store.unlock();
    _running = null;
    onStage = () => {};
    if (progress) progress(null);
  }
  return run;
}

// The check itself. Writes its results into ctx (spot, findings) and run.
async function checkWork({ push, reason, run, st, ctx, stopIfStopped }) {
  // A check stopped by the time limit stays silent: it must not overwrite the next check's status
  const say = (...a) => { if (!ctx.stopped) log(...a); };
  say('Spot price…');
  ctx.spot = await src.getSpot();
  stopIfStopped();
  store.save('spot', ctx.spot);
  const spot = ctx.spot;

  say('Collecting listings…');
  const since = new Date(Date.now() - CFG.lookbackHours * 3600e3);
  // Each source may fail on its own (site down, an empty Tori search). The check goes on
  // with the other; it only fails when both do.
  const [hRes, tRes] = await Promise.allSettled([src.fetchHuuto(since), src.fetchTori(since)]);
  stopIfStopped();
  if (hRes.status === 'rejected' && tRes.status === 'rejected') {
    throw new Error(`Huuto: ${hRes.reason.message} · Tori: ${tRes.reason.message}`);
  }
  const huuto = hRes.status === 'fulfilled' ? hRes.value : [];
  const tori = tRes.status === 'fulfilled' ? tRes.value : { items: [], skipped: src.emptyToriSkipped() };
  const warnings = [];
  if (hRes.status === 'rejected') warnings.push(`Huuto not read: ${hRes.reason.message}`);
  if (tRes.status === 'rejected') warnings.push(`Tori not read: ${tRes.reason.message}`);
  if (warnings.length) { st.warnings = warnings; say('WARNING:', warnings.join(' · ')); }
  Object.assign(st, {
    huuto: huuto.length, tori: tori.items.length,
    catawiki: tori.skipped.catawiki, toriBusiness: tori.skipped.business, wanted: tori.skipped.wanted,
    toriBusinessNames: tori.skipped.businessNames,
  });

  const seen = store.load('seen', {});
  const fresh = [...huuto, ...tori.items].filter(i => !seen[i.key]);
  st.newListings = fresh.length;
  say(`${fresh.length} new listings (Huuto ${huuto.length}, Tori ${tori.items.length} in the last ${CFG.lookbackHours} h).`);

  const added = [];
  if (fresh.length) {
    // Fixed rules and metal words go straight through; the AI screens the rest
    for (const i of fresh) i.rules = matchRules(i.title);
    const sure = [];
    const unsure = [];
    for (const i of fresh) (i.rules.length || hasMetalWord(i.title) ? sure : unsure).push(i);
    say(`AI: screening ${unsure.length} titles (${sure.length} already matched by rules/keywords)…`);
    let candidates = [...sure, ...(unsure.length ? await ai.screen(unsure) : [])];
    stopIfStopped();
    st.screened = candidates.length;

    // Private people only: drop Huuto company sellers (Tori companies were dropped at collection)
    const sellers = store.load('sellers', {});
    const people = [];
    st.huutoBusiness = 0;
    for (const c of candidates) {
      if (c.platform === 'huuto' && await sellerIsBusiness(c, sellers).catch(() => null)) { st.huutoBusiness++; continue; }
      people.push(c);
    }
    stopIfStopped();
    store.save('sellers', sellers);
    candidates = people;

    say(`Reading ${candidates.length} descriptions…`);
    for (const c of candidates) { stopIfStopped(); await addDetails(c); }
    candidates = candidates.filter(c => !c.closed); // already sold on Tori

    say('AI: identifying metal content…');
    const ids = candidates.length ? await ai.identify(candidates) : new Map();
    stopIfStopped();
    const before = new Map(ctx.findings.map(f => [f.key, f]));
    for (const c of candidates) {
      let r = ids.get(c.key);
      // A single-type rule match the AI rejected stays visible, as "check" only
      if ((!r || !['gold', 'silver'].includes(r.metal)) && c.rules?.length === 1) {
        const spec = COIN_SPECS[c.rules[0]];
        r = { ...(r || {}), metal: spec.metal, specId: c.rules[0], qty: 1, estimate: true, priceBasis: r?.priceBasis || 'total',
          name: r?.name || c.title, note: `Rule says ${spec.label}; AI doubted it${r?.note ? `: ${r.note}` : ''}` };
      }
      if (!r || !['gold', 'silver'].includes(r.metal)) continue;
      // "From the listing" only counts if the weight AND the fineness really are in the listing text
      const text = `${c.title}\n${c.description || ''}`;
      if (!r.specId && r.estimate === false
        && !(weightStated(text, Number(r.grossG), Number(r.qty)) && finenessStated(text, Number(r.fineness) > 1 ? Number(r.fineness) / 1000 : Number(r.fineness)))) {
        r.estimate = true;
      }
      const content = metalContent(r);
      if (!content) continue;
      // A Huuto link can ask for silver only, or gold and silver (e.g. foreign coins: silver only)
      if (c.metals && !c.metals.includes(content.metal)) continue;
      added.push({
        key: c.key, platform: c.platform, id: c.id, url: c.url, title: c.title,
        name: r.name || c.title, note: r.note || '',
        saleType: c.saleType, price: c.price, buyNowPrice: c.buyNowPrice || null,
        bidders: c.bidders ?? null, closingTime: c.closingTime || null,
        deliveryPrice: c.deliveryPrice ?? null, offersAllowed: !!c.offersAllowed,
        location: c.location, seller: c.seller || null,
        listedAt: c.listedAt, foundAt: run.at, status: 'open',
        metal: content.metal, priceBasis: r.priceBasis || 'total', content,
        // A listing found again (relisted) keeps its alerts, so it is not sent twice
        notified: { ...(before.get(c.key)?.notified || {}) },
      });
    }
  }
  st.found = added.length;

  // Merge with earlier finds, re-check the ones that matter, value all at today's spot.
  // Finds are kept keepDays; open auctions are kept until they close (for their ⏰ alert).
  const now = Date.now();
  const keepAfter = now - CFG.keepDays * 86400e3;
  const keep = (f) => new Date(f.listedAt).getTime() > keepAfter
    || (f.saleType === 'auction' && f.status !== 'closed' && new Date(f.closingTime).getTime() > now);
  const earlier = ctx.findings.filter(f => keep(f) && !added.some(a => a.key === f.key));
  decisions.apply(earlier).forEach(f => evaluate(f, spot));
  say('Re-checking earlier finds…');
  await refresh(earlier);
  stopIfStopped();
  // Your latest choices from the dashboard (re-read: you may have clicked during the run)
  const findings = decisions.apply([...added, ...earlier]).map(f => evaluate(f, spot));
  ctx.findings = findings;

  // What to send: category 1 when it first becomes BUY / OFFER; auctions once,
  // on the last run before they close
  const pushUntil = nextRunAfter(new Date()).getTime() + CFG.auctionAlertMarginHours * 3600e3;
  const cat1 = findings.filter(f => (f.category === 'buy' || f.category === 'offer') && !f.notified?.[f.category] && !f.userStatus);
  const closing = findings.filter(f => f.category === 'auction' && !f.notified?.closing && f.userStatus !== 'contacted'
    && new Date(f.closingTime).getTime() > Date.now() && new Date(f.closingTime).getTime() <= pushUntil);
  cat1.sort((a, b) => (a.category === b.category ? compareDeals(a, b) : a.category === 'buy' ? -1 : 1));
  closing.sort(compareDeals);

  stopIfStopped();
  for (const i of fresh) seen[i.key] = run.at; // only after success: a failed run is retried
  const pruneBefore = Date.now() - (CFG.lookbackHours + 48) * 3600e3;
  for (const [k, t] of Object.entries(seen)) if (new Date(t).getTime() < pruneBefore) delete seen[k];
  store.save('seen', seen);

  const pushErrors = [];
  if (push) {
    // Each group is sent on its own: one ntfy error doesn't stop the others
    const mark = (list, what) => list.forEach(f => { f.notified = { ...f.notified, [what]: run.at }; });
    const send = async (list, what, fn) => {
      if (!list.length) return;
      stopIfStopped();
      try {
        await fn(list);
        mark(list, what);
        // Stopped while sending: the end of the check has already saved, so save the marks
        if (ctx.stopped && !store.isLocked()) store.save('findings', ctx.findings);
      } catch (e) { pushErrors.push(`${what}: ${e.message}`); }
    };
    await send(cat1.filter(f => f.category === 'buy'), 'buy', alerts.buyNow);
    await send(cat1.filter(f => f.category === 'offer'), 'offer', alerts.offers);
    await send(closing, 'closing', alerts.auctionsClosing);
    // ☀️ morning summary: first scheduled check of the day
    const today = new Date().toDateString();
    const state = store.load('state', {});
    if (CFG.dailySummary && reason.startsWith('scheduled') && state.lastMorning !== today) {
      try {
        if (await alerts.morning(findings)) st.morningSummary = true;
        store.save('state', { ...store.load('state', {}), lastMorning: today });
      } catch (e) { pushErrors.push(`morning: ${e.message}`); }
    }
  }
  st.pushedBuyOffer = push ? cat1.length : 0;
  st.pushedAuctions = push ? closing.length : 0;

  const count = (c) => findings.filter(f => f.category === c).length;
  run.summary = `${st.newListings} new · ${st.found} gold/silver from people · now open: ${count('buy')} buy now, ${count('offer')} to offer, ${count('auction')} auctions below spot, ${count('check')} to check`
    + (push && (cat1.length || closing.length) ? ` · pushed ${cat1.length + closing.length}` : '')
    + (warnings.length ? ` · ⚠ ${warnings.join(' · ')}` : '');
  say(run.summary);
  if (pushErrors.length) throw new Error(`Some phone alerts failed (sent again next check): ${pushErrors.join(' · ')}`);
}

module.exports = { runOnce, isRunning, inRunWindow, nextRunAfter, dueSlot, weightStated, finenessStated, addDetails, sellerIsBusiness };
