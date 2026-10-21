// Data sources: Huuto.net public API, Tori.fi search pages, live spot price.
// Plain HTTP — no AI, no browser.

const CFG = require('../config');

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

// ── Spot ────────────────────────────────────────────────────────────────────

// Gold/silver in USD per troy ounce (gold-api.com, no key) × ECB USD→EUR rate
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

// ── Huuto ───────────────────────────────────────────────────────────────────

// Newest listings in each of the owner's Huuto links back to `since`: buy-now AND
// auctions. Huuto's API filters by category only, so each link is one category; the
// link's metals say which metals count (watch.js drops the others).
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

const stripHtml = (s) => decodeEntities(String(s || '')
  .replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

// Full listing: description, shipping, quantity, offers, live price + status
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

// Private person or company? (profile type "company" / company name set)
async function huutoSeller(sellerId) {
  const u = await get(`${CFG.huuto.api}/users/${sellerId}`, { json: true, allow404: true });
  if (!u) return { business: false, name: null };
  return { business: u.type === 'company' || !!u.companyName, name: u.companyName || null, type: u.type || null };
}

// ── Tori ────────────────────────────────────────────────────────────────────


// "39 min" / "3 t" / "1 pv" / "2 vk" → minutes since publishing (null = unknown)
function toriAgeMinutes(text) {
  const t = String(text).trim();
  const m = t.match(/^(\d+)\s*(s|sek|min|t|h|pv|vk|kk)\b/i);
  if (!m) return /^nyt$/i.test(t) ? 0 : null;
  return parseInt(m[1], 10) * ({ s: 0, sek: 0, min: 1, t: 60, h: 60, pv: 1440, vk: 10080, kk: 43200 }[m[2].toLowerCase()]);
}

// Card = overlay link … price … title … location · age … [company badge] … "Lisää suosikkeihin".
// Private people have no badge; companies (Catawiki, coin shops) show their name.
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

// Newest listings in the coin category back to `since`. Company listings
// (incl. Catawiki) and "Ostetaan" (wanted) ads are dropped and counted.
const emptyToriSkipped = () => ({ catawiki: 0, business: 0, wanted: 0, businessNames: {} });

// Address of one page of the owner's Tori search (keeps every filter in the link)
function toriPageUrl(searchUrl, page) {
  const u = new URL(searchUrl);
  if (page > 1) u.searchParams.set('page', String(page));
  else u.searchParams.delete('page');
  return u.toString();
}

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

// One listing page: description, whether it is gone, and its current price.
// "closed" when the page is gone (404/410) or Tori marks the ad as disposed (sold or
// removed: `"disposed":true` in the page data, seen 18 Oct 2026). The price comes from
// the page's structured data ("price": "200").
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

// The listing's own offer, from the page's structured data (a schema.org Product)
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

module.exports = { getSpot, fetchHuuto, huutoDetails, huutoSeller, fetchTori, toriItem, parseToriPage, toriAgeMinutes, toriPageUrl, parseToriItem, toriOffer, emptyToriSkipped, get, sleep, decodeEntities, text, UA, OZ };
