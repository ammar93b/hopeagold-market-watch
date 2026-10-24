# Appendix C: Reference code

Generated from the source on 2026-10-21 by `node specs/tools/build-appendix.js`. Do not edit by hand: change the source, then run the tool again. Each heading names the file and the function or block it came from.

The code behind every rule the specs say is enforced in code: sources and parsing, one check, valuation, alerts, settings, decisions, storage, the scheduler, the HTTP routes, the LaunchAgent and the report files.

### src/sources.js · shared helpers (request, text, entities)

```js
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const OZ = 31.1035;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// HTML entities → text (named, decimal and hex). Shared by Tori and Huuto.
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', ndash: '–', mdash: '—',
  Auml: 'Ä', auml: 'ä', Ouml: 'Ö', ouml: 'ö', Aring: 'Å', aring: 'å', eacute: 'é', Eacute: 'É' };
const decodeEntities = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1);
    return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m; // out of range: leave as is
  }
  return Object.hasOwn(NAMED, e) ? NAMED[e] : m;
}).replace(/[\u00a0\u202f]/g, ' ');
// One line of text from HTML: tags removed, entities decoded, spaces collapsed
const text = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function get(url, { json = false, allow404 = false, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.8', ...headers },
    signal: AbortSignal.timeout(30000),
  });
  if (allow404 && (res.status === 404 || res.status === 410)) return null;
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return json ? res.json() : res.text();
}
```

### src/sources.js · getSpot

```js
async function getSpot() {
  const [xau, xag, fx] = await Promise.all([
    get('https://api.gold-api.com/price/XAU', { json: true }),
    get('https://api.gold-api.com/price/XAG', { json: true }),
    get('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR', { json: true }),
  ]);
  const usdEur = fx?.rates?.EUR;
  if (!(xau?.price > 0) || !(xag?.price > 0) || !(usdEur > 0)) throw new Error('Spot price feed returned no price');
  const goldOz = xau.price * usdEur;
  const silverOz = xag.price * usdEur;
  return {
    gold: { eurOz: goldOz, eurG: goldOz / OZ, usdOz: xau.price },
    silver: { eurOz: silverOz, eurG: silverOz / OZ, usdOz: xag.price },
    usdEur, fxDate: fx.date,
    at: new Date().toISOString(),
    source: 'gold-api.com spot (USD/oz) × ECB rate (frankfurter.dev)',
  };
}
```

### src/sources.js · fetchHuuto

```js
async function fetchHuuto(since) {
  const out = [];
  const seen = new Set();
  for (const link of CFG.huuto.links) {
    for (let page = 1; page <= CFG.huuto.maxPages; page++) {
      const d = await get(`${CFG.huuto.api}/items?category=${link.category}&sort=newest&limit=100&page=${page}`, { json: true });
      const items = d.items || [];
      for (const i of items) {
        const listed = new Date(i.listTime);
        if (Number.isNaN(listed.getTime()) || listed < since) continue; // a bad date skips one item, not Huuto
        if (seen.has(i.id)) continue;
        seen.add(i.id);
        const auction = i.saleMethod === 'auction';
        out.push({
          key: `huuto:${i.id}`,
          platform: 'huuto',
          id: String(i.id),
          title: i.title,
          category: i.category,
          metals: link.metals,
          url: i.links?.alternative || `https://www.huuto.net/kohteet/${i.id}`,
          saleType: auction ? 'auction' : 'buy-now',
          price: auction ? i.currentPrice : (i.buyNowPrice ?? i.currentPrice),
          buyNowPrice: i.buyNowPrice || null,
          bidders: i.bidderCount ?? 0,
          closingTime: i.closingTime || null,
          listedAt: listed.toISOString(),
          location: i.location || '',
          seller: i.seller || '',
          sellerId: i.sellerId,
        });
      }
      const oldest = items.length ? new Date(items[items.length - 1].listTime) : null;
      if (!oldest || oldest < since || !d.links?.next) break;
      await sleep(500);
    }
    await sleep(500);
  }
  return out;
}
```

### src/sources.js · stripHtml, huutoDetails, huutoSeller

```js
const stripHtml = (s) => decodeEntities(String(s || '')
  .replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

async function huutoDetails(id) {
  const d = await get(`${CFG.huuto.api}/items/${id}`, { json: true, allow404: true });
  if (!d) return { status: 'closed' };
  const auction = d.saleMethod === 'auction';
  return {
    description: stripHtml(d.description),
    deliveryPrice: d.deliveryPrice ?? null,
    quantity: d.quantity ?? 1,
    offersAllowed: !!d.offersAllowed,
    condition: d.condition || null,
    status: d.status === 'open' ? 'open' : 'closed',
    price: auction ? d.currentPrice : (d.buyNowPrice ?? d.currentPrice),
    bidders: d.bidderCount ?? 0,
    closingTime: d.closingTime || null,
  };
}

async function huutoSeller(sellerId) {
  const u = await get(`${CFG.huuto.api}/users/${sellerId}`, { json: true, allow404: true });
  if (!u) return { business: false, name: null };
  return { business: u.type === 'company' || !!u.companyName, name: u.companyName || null, type: u.type || null };
}
```

### src/sources.js · Tori parsing (toriAgeMinutes, CARD_RE, parseToriPage)

```js
function toriAgeMinutes(text) {
  const t = String(text).trim();
  const m = t.match(/^(\d+)\s*(s|sek|min|t|h|pv|vk|kk)\b/i);
  if (!m) return /^nyt$/i.test(t) ? 0 : null;
  return parseInt(m[1], 10) * ({ s: 0, sek: 0, min: 1, t: 60, h: 60, pv: 1440, vk: 10080, kk: 43200 }[m[2].toLowerCase()]);
}

const CARD_RE = /<span>([^<]*)<\/span><\/div><h2[^>]*id="search-ad-(\d+)-[^"]*">([^<]*)<\/h2>[\s\S]*?<span class="whitespace-nowrap truncate mr-8">([^<]*)<\/span><span class="whitespace-nowrap">([^<]*)<\/span>/;

function parseToriPage(html) {
  const cards = [];
  for (const chunk of html.split('class="sf-search-ad-link').slice(1)) {
    const m = chunk.match(CARD_RE);
    if (!m) continue;
    const [, priceText, id, title, location, ageText] = m;
    const rest = chunk.slice(m.index + m[0].length);
    const end = rest.indexOf('Lisää suosikkeihin');
    // Companies (Catawiki, coin shops) show their name in Tori's seller element; private
    // people have none. Any other label on a card (e.g. shipping) is not a company.
    const area = end >= 0 ? rest.slice(0, end) : rest;
    const company = area.match(/class="[^"]*\bs-text-subtle\b[^"]*\btruncate\b[^"]*"><span>([^<]+)<\/span>/);
    const badge = company ? text(company[1]) : '';
    const p = text(priceText);
    cards.push({
      id, title: text(title), location: text(location), ageText: text(ageText),
      ageMin: toriAgeMinutes(text(ageText)),
      priceText: p,
      price: /\d/.test(p) && /€/.test(p) ? parseFloat(p.replace(/[^\d,]/g, '').replace(',', '.')) : null,
      wanted: /^ostetaan$/i.test(p),
      business: badge || null,
    });
  }
  return cards;
}
```

### src/sources.js · fetchTori, toriItem, parseToriItem, toriOffer

```js
async function fetchTori(since) {
  const out = [];
  const skipped = emptyToriSkipped();
  const now = Date.now();
  // Whole minutes: Tori rounds ages down ("1 pv" = 24–47 h), and a few ms of
  // drift would otherwise let 1440 into a 1440.0001 window
  const windowMin = Math.round((now - since.getTime()) / 60000);
  let cardsSeen = 0;
  const newestFirst = !new URL(CFG.tori.searchUrl).searchParams.get('q');
  for (let page = 1; page <= CFG.tori.maxPages; page++) {
    const html = await get(toriPageUrl(CFG.tori.searchUrl, page));
    const cards = parseToriPage(html);
    cardsSeen += cards.length;
    for (const c of cards) {
      if (c.ageMin == null || c.ageMin >= windowMin) continue;
      if (c.business) {
        if (/catawiki/i.test(c.business)) skipped.catawiki++;
        else { skipped.business++; skipped.businessNames[c.business] = (skipped.businessNames[c.business] || 0) + 1; }
        continue;
      }
      if (c.wanted) { skipped.wanted++; continue; }
      out.push({
        key: `tori:${c.id}`,
        platform: 'tori',
        id: c.id,
        title: c.title,
        category: 'Kolikot ja setelit',
        url: `https://www.tori.fi/recommerce/forsale/item/${c.id}`,
        saleType: 'buy-now',
        price: c.price,
        priceText: c.priceText,
        listedAt: new Date(now - c.ageMin * 60000).toISOString(),
        location: c.location,
        offersAllowed: true, // Tori sellers are messaged directly — every price is negotiable
      });
    }
    // Without search words Tori lists newest first, so once the last card is outside the
    // window the rest are too. With search words (q=) the order is by relevance: read
    // every page up to maxPages and keep the new ones.
    const last = cards[cards.length - 1];
    if (!last) break;
    if (newestFirst && (last.ageMin == null || last.ageMin >= windowMin)) break;
    await sleep(1000);
  }
  // Zero cards means Tori changed its page layout — the parser needs updating
  if (!cardsSeen) throw new Error('Tori returned no listing cards — the page layout may have changed');
  return { items: out, skipped };
}

async function toriItem(id) {
  const html = await get(`https://www.tori.fi/recommerce/forsale/item/${id}`, { allow404: true });
  if (!html) return { status: 'closed', description: '', price: null };
  return parseToriItem(html);
}

function parseToriItem(html) {
  const m = html.match(/data-testid="description"[\s\S]*?<div class="whitespace-pre-wrap">([\s\S]*?)<\/div>/);
  const offer = toriOffer(html);
  // The ad's own "disposed" flag sits right before its "adViewTypeLabel"
  const disposed = /\\?"disposed\\?":\s*true\s*,\s*\\?"adViewTypeLabel/.test(html)
    || /SoldOut|Discontinued/i.test(offer.availability || '');
  return { status: disposed ? 'closed' : 'open', description: m ? stripHtml(m[1]) : '', price: offer.price };
}

function toriOffer(html) {
  for (const s of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(s[1]); } catch { continue; }
    for (const d of [].concat(data)) {
      if (d?.['@type'] !== 'Product') continue;
      const o = [].concat(d.offers || [])[0] || {};
      const price = parseFloat(String(o.price ?? '').replace(',', '.'));
      return { price: Number.isFinite(price) ? price : null, availability: o.availability || '' };
    }
  }
  return { price: null, availability: '' };
}
```

### src/watch.js · schedule helpers

```js
function nextRunAfter(now = new Date()) {
  const h = CFG.runHours.find(x => x > now.getHours());
  const d = new Date(now);
  if (h == null) { d.setDate(d.getDate() + 1); d.setHours(CFG.runHours[0], 0, 0, 0); } else d.setHours(h, 0, 0, 0);
  return d;
}

const inRunWindow = (now = new Date()) => now.getHours() >= Math.min(...CFG.runHours) && now.getHours() <= Math.max(...CFG.runHours);

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dueSlot(now = new Date()) {
  const past = CFG.runHours.filter(h => h <= now.getHours());
  return past.length ? `${dayKey(now)} ${Math.max(...past)}:00` : null;
}
```

### src/watch.js · weightStated, finenessStated, sellerIsBusiness, addDetails, refresh

```js
function weightStated(text, grossG, qty) {
  if (!(grossG > 0)) return false;
  const forms = (n) => { const s = String(Math.round(n * 100) / 100); return [s, s.replace('.', ',')]; };
  const has = (n, unit) => forms(n).some(v => new RegExp(`(^|[^\\d.,])${escRe(v)}\\s*${unit}`, 'i').test(text));
  const grams = [grossG, grossG * (qty || 1)];
  return grams.some(g => has(g, '(g\\b|gr\\b|gramm)') || (g >= 1000 && has(g / 1000, '(kg|kilo)')));
}

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
```

### src/watch.js · runOnce (time limit, saving) and checkWork (one check)

```js
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
```

### src/value.js

```js
// Valuation and ranking — code only.
//
//   fine grams   = gross g × fineness × pieces
//   metal value  = fine grams × spot €/g          ← the MAX price worth paying
//   premium      = price ÷ metal value − 1        (−20 % = 20 % below spot)
//   saved €      = metal value − price
//
// Category 1 (buy now: Huuto buy-now + Tori)
//   BUY    asking price below metal value
//   OFFER  asking price up to +20 % over metal value (or no price) and the
//          seller takes offers → offer = metal value − 10 %, max = metal value
// Category 2 (Huuto auctions)
//   AUCTION  current price below metal value — max bid = metal value
// Listings whose metal content is an AI estimate go to CHECK (verify weight first).

const CFG = require('../config');
const COIN_SPECS = require('../rules/coin-specs');

function metalContent(ai) {
  const spec = ai.specId && COIN_SPECS[ai.specId];
  let fineness = spec ? spec.fineness : Number(ai.fineness);
  if (fineness > 1) fineness /= 1000; // "925" → 0.925
  const grossG = spec ? spec.grossG : Number(ai.grossG);
  const qty = ai.priceBasis === 'each' ? 1 : Math.max(1, Math.round(Number(ai.qty) || 1));
  if (!(grossG > 0) || !(fineness > 0 && fineness <= 1)) return null;
  return {
    metal: spec ? spec.metal : ai.metal,
    specLabel: spec?.label || null,
    grossG, fineness, qty,
    fineG: grossG * fineness * qty,
    // A spec gives exact grams, but an uncertain lot count is still a guess
    estimate: spec ? ai.estimate === true : ai.estimate !== false,
  };
}

// Round down: to 10 cents under 100 €, whole euros above (never over metal value)
const floorEur = (n) => n < 100 ? Math.floor(n * 10) / 10 : Math.floor(n);

// Sets metal value, premium, saved €, suggested prices and the category
function evaluate(f, spot) {
  const perG = f.content && spot[f.content.metal]?.eurG;
  f.meltEur = perG ? f.content.fineG * perG : null;
  const hasPrice = f.price > 0; // 0 € (auction starting at zero) says nothing
  f.premium = f.meltEur && hasPrice ? f.price / f.meltEur - 1 : null;
  f.savedEur = f.meltEur && hasPrice ? f.meltEur - f.price : null;
  f.maxPrice = f.meltEur ? floorEur(f.meltEur) : null;
  f.offerPrice = f.meltEur ? floorEur(f.meltEur * (1 - CFG.deals.offerDiscount)) : null;
  // Auctions start low by design — only a fixed price this far under spot is suspicious
  f.suspicious = f.saleType !== 'auction' && f.premium != null && f.premium < CFG.deals.suspicious;
  f.valuedAt = spot.at;

  let cat = null;
  if (f.meltEur && f.status !== 'closed' && !['bought', 'dismissed'].includes(f.userStatus)) {
    if (f.saleType === 'auction') {
      if (f.premium != null && f.premium < 0) cat = 'auction';
    } else if (f.premium != null && f.premium < 0) {
      cat = 'buy';
    } else if (f.offersAllowed && (f.premium == null || f.premium <= CFG.deals.offerMaxPremium)) {
      cat = 'offer';
    }
  }
  // Estimated metal content is never ranked with the confirmed deals
  f.category = cat && (f.content.estimate || f.priceBasis === 'unclear') ? 'check' : cat;
  f.checkReason = f.category === 'check' ? (f.priceBasis === 'unclear' ? 'unclear if price is per piece' : 'weight/fineness estimated') : null;
  f.estCategory = f.category === 'check' ? cat : null;
  return f;
}

// Most below spot first; offers by how far the offer is under the asking price
// The one deal order used everywhere (dashboard, report, alerts, morning summary)
const compareDeals = (a, b) => (a.premium ?? 0) - (b.premium ?? 0) || (b.savedEur ?? 0) - (a.savedEur ?? 0);
function rank(list) {
  return list.sort(compareDeals);
}

module.exports = { metalContent, evaluate, rank, compareDeals, floorEur };
```

### src/alerts.js (exact alert texts)

```js
// Phone alerts that tell you what to do (ntfy). Every alert has an
// "Open listing" button and an ACT line with the price limit.
//
//   🟢 BUY NOW   one alert per deal (top 5 per check; the rest in one summary)
//   💬 OFFER     one summary per check
//   ⏰ BID       one alert per Huuto auction, on the last check before it closes
//   ☀️ Morning   first scheduled check of the day: everything still open

const CFG = require('../config');
const notify = require('./notify');
const { eur, pct, timeLeft } = require('./report');
const { compareDeals } = require('./value');

const MAX_SINGLE_BUY = 5;
const { sleep } = require('./sources');
const hhmm = (iso) => new Date(iso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
const dayTime = (iso) => new Date(iso).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const site = (f) => (f.platform === 'huuto' ? 'Huuto' : 'Tori');
const ship = (f) => (f.deliveryPrice ? ` + shipping ${eur(f.deliveryPrice)}` : '');
const openBtn = (f) => [{ action: 'view', label: `Open on ${site(f)}`, url: f.url }];
const metalLine = (f) => {
  const c = f.content;
  const g = (n) => n.toLocaleString('fi-FI', { maximumFractionDigits: 2 });
  return c ? `${c.qty > 1 ? `${c.qty} × ` : ''}${g(c.grossG)} g × ${Math.round(c.fineness * 1000)} = ${g(c.fineG)} g ${c.metal === 'gold' ? 'gold' : 'silver'}` : '';
};

// What to do, in one line
function act(f) {
  if (f.category === 'buy') {
    return f.platform === 'huuto'
      ? `ACT: buy it on Huuto now (Osta heti) for ${eur(f.price)}${ship(f)}.`
      : `ACT: message the seller on Tori and buy for ${eur(f.price)} — never more than ${eur(f.maxPrice)}.`;
  }
  if (f.category === 'offer') {
    return `ACT: offer ${eur(f.offerPrice)} (max ${eur(f.maxPrice)}) — asking ${f.price > 0 ? eur(f.price) : 'no price'} on ${site(f)}.`;
  }
  if (f.category === 'auction') return `ACT: bid up to ${eur(f.maxPrice)} on Huuto before ${dayTime(f.closingTime)}.`;
  return '';
}

async function send(msg) {
  await notify.push(msg);
  await sleep(400); // stay well inside ntfy's rate limit
}

async function buyNow(list) {
  for (const f of list.slice(0, MAX_SINGLE_BUY)) {
    await send({
      title: `🟢 BUY NOW ${pct(f.premium)} · save ${eur(f.savedEur)} · ${f.name}`,
      message: [
        act(f),
        `${eur(f.price)} vs metal value ${eur(f.meltEur)} (${metalLine(f)}).`,
        f.suspicious ? '⚠ Unusually cheap: check the photos, that it is genuine, and that the price is not per piece.' : null,
        f.note || null,
      ].filter(Boolean).join('\n'),
      priority: 'high',
      click: f.url,
      actions: openBtn(f),
    });
  }
  const rest = list.slice(MAX_SINGLE_BUY);
  if (rest.length) {
    await send({
      title: `🟢 ${rest.length} more below spot`,
      message: rest.slice(0, 8).map((f, i) => `${MAX_SINGLE_BUY + i + 1}. ${pct(f.premium)} · save ${eur(f.savedEur)} · ${f.name} · ${eur(f.price)} · ${site(f)}`).join('\n')
        + (rest.length > 8 ? `\n+${rest.length - 8} more on the dashboard` : ''),
      priority: 'high',
      click: rest[0].url,
      actions: rest.slice(0, 3).map((f, i) => ({ action: 'view', label: `${MAX_SINGLE_BUY + i + 1}. ${f.name}`.slice(0, 40), url: f.url })),
    });
  }
}

async function offers(list) {
  if (!list.length) return;
  await send({
    title: `💬 ${list.length} to make an offer on`,
    message: list.slice(0, 8).map((f, i) => `${i + 1}. ${f.name}: offer ${eur(f.offerPrice)} (max ${eur(f.maxPrice)}) · asking ${f.price > 0 ? eur(f.price) : 'no price'} · ${site(f)}`).join('\n')
      + (list.length > 8 ? `\n+${list.length - 8} more on the dashboard` : '')
      + '\nNever offer above the max — that is the metal value.',
    priority: 'default',
    click: list[0].url,
    actions: list.slice(0, 3).map((f, i) => ({ action: 'view', label: `${i + 1}. ${f.name}`.slice(0, 40), url: f.url })),
  });
}

async function auctionsClosing(list) {
  for (const f of list) {
    await send({
      title: `⏰ BID before ${hhmm(f.closingTime)} · ${f.name}`,
      message: [
        act(f),
        `Closes ${dayTime(f.closingTime)} — ${timeLeft(f.closingTime)} left.`,
        `Now ${eur(f.price)} with ${f.bidders || 0} bids (${pct(f.premium)} vs spot). Metal value ${eur(f.meltEur)}${ship(f)}.`,
      ].join('\n'),
      priority: 'high',
      click: f.url,
      actions: openBtn(f),
    });
  }
}

// All open auctions below spot, soonest closing first (for "send to phone")
async function auctionsOpen(list) {
  if (!list.length) return;
  const sorted = [...list].sort((a, b) => new Date(a.closingTime) - new Date(b.closingTime));
  await send({
    title: `⏰ ${list.length} Huuto auctions below spot`,
    message: sorted.slice(0, 8).map((f, i) => `${i + 1}. ${f.name}: bid max ${eur(f.maxPrice)} · now ${eur(f.price)} (${pct(f.premium)}) · ${timeLeft(f.closingTime)} left`).join('\n')
      + (list.length > 8 ? `\n+${list.length - 8} more on the dashboard` : '')
      + '\nYou get a ⏰ BID alert again on the last check before each one closes.',
    priority: 'default',
    click: sorted[0].url,
    actions: sorted.slice(0, 3).map((f, i) => ({ action: 'view', label: `${i + 1}. ${f.name}`.slice(0, 40), url: f.url })),
  });
}

// ☀️ First scheduled check of the day: what's still open, best first
async function morning(findings) {
  const by = (c) => findings.filter(f => f.category === c && !f.userStatus).sort(compareDeals);
  const buy = by('buy'); const off = by('offer'); const auc = by('auction');
  if (!buy.length && !off.length && !auc.length) return false;
  const top = [...buy, ...auc, ...off].slice(0, 4);
  const saving = buy.reduce((a, f) => a + (f.savedEur || 0), 0);
  await send({
    title: `☀️ Today: ${buy.length} to buy · ${off.length} offers · ${auc.length} auctions below spot`,
    message: [
      buy.length ? `Buying all ${buy.length} saves ${eur(saving)} vs spot.` : null,
      ...top.map((f, i) => `${i + 1}. ${f.name} — ${act(f).replace('ACT: ', '')}`),
      `Checks every hour ${Math.min(...CFG.runHours)}:00–${Math.max(...CFG.runHours)}:00. Full list: dashboard on your Mac (localhost:3002).`,
    ].filter(Boolean).join('\n'),
    priority: 'default',
    click: top[0].url,
    actions: top.slice(0, 3).map((f, i) => ({ action: 'view', label: `${i + 1}. ${f.name}`.slice(0, 40), url: f.url })),
  });
  return true;
}

module.exports = { buyNow, offers, auctionsClosing, auctionsOpen, morning, act };
```

### src/notify.js

```js
// Phone notifications through ntfy.sh. JSON must be POSTed to the root URL and
// priority must be a number (posting to /<topic> delivers raw JSON text).

const { NTFY_TOPIC } = require('./env');
const CFG = require('../config');

const PRIORITY = { min: 1, low: 2, default: 3, high: 4, urgent: 5 };

async function push({ title, message, priority = 'default', click, actions, tags }) {
  const topic = CFG.ntfyTopic || NTFY_TOPIC;
  if (!topic) return { skipped: 'no ntfy topic (dashboard Settings or NTFY_TOPIC in .env)' };
  const body = { topic, title, message, priority: PRIORITY[priority] ?? 3 };
  if (click) body.click = click;
  if (actions?.length) body.actions = actions.slice(0, 3);
  if (tags?.length) body.tags = tags;
  const res = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ntfy answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { sent: true };
}

module.exports = { push };
```

### src/settings.js

```js
// Settings changed in the dashboard are saved to data/settings.json and applied
// on top of config.js. The config object is shared, so changes apply live.

const CFG = require('../config');
const store = require('./store');

const DEFAULTS = {
  runHours: [...CFG.runHours],
  offerMaxPremium: CFG.deals.offerMaxPremium,
  offerDiscount: CFG.deals.offerDiscount,
  suspicious: CFG.deals.suspicious,
  toriUrl: CFG.tori.searchUrl,
  huutoLinks: CFG.huuto.links.map(l => ({ ...l, metals: [...l.metals] })),
  ntfyTopic: '',
  dailySummary: CFG.dailySummary,
};

function apply(s) {
  CFG.runHours = [...s.runHours].sort((a, b) => a - b);
  CFG.deals.offerMaxPremium = s.offerMaxPremium;
  CFG.deals.offerDiscount = s.offerDiscount;
  CFG.deals.suspicious = s.suspicious;
  CFG.tori.searchUrl = s.toriUrl;
  CFG.huuto.links = s.huutoLinks;
  CFG.ntfyTopic = s.ntfyTopic || '';
  CFG.dailySummary = s.dailySummary !== false;
}

// Tori: the address of a Tori search. Keeps the filters, drops any page number.
function checkToriUrl(v) {
  const t = String(v || '').trim();
  if (!t) throw new Error('Paste your Tori link (the address of a Tori search).');
  let u;
  try { u = new URL(t); } catch { throw new Error('Tori link: paste the full address, starting with https://www.tori.fi/'); }
  if (u.protocol !== 'https:' || !/(^|\.)tori\.fi$/.test(u.hostname) || !u.pathname.startsWith('/recommerce/forsale/search')) {
    throw new Error('Tori link must be a Tori search address (…/recommerce/forsale/search…).');
  }
  if (u.searchParams.has('sort')) throw new Error('Remove "sort=" from the Tori link: Tori does not allow it.');
  u.searchParams.delete('page');
  return u.toString();
}

// Huuto: up to three website search addresses, each with a category, plus the metals
// that count. An empty row is ignored.
const METALS = ['gold', 'silver'];
function checkHuutoLinks(rows) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const raw = String(row?.url || '').trim();
    if (!raw) continue;
    let u;
    try { u = new URL(raw); } catch { throw new Error('Huuto link: paste the full address, starting with https://www.huuto.net/'); }
    if (u.protocol !== 'https:' || !/(^|\.)huuto\.net$/.test(u.hostname) || u.pathname !== '/haku') {
      throw new Error('Huuto link must be a Huuto search address (https://www.huuto.net/haku?category=…).');
    }
    const cat = u.searchParams.get('category');
    if (!/^\d+$/.test(cat || '')) throw new Error('Huuto link needs a category, for example ?category=1166.');
    const metals = (Array.isArray(row.metals) ? row.metals : []).filter(m => METALS.includes(m));
    if (!metals.length) throw new Error('Huuto link: choose gold, silver, or both.');
    out.push({ url: u.toString(), category: Number(cat), metals: [...new Set(metals)] });
  }
  if (!out.length) throw new Error('Paste at least one Huuto link.');
  if (out.length > 3) throw new Error('At most three Huuto links.');
  if (new Set(out.map(l => l.category)).size !== out.length) throw new Error('Two Huuto links use the same category.');
  return out;
}

function get() {
  return { ...DEFAULTS, ...store.load('settings', {}) };
}

// Validates, saves and applies. Throws with a readable message on bad input.
function update(input) {
  const s = { ...get() };
  const num = (v, min, max, name) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
    return n;
  };
  if (input.runHours !== undefined) {
    const hours = [...new Set((input.runHours || []).map(h => {
      const n = num(h, 0, 23, 'Run hour');
      if (!Number.isInteger(n)) throw new Error('Run hours must be whole hours (0–23)');
      return n;
    }))];
    if (!hours.length) throw new Error('Pick at least one run hour');
    s.runHours = hours.sort((a, b) => a - b);
  }
  if (input.offerMaxPremium !== undefined) s.offerMaxPremium = num(input.offerMaxPremium, 0, 1, 'Offer range');
  if (input.offerDiscount !== undefined) s.offerDiscount = num(input.offerDiscount, 0, 0.5, 'Offer discount');
  if (input.suspicious !== undefined) s.suspicious = -num(-input.suspicious, 0.1, 0.95, 'Unusually cheap limit');
  if (input.toriUrl !== undefined) s.toriUrl = checkToriUrl(input.toriUrl);
  if (input.huutoLinks !== undefined) s.huutoLinks = checkHuutoLinks(input.huutoLinks);
  if (input.ntfyTopic !== undefined) {
    const t = String(input.ntfyTopic).trim();
    if (t && !/^[A-Za-z0-9_-]{6,64}$/.test(t)) throw new Error('ntfy topic: 6–64 letters, numbers, - or _');
    s.ntfyTopic = t;
  }
  if (input.dailySummary !== undefined) s.dailySummary = !!input.dailySummary;
  store.save('settings', s);
  apply(s);
  return s;
}

apply(get());

module.exports = { get, update, DEFAULTS, checkToriUrl, checkHuutoLinks };
```

### src/decisions.js

```js
// Your choices from the dashboard, kept apart from findings.json so a run in
// progress can never overwrite them (data/decisions.json).
//   status: contacted | bought | dismissed
//   confirm: { grossG, fineness, qty } — your own reading of the listing's weight
// A snapshot of the listing is kept, so "Bought" history outlives the 7-day findings.

const store = require('./store');

const load = () => store.load('decisions', {});

function snapshot(f) {
  return f ? { name: f.name, url: f.url, platform: f.platform, saleType: f.saleType, price: f.price, meltEur: f.meltEur, metal: f.metal } : null;
}

function setStatus(key, status, finding) {
  const all = load();
  if (status === 'reset') { if (all[key]) delete all[key].status; }
  else all[key] = { ...(all[key] || {}), status, at: new Date().toISOString(), snapshot: snapshot(finding) || all[key]?.snapshot };
  if (all[key] && !all[key].status && !all[key].confirm) delete all[key];
  store.save('decisions', all);
  return all[key] || null;
}

function confirmWeight(key, { grossG, fineness, qty }, finding) {
  const g = Number(grossG);
  let fin = Number(fineness);
  if (fin > 1) fin /= 1000;
  const q = Math.max(1, Math.round(Number(qty) || 1));
  if (!(g > 0 && g < 100000)) throw new Error('Weight must be grams, e.g. 24 or 24.2');
  if (!(fin > 0 && fin <= 1)) throw new Error('Fineness must be like 925, 0.925 or 500');
  const all = load();
  all[key] = { ...(all[key] || {}), confirm: { grossG: g, fineness: fin, qty: q, at: new Date().toISOString() }, snapshot: snapshot(finding) || all[key]?.snapshot };
  store.save('decisions', all);
  return all[key];
}

// Puts your status and confirmed weights onto the findings (before valuing)
function apply(findings, all = load()) {
  for (const f of findings) {
    const d = all[f.key];
    f.userStatus = d?.status || null;
    if (d?.confirm && f.content) {
      const { grossG, fineness, qty } = d.confirm;
      f.content = { ...f.content, grossG, fineness, qty, fineG: grossG * fineness * qty, estimate: false, specLabel: 'weight confirmed by you' };
      f.priceBasis = 'total';
    }
  }
  return findings;
}

module.exports = { load, setStatus, confirmWeight, apply };
```

### src/store.js

```js
// JSON files in data/: seen.json, findings.json, runs.json, spot.json,
// sellers.json, state.json

const fs = require('fs');
const path = require('path');
const { DATA } = require('./env');

const file = (name) => path.join(DATA, `${name}.json`);

function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}

function save(name, data) {
  fs.mkdirSync(DATA, { recursive: true });
  const target = file(name);
  // Write then rename, so a run killed mid-write never leaves half a file
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(`${target}.tmp`, target);
}

function writeText(name, text) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, name), text, 'utf8');
}

// One run at a time, across the service and run.js. The lock holds the process id.
// It is stale when that process is gone, or after 2 hours (a check stops after 90 min).
// Created atomically ('wx'); a stale lock is moved aside before taking over, so two
// processes can't both take it; only the owner removes it.
const LOCK = path.join(DATA, 'run.lock');
const STALE_MS = 2 * 3600e3;
function readLock() { try { return fs.readFileSync(LOCK, 'utf8').trim(); } catch { return null; } }
function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try { process.kill(n, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function isLocked() {
  let age;
  try { age = Date.now() - fs.statSync(LOCK).mtimeMs; } catch { return false; }
  return age < STALE_MS && pidAlive(readLock());
}
function lock() {
  fs.mkdirSync(DATA, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (isLocked()) return false;
      const stalePid = readLock();
      const aside = `${LOCK}.stale-${process.pid}`;
      try {
        fs.renameSync(LOCK, aside); // only one process can move this file
        if (fs.readFileSync(aside, 'utf8').trim() !== stalePid) {
          // Another process took over in between: put its fresh lock back and stop
          try { fs.linkSync(aside, LOCK); } catch {}
          fs.unlinkSync(aside);
          return false;
        }
        fs.unlinkSync(aside);
      } catch {}
    }
  }
  return false;
}
function unlock() {
  try { if (readLock() === String(process.pid)) fs.unlinkSync(LOCK); } catch {}
}

module.exports = { load, save, writeText, lock, unlock, isLocked };
```

### src/env.js

```js
// Loads .env (KEY=value lines) into process.env without overriding real env vars.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      let v = m[2];
      // Remove one pair of quotes only when they wrap the whole value (AI_ARGS can end in "")
      if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0] && !v.slice(1, -1).includes(v[0])) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

loadEnv();

// Run hours and dates are Finnish time, whatever the machine's own clock is set to
// (a Raspberry Pi is often on UTC). TZ in the environment or .env still wins.
if (!process.env.TZ) process.env.TZ = 'Europe/Helsinki';

module.exports = {
  ROOT,
  DATA: path.join(ROOT, 'data'),
  NTFY_TOPIC: process.env.NTFY_TOPIC || '',
  // The AI command-line program and how to call it (README → "AI tool"). Set in .env.
  AI: {
    command: process.env.AI_COMMAND || '',
    args: process.env.AI_ARGS ?? '{prompt}',          // empty: the prompt goes to the program's input
    model: process.env.AI_MODEL || '',
    output: process.env.AI_OUTPUT || 'text',          // 'text' or 'json:<field>'
    errorField: process.env.AI_ERROR_FIELD || '',     // a JSON field that is true/set on errors
    stripEnv: (process.env.AI_STRIP_ENV || '').split(',').map(s => s.trim()).filter(Boolean),
  },
};
```

### server.js · runs and scheduler (startRun, slotStart, tick)

```js
function startRun(reason) {
  if (isRunning()) return false;
  log(`Run started (${reason})`);
  runOnce({ push: true, reason, progress: (r) => broadcast('status', { running: r }) })
    .then(run => { log(`Run finished: ${run?.error ? `FAILED ${run.error}` : run?.summary}`); broadcast('update', { at: run?.at }); })
    .catch(err => log('Run crashed:', err.message));
  return true;
}

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
```

### server.js · state, sameOrigin, routes and the request handler

```js
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

function sameOrigin(req) {
  const o = req.headers.origin;
  return !o || o === `http://localhost:${PORT}` || o === `http://127.0.0.1:${PORT}`;
}

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
```

### scripts/service.js · plist, install, remove, restart, status

```js
function plist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(SERVER)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(ROOT)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(PATHS)}</string>
    <key>HOME</key><string>${xml(os.homedir())}</string>
    <key>PORT</key><string>${PORT}</string>
  </dict>
  <key>StandardOutPath</key><string>${xml(LOG)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG)}</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`;
}

function unit() {
  return `[Unit]
Description=HopeaGold Market Watch (dashboard, hourly checks)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${q(ROOT)}
ExecStart=${q(process.execPath)} ${q(SERVER)}
Environment=${q(`PATH=${PATHS}`)}
Environment=${q(`HOME=${os.homedir()}`)}
Environment=${q(`PORT=${PORT}`)}
Restart=always
RestartSec=30
StandardOutput=append:${LOG}
StandardError=append:${LOG}

[Install]
WantedBy=default.target
`;
}

function macRemove({ quiet = false } = {}) {
  try { launchctl('bootout', `${domain}/${LABEL}`); } catch {}
  if (fs.existsSync(PLIST)) fs.unlinkSync(PLIST);
  if (!quiet) console.log('Removed: the Market Watch service is stopped and will not start at login.');
}

function macInstall() {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  macRemove({ quiet: true });
  fs.writeFileSync(PLIST, plist(), 'utf8');
  launchctl('bootstrap', domain, PLIST);
  console.log(`Installed ${PLIST}`);
  console.log(`Dashboard: http://localhost:${PORT}   Log: ${LOG}`);
}

function macRestart() {
  try { launchctl('kickstart', '-k', `${domain}/${LABEL}`); console.log('Restarted.'); }
  catch { console.log('Not installed. Run: npm run service:install'); }
}

function macStatus() {
  if (!fs.existsSync(PLIST)) return console.log('Not installed. Run: npm run service:install');
  try {
    const out = launchctl('print', `${domain}/${LABEL}`);
    const pick = (re) => (out.match(re) || [])[1];
    console.log(`Service: ${pick(/state = ([^\n]+)/) || '?'} · pid ${pick(/pid = (\d+)/) || '—'} · last exit code ${pick(/last exit code = ([^\n]+)/) || '—'}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
  } catch {
    console.log('Plist exists but is not loaded. Run: npm run service:install');
  }
}

function linuxRemove({ quiet = false } = {}) {
  try { systemctl('disable', '--now', UNIT_NAME); } catch {}
  if (fs.existsSync(UNIT)) fs.unlinkSync(UNIT);
  try { systemctl('daemon-reload'); } catch {}
  if (!quiet) console.log('Removed: the Market Watch service is stopped and will not start at boot.');
}

function linuxInstall() {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.mkdirSync(path.dirname(UNIT), { recursive: true });
  linuxRemove({ quiet: true });
  fs.writeFileSync(UNIT, unit(), 'utf8');
  systemctl('daemon-reload');
  systemctl('enable', '--now', UNIT_NAME);
  console.log(`Installed ${UNIT}`);
  console.log(`Dashboard: http://localhost:${PORT} (on the Pi itself; see deploy/raspberry-pi.md for your Mac)   Log: ${LOG}`);
  if (lingering() === false) {
    console.log(`\nOne more step, so Market Watch also runs after a reboot without anyone logging in:\n  sudo loginctl enable-linger ${os.userInfo().username}`);
  }
}

function linuxRestart() {
  try { systemctl('restart', UNIT_NAME); console.log('Restarted.'); }
  catch { console.log('Not installed. Run: npm run service:install'); }
}

function linuxStatus() {
  if (!fs.existsSync(UNIT)) return console.log('Not installed. Run: npm run service:install');
  try {
    const active = systemctl('is-active', UNIT_NAME).trim();
    const pid = systemctl('show', UNIT_NAME, '-p', 'MainPID', '--value').trim();
    const exit = systemctl('show', UNIT_NAME, '-p', 'ExecMainStatus', '--value').trim();
    console.log(`Service: ${active} · pid ${pid && pid !== '0' ? pid : '—'} · last exit code ${exit || '—'}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    if (lingering() === false) console.log(`Not set to start at boot yet: sudo loginctl enable-linger ${os.userInfo().username}`);
  } catch {
    console.log('Unit exists but is not loaded. Run: npm run service:install');
  }
}
```

### src/report.js (report.html and latest.txt)

```js
// data/report.html (open with `npm run report`) and data/latest.txt
// (print with `npm run summary`), rewritten after every run.

const CFG = require('../config');
const { rank } = require('./value');

const nf = (dec) => new Intl.NumberFormat('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const eur = (n) => n == null ? '—' : `${nf(Math.abs(n) < 100 ? 2 : 0).format(n)} €`;
const pct = (p) => p == null ? '—' : `${p > 0 ? '+' : ''}${nf(Math.abs(p) < 0.1 ? 1 : 0).format(p * 100)} %`;
const fmtTime = (iso) => new Date(iso).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const grams = (n) => nf(2).format(n);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function timeLeft(iso, now = Date.now()) {
  const min = Math.round((new Date(iso).getTime() - now) / 60000);
  if (min <= 0) return 'closed';
  const d = Math.floor(min / 1440); const h = Math.floor((min % 1440) / 60); const m = min % 60;
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 60 ? `${Math.max(min, 1)} min ago` : min < 2880 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`;
}

const where = (f) => f.platform === 'huuto' ? (f.saleType === 'auction' ? 'Huuto auction' : 'Huuto buy now') : 'Tori';
const contentLine = (f) => {
  const c = f.content;
  return `${c.qty > 1 ? `${c.qty} × ` : ''}${grams(c.grossG)} g × ${Math.round(c.fineness * 1000)} = ${grams(c.fineG)} g ${c.metal === 'gold' ? 'Au' : 'Ag'}${c.specLabel ? ` (spec: ${c.specLabel})` : ''}`;
};

function sections(findings) {
  const by = (cat) => findings.filter(f => f.category === cat);
  return { buy: rank(by('buy')), offer: rank(by('offer')), auction: rank(by('auction')), check: rank(by('check')) };
}

// ── Plain text ──────────────────────────────────────────────────────────────

function text({ findings, spot, run, nextRunAt }) {
  const s = sections(findings);
  const L = [];
  L.push(`HOPEAGOLD MARKET WATCH — ${fmtTime(run.at)}`);
  L.push(`Spot: gold ${eur(spot.gold.eurOz)}/oz (${eur(spot.gold.eurG)}/g) · silver ${eur(spot.silver.eurOz)}/oz (${eur(spot.silver.eurG)}/g)`);
  if (run.error) L.push(`⚠ LAST RUN FAILED: ${run.error}`);
  L.push(`Next run: ${fmtTime(nextRunAt)}`, '');
  L.push(`CATEGORY 1 — BUY NOW (Huuto buy-now + Tori), most below spot first`);
  if (!s.buy.length && !s.offer.length) L.push('  nothing below spot right now');
  s.buy.forEach((f, i) => L.push(`  ${i + 1}. BUY NOW  ${pct(f.premium)}  save ${eur(f.savedEur)}  ${f.name} — ${eur(f.price)} (metal ${eur(f.meltEur)})  ${where(f)}${f.suspicious ? '  ⚠ unusually cheap — check' : ''}\n     ${f.url}`));
  s.offer.forEach((f, i) => L.push(`  ${s.buy.length + i + 1}. OFFER ${eur(f.offerPrice)} (max ${eur(f.maxPrice)})  ${f.name} — asking ${f.price > 0 ? eur(f.price) : 'no price'} (${pct(f.premium)})  ${where(f)}\n     ${f.url}`));
  L.push('', `CATEGORY 2 — AUCTIONS below spot (Huuto, from your link), most below spot first`);
  if (!s.auction.length) L.push('  none right now');
  s.auction.forEach((f, i) => L.push(`  ${i + 1}. ${pct(f.premium)}  now ${eur(f.price)} (${f.bidders || 0} bids)  bid max ${eur(f.maxPrice)}  ${f.name}  — ${timeLeft(f.closingTime)} left (closes ${fmtTime(f.closingTime)})\n     ${f.url}`));
  if (s.check.length) {
    L.push('', `CHECK WEIGHT FIRST — possible deals, metal content estimated by AI`);
    s.check.forEach(f => L.push(`  • ${pct(f.premium)}  ${f.name} — ${f.price > 0 ? eur(f.price) : 'no price'} vs est. metal ${eur(f.meltEur)}  ${where(f)} (${f.checkReason})\n     ${f.url}`));
  }
  return L.join('\n') + '\n';
}

// ── HTML ────────────────────────────────────────────────────────────────────

function html({ findings, spot, run, runs, nextRunAt }) {
  const s = sections(findings);
  const st = run.stats || {};
  const badge = (cls, label) => `<span class="badge ${cls}">${label}</span>`;
  const item = (f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>
      ${f.suspicious ? badge('warn', 'unusually cheap — check') : ''}
      <div class="sub">“${esc(f.title)}”</div>
      <div class="sub">${esc(contentLine(f))}</div>
      ${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}`;
  const extra = (f) => `${f.deliveryPrice ? `<div class="sub">+ shipping ${eur(f.deliveryPrice)}</div>` : ''}<div class="sub">${esc(f.location || '')}</div>`;

  const cat1 = [...s.buy, ...s.offer];
  const cat1Rows = cat1.map((f, i) => `<tr>
    <td class="n">${i + 1}</td>
    <td>${f.category === 'buy' ? badge('buy', 'BUY NOW') : `${badge('offer', `OFFER ${eur(f.offerPrice)}`)}<div class="sub">max ${eur(f.maxPrice)}</div>`}</td>
    <td class="item">${item(f)}</td>
    <td class="num">${f.price > 0 ? eur(f.price) : '<span class="sub">no price</span>'}</td>
    <td class="num">${eur(f.meltEur)}</td>
    <td class="num ${f.premium < 0 ? 'good' : ''}">${pct(f.premium)}</td>
    <td class="num ${f.savedEur > 0 ? 'good' : ''}">${f.category === 'buy' ? eur(f.savedEur) : `<span class="sub">at offer ${eur(f.meltEur - f.offerPrice)}</span>`}</td>
    <td>${where(f)}${extra(f)}</td>
    <td class="sub">${ago(f.listedAt)}</td>
  </tr>`).join('');

  const aucRows = s.auction.map((f, i) => `<tr>
    <td class="n">${i + 1}</td>
    <td class="item">${item(f)}</td>
    <td class="num">${eur(f.price)}<div class="sub">${f.bidders || 0} bids</div></td>
    <td class="num">${eur(f.meltEur)}</td>
    <td class="num good">${pct(f.premium)}</td>
    <td class="num good">${eur(f.savedEur)}</td>
    <td class="num"><b>${eur(f.maxPrice)}</b></td>
    <td><b class="left" data-closing="${esc(f.closingTime)}">${timeLeft(f.closingTime)}</b><div class="sub">closes ${fmtTime(f.closingTime)}</div>${extra(f)}</td>
  </tr>`).join('');

  const checkRows = s.check.map(f => `<tr>
    <td>${badge('check', f.checkReason)}</td>
    <td class="item">${item(f)}</td>
    <td class="num">${f.price > 0 ? eur(f.price) : '—'}</td>
    <td class="num">${eur(f.meltEur)}</td>
    <td class="num">${pct(f.premium)}</td>
    <td>${where(f)}${f.saleType === 'auction' ? `<div class="sub">${timeLeft(f.closingTime)} left</div>` : ''}</td>
  </tr>`).join('');

  const runRows = (runs || []).slice(0, 8).map(r => `<tr><td>${fmtTime(r.at)}</td><td>${esc(r.reason)}</td><td>${r.durationSec ?? '—'} s</td><td>${r.error ? `<span class="bad">${esc(r.error)}</span>` : esc(r.summary || '')}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Market Watch</title>
<style>
:root{--bg:#0B111E;--panel:#142035;--line:rgba(212,175,55,.2);--gold:#D4AF37;--silver:#C2CAD6;--text:#E8EAF0;--dim:#8A93A8;--green:#4CAF7D;--amber:#F0A840;--red:#E05A5A;--blue:#8FB0F0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;padding:20px 16px 40px}
main{max-width:1280px;margin:0 auto}h1{font-size:20px;letter-spacing:.08em;color:var(--gold);margin:0}h2{font-size:15px;margin:28px 0 4px;color:var(--gold);letter-spacing:.04em}
.lead{color:var(--dim);font-size:12.5px;margin:0 0 10px}.bar{display:flex;flex-wrap:wrap;gap:8px 22px;align-items:baseline;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-top:12px}
.bar b.g{color:var(--gold)}.bar b.s{color:var(--silver)}.sub{color:var(--dim);font-size:12px}.note{color:var(--silver);font-size:12px;font-style:italic}
.err{margin-top:12px;padding:10px 14px;border-left:3px solid var(--red);background:rgba(224,90,90,.12);border-radius:0 6px 6px 0}
.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:760px}th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:9px 8px;border-bottom:1px solid rgba(212,175,55,.08);vertical-align:top}.n{color:var(--dim)}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.item a{color:var(--text);font-weight:600;text-decoration:none}.item a:hover{color:var(--gold);text-decoration:underline}.good{color:var(--green);font-weight:600}.bad{color:var(--red)}
.badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap}.buy{background:rgba(76,175,125,.2);color:var(--green)}.offer{background:rgba(143,176,240,.18);color:var(--blue)}
.check{background:rgba(194,202,214,.14);color:var(--silver)}.warn{background:rgba(240,168,64,.2);color:var(--amber);margin-left:4px}.left{color:var(--amber)}
.empty{color:var(--dim);font-style:italic;padding:8px 0}footer{color:var(--dim);font-size:12px;margin-top:30px;line-height:1.7}
</style></head><body><main>
<h1>HOPEAGOLD MARKET WATCH</h1>
<div class="bar">
  <span><b class="g">Gold</b> ${eur(spot.gold.eurOz)}/oz · ${eur(spot.gold.eurG)}/g</span>
  <span><b class="s">Silver</b> ${eur(spot.silver.eurOz)}/oz · ${nf(3).format(spot.silver.eurG)} €/g</span>
  <span class="sub">spot ${fmtTime(spot.at)} · updated ${fmtTime(run.at)} · next run ${fmtTime(nextRunAt)}</span>
</div>
${run.error ? `<div class="err"><b>Last run failed:</b> ${esc(run.error)}<br><span class="sub">Showing the last results. Nothing was lost — the next run retries these listings.</span></div>` : ''}
<p class="sub" style="margin-top:8px">Private sellers only. Scanned ${st.huuto ?? '—'} Huuto + ${st.tori ?? '—'} Tori listings from the last ${CFG.lookbackHours} h · excluded Catawiki ${st.catawiki ?? 0}, other companies ${(st.toriBusiness ?? 0) + (st.huutoBusiness ?? 0)}, wanted ads ${st.wanted ?? 0}.</p>

<h2>CATEGORY 1 — BUY NOW · Huuto buy-now + Tori</h2>
<p class="lead">BUY NOW = asking price below the metal value. OFFER = slightly over (up to +${Math.round(CFG.deals.offerMaxPremium * 100)} %) or no price, and the seller takes offers: offer ${Math.round(CFG.deals.offerDiscount * 100)} % under metal value, never above it. Ranked by how far below spot.</p>
${cat1.length ? `<div class="wrap"><table><thead><tr><th>#</th><th>Action</th><th>Item</th><th class="num">Price</th><th class="num">Metal value</th><th class="num">vs spot</th><th class="num">You save</th><th>Where</th><th>Listed</th></tr></thead><tbody>${cat1Rows}</tbody></table></div>` : '<p class="empty">Nothing below spot right now.</p>'}

<h2>CATEGORY 2 — AUCTIONS below spot (Huuto, from your link)</h2>
<p class="lead">Current price is below the metal value. Bid at most the max bid (= metal value). Ranked by how far below spot; final prices usually rise near the close.</p>
${s.auction.length ? `<div class="wrap"><table><thead><tr><th>#</th><th>Item</th><th class="num">Now</th><th class="num">Metal value</th><th class="num">vs spot</th><th class="num">Save now</th><th class="num">Max bid</th><th>Time left</th></tr></thead><tbody>${aucRows}</tbody></table></div>` : '<p class="empty">No auctions below spot right now.</p>'}

${s.check.length ? `<h2>CHECK WEIGHT FIRST</h2><p class="lead">Would be deals, but the metal content is an AI estimate (or it's unclear whether the price is per piece). Open the listing and confirm before acting. Never sent to your phone.</p>
<div class="wrap"><table><thead><tr><th>Why</th><th>Item</th><th class="num">Price</th><th class="num">Est. metal</th><th class="num">vs spot</th><th>Where</th></tr></thead><tbody>${checkRows}</tbody></table></div>` : ''}

<h2>RUNS</h2>
<div class="wrap"><table><thead><tr><th>When</th><th>Why</th><th>Took</th><th>Result</th></tr></thead><tbody>${runRows}</tbody></table></div>

<footer>Metal value = fine weight × spot (${esc(spot.source)}). Shipping is not included. Specs come from the verified table (rules/coin-specs.js) or the listing's own weight and fineness; AI-estimated weights are listed under "Check weight first" only.<br>
Runs at ${CFG.runHours.map(h => `${h}:00`).join(', ')}. Your links: my-links.js · rules: rules/ · help: README (Something wrong?).</footer>
</main>
<script>
// Keep "time left" live while the page is open
function left(iso){const m=Math.round((new Date(iso)-Date.now())/60000);if(m<=0)return 'closed';const d=Math.floor(m/1440),h=Math.floor(m%1440/60),n=m%60;return d?d+' d '+h+' h':h?h+' h '+n+' min':n+' min'}
function tick(){document.querySelectorAll('[data-closing]').forEach(e=>{e.textContent=left(e.dataset.closing)})}
tick();setInterval(tick,30000);
</script>
</body></html>`;
}

module.exports = { text, html, timeLeft, eur, pct, sections };
```
