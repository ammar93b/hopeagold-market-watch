#!/usr/bin/env node
// Try your links: one check of your Tori and Huuto searches, printed in the
// terminal. Saves NOTHING and sends NO alerts — safe to run any time, also next
// to the running service (it never marks listings as seen).
//
//   npm run try-links                      links from my-links.js, with the AI tool
//   npm run try-links -- --no-ai           rules only, no AI tool needed
//   npm run try-links -- --tori "<url>"    try another Tori search
//   npm run try-links -- --huuto "<url>" --metals silver   try one Huuto search
//   npm run try-links -- --hours 48        look further back (default 24 h)
//   npm run try-links -- --only tori       only Tori (or: --only huuto)
//
// The rules it uses are the ones in rules/ — edit them and run this again.

const CFG = require('./config');
const MY_LINKS = require('./my-links');
const DEAL_RULES = require('./rules/deal-rules');
const COIN_SPECS = require('./rules/coin-specs');
const { addDetails, sellerIsBusiness, weightStated, finenessStated } = require('./src/watch');
const { checkToriUrl, checkHuutoLinks } = require('./src/settings');
const src = require('./src/sources');
const ai = require('./src/ai');
const { AI } = require('./src/env');
const { matchRules, hasMetalWord } = require('./src/rules');
const { metalContent, evaluate, compareDeals } = require('./src/value');
const { eur, pct } = require('./src/report');

// ── Arguments ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes('--help') || args.includes('-h')) {
  console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(1, 14).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const useAi = !args.includes('--no-ai');
const hours = Number(arg('hours')) || CFG.lookbackHours;
const only = arg('only');

// This script tests YOUR FILES: my-links.js and rules/ (not the dashboard's saved Settings)
CFG.tori.searchUrl = MY_LINKS.tori;
CFG.huuto.links = MY_LINKS.huuto.map(l => ({ ...l, metals: [...l.metals] }));
Object.assign(CFG.deals, DEAL_RULES.deals);
if (arg('tori')) CFG.tori.searchUrl = arg('tori');
if (arg('huuto')) {
  const url = arg('huuto');
  const category = Number((url.match(/[?&]category=(\d+)/) || [])[1]);
  CFG.huuto.links = [{ url, category, metals: (arg('metals') || 'gold,silver').split(',').map(s => s.trim()) }];
}

const line = (s = '') => console.log(s);
const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };

async function main() {
  // Same checks as the dashboard uses, so a bad link is explained before anything is fetched
  try {
    if (only !== 'huuto') CFG.tori.searchUrl = checkToriUrl(CFG.tori.searchUrl);
    if (only !== 'tori') CFG.huuto.links = checkHuutoLinks(CFG.huuto.links);
  } catch (e) { fail(`Link problem: ${e.message}`); }
  if (useAi && !AI.command) fail('No AI tool set in .env (AI_COMMAND). Run with --no-ai to try the rules only, or see README → "AI tool".');

  line('TRY YOUR LINKS — nothing is saved, no alerts are sent');
  if (only !== 'huuto') line(`  Tori:  ${CFG.tori.searchUrl}`);
  if (only !== 'tori') CFG.huuto.links.forEach(l => line(`  Huuto: ${l.url}  (category ${l.category}: ${l.metals.join(' + ')})`));
  line(`  Last ${hours} h · ${useAi ? `AI: ${AI.command}` : 'no AI: title rules and metal words only'}`);

  const spot = await src.getSpot();
  line(`  Spot: gold ${eur(spot.gold.eurOz)}/oz · silver ${eur(spot.silver.eurOz)}/oz\n`);

  // 1. Read the links
  const since = new Date(Date.now() - hours * 3600e3);
  const [h, t] = await Promise.allSettled([
    only === 'tori' ? Promise.resolve([]) : src.fetchHuuto(since),
    only === 'huuto' ? Promise.resolve({ items: [], skipped: src.emptyToriSkipped() }) : src.fetchTori(since),
  ]);
  if (h.status === 'rejected') line(`  ⚠ Huuto not read: ${h.reason.message}`);
  if (t.status === 'rejected') line(`  ⚠ Tori not read: ${t.reason.message}`);
  const huuto = h.status === 'fulfilled' ? h.value : [];
  const tori = t.status === 'fulfilled' ? t.value : { items: [], skipped: src.emptyToriSkipped() };
  const listings = [...huuto, ...tori.items];
  line(`1. Read: Huuto ${huuto.length}, Tori ${tori.items.length} listings by private sellers`
    + ` (left out on Tori: Catawiki ${tori.skipped.catawiki}, other companies ${tori.skipped.business}, wanted ads ${tori.skipped.wanted})`);
  if (!listings.length) return line('\nNo listings in this time window. Try --hours 72, or check the link in your browser.');

  // 2. Which could be gold or silver
  for (const i of listings) i.rules = matchRules(i.title);
  const sure = listings.filter(i => i.rules.length || hasMetalWord(i.title));
  const unsure = listings.filter(i => !sure.includes(i));
  let candidates = [...sure];
  if (useAi && unsure.length) candidates.push(...await ai.screen(unsure));
  line(`2. Gold/silver candidates: ${candidates.length} (${sure.length} by title rules or metal words${useAi ? `, ${candidates.length - sure.length} by the AI` : ''})`);

  // 3. Private sellers only on Huuto, then descriptions
  const cache = {};
  const people = [];
  let companies = 0;
  for (const c of candidates) {
    if (c.platform === 'huuto' && await sellerIsBusiness(c, cache).catch(() => null)) { companies++; continue; }
    people.push(c);
  }
  candidates = people;
  for (const c of candidates) await addDetails(c);
  candidates = candidates.filter(c => !c.closed);
  line(`3. Read ${candidates.length} descriptions${companies ? ` (left out ${companies} Huuto company sellers)` : ''}`);

  // 4. Identify the metal: the AI, or without AI only coins a title rule recognises (one coin each)
  let ids = new Map();
  if (useAi && candidates.length) ids = await ai.identify(candidates);
  const finds = [];
  const unvalued = [];
  for (const c of candidates) {
    let r = ids.get(c.key);
    if ((!r || !['gold', 'silver'].includes(r.metal)) && c.rules?.length === 1) {
      const spec = COIN_SPECS[c.rules[0]];
      r = { ...(r || {}), metal: spec.metal, specId: c.rules[0], qty: 1, estimate: useAi, priceBasis: r?.priceBasis || (useAi ? 'total' : 'unclear'),
        name: r?.name || c.title, note: useAi ? `Rule says ${spec.label}; AI doubted it` : `Title rule: ${spec.label} (one coin assumed)` };
    }
    if (!r || !['gold', 'silver'].includes(r.metal)) { unvalued.push(c); continue; }
    const text = `${c.title}\n${c.description || ''}`;
    if (!r.specId && r.estimate === false
      && !(weightStated(text, Number(r.grossG), Number(r.qty)) && finenessStated(text, Number(r.fineness) > 1 ? Number(r.fineness) / 1000 : Number(r.fineness)))) r.estimate = true;
    const content = metalContent(r);
    if (!content || (c.metals && !c.metals.includes(content.metal))) { unvalued.push(c); continue; }
    finds.push(evaluate({
      ...c, name: r.name || c.title, note: r.note || '', status: 'open',
      metal: content.metal, priceBasis: r.priceBasis || 'total', content,
    }, spot));
  }
  line(`4. Valued: ${finds.length} gold/silver listings${unvalued.length ? ` · ${unvalued.length} not valued (${useAi ? 'no gold/silver found' : 'needs the AI tool'})` : ''}\n`);

  // 5. What the service would tell you
  const show = (title, list, fmt) => {
    line(`${title} (${list.length})`);
    if (!list.length) line('  —');
    list.sort(compareDeals).forEach((f, i) => line(`  ${i + 1}. ${fmt(f)}\n     ${f.url}`));
    line();
  };
  const where = (f) => (f.platform === 'huuto' ? (f.saleType === 'auction' ? 'Huuto auction' : 'Huuto') : 'Tori');
  show('🟢 BUY NOW — below spot', finds.filter(f => f.category === 'buy'),
    f => `${pct(f.premium)} · save ${eur(f.savedEur)} · ${f.name} · ${eur(f.price)} (metal ${eur(f.meltEur)}) · ${where(f)}${f.suspicious ? ' · ⚠ unusually cheap' : ''}`);
  show('💬 OFFER', finds.filter(f => f.category === 'offer'),
    f => `offer ${eur(f.offerPrice)} (max ${eur(f.maxPrice)}) · ${f.name} · asking ${f.price > 0 ? eur(f.price) : 'no price'} · ${where(f)}`);
  show('⏰ AUCTIONS below spot', finds.filter(f => f.category === 'auction'),
    f => `${pct(f.premium)} · bid max ${eur(f.maxPrice)} · ${f.name} · now ${eur(f.price)} · closes ${new Date(f.closingTime).toLocaleString('fi-FI')}`);
  show('🔎 CHECK WEIGHT FIRST — weight is an estimate', finds.filter(f => f.category === 'check'),
    f => `${pct(f.premium)} · ${f.name} · ${f.price > 0 ? eur(f.price) : 'no price'} vs est. metal ${eur(f.meltEur)} · ${f.checkReason}`);
  const other = finds.filter(f => !f.category);
  line(`Above spot (not alerted): ${other.length}${other.length ? ` — e.g. ${other.slice(0, 3).map(f => `${f.name} ${pct(f.premium)}${useAi ? '' : ' (valued as one coin)'}`).join(', ')}` : ''}`);
  line('\nNothing was saved and no alerts were sent. Happy with the links? Start the service: npm run service:install');
}

main().catch(e => fail(e.message));
