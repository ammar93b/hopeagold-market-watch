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
