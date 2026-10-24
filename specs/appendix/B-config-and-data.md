# Appendix B: Config, coin data and title rules

Generated from the source on 2026-10-21 by `node specs/tools/build-appendix.js`. Do not edit by hand: change the source, then run the tool again. Each heading names the file and the function or block it came from.

The settings defaults, the verified coin table, the title rules and the project files, word for word. Specs: 01, 06, 05, 09.

### config.js

```js
// HopeaGold Market Watch — settings. Your links: my-links.js · rules: rules/ (README).

const MY_LINKS = require('./my-links');
const DEAL_RULES = require('./rules/deal-rules');

module.exports = {
  // ── Schedule (local time) ──
  // Every hour during the day, 9:00–23:00 (the service schedules this itself;
  // change it in the dashboard → Settings)
  runHours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],

  // ☀️ Phone summary of everything still open, on the first check of the day
  dailySummary: true,

  // Listings published within this many hours are considered. Each listing is
  // only processed once (data/seen.json), so this mainly covers the night gap.
  lookbackHours: 24,

  // ── Prices and alert timing: rules/deal-rules.js (anyone can edit) ──
  deals: { ...DEAL_RULES.deals },
  auctionAlertMarginHours: DEAL_RULES.auctionAlertMarginHours,

  // ── Phone (ntfy.sh) ──
  // A failed run (AI usage limit, site change…) is pushed at most this often
  failureAlertEveryHours: 12,

  // ── Your links: my-links.js (README → "Your links") ──
  tori: {
    searchUrl: MY_LINKS.tori,
    maxPages: 8,
  },
  huuto: {
    api: 'https://api.huuto.net/1.1',
    links: MY_LINKS.huuto.map(l => ({ ...l, metals: [...l.metals] })),
    // names of the categories, for the dashboard and reports
    categoryNames: {
      1166: 'Kultarahat ja -harkot',
      258: 'Suomalaiset kolikot - markka',
      257: 'Suomalaiset juhlarahat ja vuosisarjat - markka',
      260: 'Ulkomaiset kolikot (ei eurot)',
      1165: 'Ulkomaalaiset juhlarahat ja vuosisarjat (ei eurot)',
      1161: 'Euro juhlarahat (kaikki maat)',
    },
    maxPages: 10, // 100 listings per page
  },


  // ── AI (the AI program, its arguments and model are set in .env: see README → "AI tool") ──
  ai: {
    timeoutMs: 10 * 60000,
    screenBatch: 150, // titles per screening call
    identifyBatch: 30, // listings per identification call
  },

  // Findings are kept (and re-checked) this long. Open auctions are kept until they close.
  keepDays: 7,

  // A check that runs longer than this is stopped as failed, so a stuck check can
  // never block the next ones (it happened 13–17 Oct 2026). AI calls take up to 10 min each.
  runTimeLimitMin: 90,
};
```

### my-links.js

```js
// YOUR LINKS — put your own Tori and Huuto searches here (README → "Your links").
// The dashboard (Settings → Your links) can change them too; Settings wins.
// Test them without alerts or saving anything:  npm run try-links

module.exports = {
  // 1. TORI: the full address of a Tori search, copied from your browser. Any
  //    filters work (category, price, location, search words). It must start with
  //    https://www.tori.fi/recommerce/forsale/search and must not contain "sort="
  //    (Tori's robots.txt forbids it). Example: the coins and banknotes category.
  tori: 'https://www.tori.fi/recommerce/forsale/search?product_category=2.86.285.138',

  // 2. HUUTO: up to three searches. Each is one Huuto category; buy-now AND
  //    auction listings in it are checked. "metals" = which metals count in that
  //    category (a coin of another metal is dropped). Find a category number in
  //    the address of a Huuto category page: huuto.net/haku?category=<number>
  huuto: [
    { url: 'https://www.huuto.net/haku?category=1166&sort=newest', category: 1166, metals: ['gold', 'silver'] }, // gold coins and bars
    { url: 'https://www.huuto.net/haku?sort=newest&category=1165', category: 1165, metals: ['gold', 'silver'] }, // foreign commemoratives
    { url: 'https://www.huuto.net/haku?sort=newest&category=260', category: 260, metals: ['silver'] },            // foreign coins: silver only
  ],
};
```

### rules/coin-specs.js

```js
// Standard catalogue specs (gross weight in grams × fineness) for common
// circulation and bullion coins. Market Watch uses these instead of the AI's
// own numbers whenever a listing matches one exactly.
//
// Commemoratives are only here when checked one by one: specs vary by year
// (Finnish 100 markkaa is .830 in 1989–91 but .925 in 1996). Anything else is
// an AI estimate: listed under "Check weight first" in the report, never pushed
// (the AI put the 1000 mk 1992 at 15 g of gold — it is 9 g).

const OZ = 31.1035;

module.exports = {
  // ── Finland ──
  'fi-25p-1865-1917':   { label: 'Finland 25 penniä 1865–1917',          metal: 'silver', grossG: 1.2747,  fineness: 0.750 },
  'fi-50p-1864-1917':   { label: 'Finland 50 penniä 1864–1917',          metal: 'silver', grossG: 2.5494,  fineness: 0.750 },
  'fi-1mk-1864-1915':   { label: 'Finland 1 markka 1864–1915',           metal: 'silver', grossG: 5.1828,  fineness: 0.868 },
  'fi-2mk-1865-1908':   { label: 'Finland 2 markkaa 1865–1908',          metal: 'silver', grossG: 10.3657, fineness: 0.868 },
  'fi-100mk-1956-1960': { label: 'Finland 100 markkaa 1956–1960',        metal: 'silver', grossG: 5.2,     fineness: 0.500 },
  'fi-200mk-1956-1959': { label: 'Finland 200 markkaa 1956–1959',        metal: 'silver', grossG: 8.3,     fineness: 0.500 },
  'fi-1mk-1964-1968':   { label: 'Finland 1 markka 1964–1968 (billon)',  metal: 'silver', grossG: 6.4,     fineness: 0.350 },
  'fi-10mk-1878-1913':  { label: 'Finland 10 markkaa gold 1878–1913',    metal: 'gold',   grossG: 3.2258,  fineness: 0.900 },
  'fi-20mk-1878-1913':  { label: 'Finland 20 markkaa gold 1878–1913',    metal: 'gold',   grossG: 6.4516,  fineness: 0.900 },
  // Finnish markka commemoratives — only the ones checked against Numista (11 Oct 2026)
  'fi-500mk-1951-1952': { label: 'Finland 500 markkaa 1951–1952 Olympics',               metal: 'silver', grossG: 12,    fineness: 0.500 },
  'fi-1000mk-1960':     { label: 'Finland 1000 markkaa 1960 markka centenary (Snellman)', metal: 'silver', grossG: 14,    fineness: 0.875 },
  'fi-10mk-1967':       { label: 'Finland 10 markkaa 1967 Independence 50 years',        metal: 'silver', grossG: 24,    fineness: 0.900 },
  'fi-10mk-1970':       { label: 'Finland 10 markkaa 1970 Paasikivi',                    metal: 'silver', grossG: 22.75, fineness: 0.500 },
  'fi-10mk-1975':       { label: 'Finland 10 markkaa 1975 Kekkonen 75 years',            metal: 'silver', grossG: 23.5,  fineness: 0.500 },
  'fi-25mk-1978':       { label: 'Finland 25 markkaa 1978 Lahti ski championships',      metal: 'silver', grossG: 26.3,  fineness: 0.500 },
  'fi-100mk-1989-1991': { label: 'Finland 100 markkaa 1989 Ateneum / 1989 Lahti ski / 1990 War Invalids / 1991 Ice hockey', metal: 'silver', grossG: 24, fineness: 0.830 },
  'fi-1000mk-1992':     { label: 'Finland 1000 markkaa 1992 Independence 75 years (gold)', metal: 'gold', grossG: 9,     fineness: 0.900 },

  // ── Sweden / Denmark / Norway ──
  'smu-10ore-1874-1942':  { label: 'Scandinavian 10 öre/øre silver 1874–1942', metal: 'silver', grossG: 1.45, fineness: 0.400 },
  'smu-25ore-1874-1941':  { label: 'Scandinavian 25 öre/øre 1874–1941',        metal: 'silver', grossG: 2.42, fineness: 0.600 },
  'smu-50ore-1875-1939':  { label: 'Scandinavian 50 öre/øre 1875–1939',        metal: 'silver', grossG: 5.0,  fineness: 0.600 },
  'smu-1kr-1875-1942':    { label: 'Scandinavian 1 krona/krone 1875–1942',     metal: 'silver', grossG: 7.5,  fineness: 0.800 },
  'smu-2kr-1876-1940':    { label: 'Scandinavian 2 kronor/kroner 1876–1940',   metal: 'silver', grossG: 15.0, fineness: 0.800 },
  'se-10ore-1942-1962':   { label: 'Sweden 10 öre 1942–1962',                  metal: 'silver', grossG: 1.44, fineness: 0.400 },
  'se-25ore-1943-1961':   { label: 'Sweden 25 öre 1943–1961',                  metal: 'silver', grossG: 2.32, fineness: 0.400 },
  'se-50ore-1943-1961':   { label: 'Sweden 50 öre 1943–1961',                  metal: 'silver', grossG: 4.8,  fineness: 0.400 },
  'se-1kr-1942-1968':     { label: 'Sweden 1 krona 1942–1968',                 metal: 'silver', grossG: 7.0,  fineness: 0.400 },
  'se-2kr-1942-1966':     { label: 'Sweden 2 kronor 1942–1966',                metal: 'silver', grossG: 14.0, fineness: 0.400 },
  'se-5kr-1954-1971':     { label: 'Sweden 5 kronor 1954–1971',                metal: 'silver', grossG: 18.0, fineness: 0.400 },
  'smu-5kr-gold':         { label: 'Scandinavian 5 kronor gold',               metal: 'gold',   grossG: 2.2401, fineness: 0.900 },
  'smu-10kr-gold':        { label: 'Scandinavian 10 kronor/kroner gold',       metal: 'gold',   grossG: 4.4803, fineness: 0.900 },
  'smu-20kr-gold':        { label: 'Scandinavian 20 kronor/kroner gold',       metal: 'gold',   grossG: 8.9606, fineness: 0.900 },

  // ── Russia / USSR ──
  'ru-5kop-1867-1915':  { label: 'Russia 5 kopeks silver 1867–1915',     metal: 'silver', grossG: 0.8998,  fineness: 0.500 },
  'ru-10kop-1867-1930': { label: 'Russia/USSR 10 kopeks silver 1867–1930', metal: 'silver', grossG: 1.7996, fineness: 0.500 },
  'ru-15kop-1867-1930': { label: 'Russia/USSR 15 kopeks silver 1867–1930', metal: 'silver', grossG: 2.6994, fineness: 0.500 },
  'ru-20kop-1867-1930': { label: 'Russia/USSR 20 kopeks silver 1867–1930', metal: 'silver', grossG: 3.5992, fineness: 0.500 },
  'ru-25kop-1886-1901': { label: 'Russia 25 kopeks 1886–1901',           metal: 'silver', grossG: 4.9989,  fineness: 0.900 },
  'ru-50kop-1886-1927': { label: 'Russia/USSR 50 kopeks 1886–1927',      metal: 'silver', grossG: 9.9977,  fineness: 0.900 },
  'ru-1rub-1886-1924':  { label: 'Russia/USSR 1 rouble 1886–1924',       metal: 'silver', grossG: 19.9954, fineness: 0.900 },
  'ru-5rub-1897-1911':  { label: 'Russia 5 roubles gold 1897–1911',      metal: 'gold',   grossG: 4.3013,  fineness: 0.900 },
  'ru-7.5rub-1897':     { label: 'Russia 7½ roubles gold 1897',          metal: 'gold',   grossG: 6.4519,  fineness: 0.900 },
  'ru-10rub-1898-1911': { label: 'Russia 10 roubles gold 1898–1911',     metal: 'gold',   grossG: 8.6026,  fineness: 0.900 },
  'ru-15rub-1897':      { label: 'Russia 15 roubles gold 1897',          metal: 'gold',   grossG: 12.9039, fineness: 0.900 },
  'su-chervonets':      { label: 'USSR chervonets (10 roubles) gold 1923/1975–1982', metal: 'gold', grossG: 8.6026, fineness: 0.900 },

  // ── UK / Commonwealth ──
  'gb-sovereign':      { label: 'Gold sovereign (full)',  metal: 'gold', grossG: 7.9881, fineness: 0.9167 },
  'gb-half-sovereign': { label: 'Gold half sovereign',    metal: 'gold', grossG: 3.9940, fineness: 0.9167 },

  // ── USA ──
  'us-dollar-1878-1935':  { label: 'US silver dollar (Morgan / Peace) 1878–1935', metal: 'silver', grossG: 26.73, fineness: 0.900 },
  'us-half-1892-1964':    { label: 'US half dollar 1892–1964',                    metal: 'silver', grossG: 12.5,  fineness: 0.900 },
  'us-half-1965-1970':    { label: 'US Kennedy half dollar 1965–1970',            metal: 'silver', grossG: 11.5,  fineness: 0.400 },
  'us-quarter-1892-1964': { label: 'US quarter 1892–1964',                        metal: 'silver', grossG: 6.25,  fineness: 0.900 },
  'us-dime-1892-1964':    { label: 'US dime 1892–1964',                           metal: 'silver', grossG: 2.5,   fineness: 0.900 },
  'us-gold-2.5':          { label: 'US $2.50 gold (pre-1934)',                    metal: 'gold',   grossG: 4.18,   fineness: 0.900 },
  'us-gold-5':            { label: 'US $5 gold (pre-1934)',                       metal: 'gold',   grossG: 8.359,  fineness: 0.900 },
  'us-gold-10':           { label: 'US $10 gold (pre-1934)',                      metal: 'gold',   grossG: 16.718, fineness: 0.900 },
  'us-gold-20':           { label: 'US $20 gold double eagle (pre-1934)',         metal: 'gold',   grossG: 33.436, fineness: 0.900 },

  // ── Latin Monetary Union & Europe gold ──
  'lmu-10fr':           { label: '10 francs/lire gold (LMU, Austria 4 florin)', metal: 'gold', grossG: 3.2258, fineness: 0.900 },
  'lmu-20fr':           { label: '20 francs/lire gold (Napoleon, Vreneli, LMU, Austria 8 florin)', metal: 'gold', grossG: 6.4516, fineness: 0.900 },
  'de-10mark':          { label: 'Germany 10 mark gold 1872–1914',  metal: 'gold', grossG: 3.9825,  fineness: 0.900 },
  'de-20mark':          { label: 'Germany 20 mark gold 1871–1915',  metal: 'gold', grossG: 7.9650,  fineness: 0.900 },
  'nl-10gulden':        { label: 'Netherlands 10 gulden gold',      metal: 'gold', grossG: 6.7290,  fineness: 0.900 },
  'at-1ducat':          { label: 'Austria 1 ducat (incl. restrikes)', metal: 'gold', grossG: 3.4909, fineness: 0.986 },
  'at-4ducat':          { label: 'Austria 4 ducat (incl. restrikes)', metal: 'gold', grossG: 13.9636, fineness: 0.986 },
  'at-10corona':        { label: 'Austria 10 corona gold',          metal: 'gold', grossG: 3.3875,  fineness: 0.900 },
  'at-20corona':        { label: 'Austria 20 corona gold',          metal: 'gold', grossG: 6.7751,  fineness: 0.900 },
  'at-100corona':       { label: 'Austria 100 corona gold',         metal: 'gold', grossG: 33.8753, fineness: 0.900 },
  'mx-50pesos':         { label: 'Mexico 50 pesos gold',            metal: 'gold', grossG: 41.6666, fineness: 0.900 },
  'mx-2pesos':          { label: 'Mexico 2 pesos gold',             metal: 'gold', grossG: 1.6666,  fineness: 0.900 },
  'mt-thaler-1780':     { label: 'Maria Theresa thaler 1780 (restrike)', metal: 'silver', grossG: 28.0668, fineness: 0.8333 },

  // ── Bullion coins by fine weight (Krugerrand, Maple Leaf, Eagle, Philharmonic, Britannia, Kangaroo…) ──
  'gold-1oz':      { label: 'Gold bullion 1 oz',     metal: 'gold',   grossG: OZ,      fineness: 1 },
  'gold-1/2oz':    { label: 'Gold bullion 1/2 oz',   metal: 'gold',   grossG: OZ / 2,  fineness: 1 },
  'gold-1/4oz':    { label: 'Gold bullion 1/4 oz',   metal: 'gold',   grossG: OZ / 4,  fineness: 1 },
  'gold-1/10oz':   { label: 'Gold bullion 1/10 oz',  metal: 'gold',   grossG: OZ / 10, fineness: 1 },
  'gold-1/20oz':   { label: 'Gold bullion 1/20 oz',  metal: 'gold',   grossG: OZ / 20, fineness: 1 },
  'gold-1/25oz':   { label: 'Gold bullion 1/25 oz',  metal: 'gold',   grossG: OZ / 25, fineness: 1 },
  'silver-1oz':    { label: 'Silver bullion 1 oz',   metal: 'silver', grossG: OZ,      fineness: 1 },
};
```

### rules/title-rules.js

```js
// TITLE RULES — anyone can edit this file (see rules/README.md).
//
// A listing title that matches a rule is a known gold/silver coin: it always
// goes on to be identified, and its weight and fineness come from
// rules/coin-specs.js (the id in the first column must exist there).
//
// One rule = [coin id, title pattern, first year, last year, (optional) words
// that must also be in the title]. The title must contain a year in range.
// After a change: npm test, then npm run try-links to see it on real listings.

// [specId, denomination regex, from year, to year, extra context regex]
const RULES = [
  ['fi-25p-1865-1917',   /\b25\s*(p|penni|penniä|pennin|pennia)\b/i, 1865, 1917],
  ['fi-50p-1864-1917',   /\b50\s*(p|penni|penniä|pennin|pennia)\b/i, 1864, 1917],
  ['fi-1mk-1864-1915',   /(^|\D)1\s*(mk|markka|markan)\b|^markka\b/i, 1864, 1915],
  ['fi-1mk-1964-1968',   /(^|\D)1\s*(mk|markka|markan)\b|^markka\b|hopeamarkk/i, 1964, 1968],
  ['fi-2mk-1865-1908',   /(^|\D)2\s*(mk|markkaa|markan)\b/i, 1865, 1908],
  ['fi-10mk-1878-1913',  /(^|\D)10\s*(mk|markkaa|markan)\b/i, 1878, 1913],
  ['fi-20mk-1878-1913',  /(^|\D)20\s*(mk|markkaa|markan)\b/i, 1878, 1913],
  ['fi-100mk-1956-1960', /(^|\D)100\s*(mk|markkaa|markan)\b/i, 1956, 1960],
  ['fi-200mk-1956-1959', /(^|\D)200\s*(mk|markkaa|markan)\b/i, 1956, 1959],
  ['fi-500mk-1951-1952', /(^|\D)500\s*(mk|markkaa|markan)\b/i, 1951, 1952],
  ['fi-1000mk-1960',     /(^|\D)1\s?000\s*(mk|markkaa|markan)\b/i, 1960, 1960],
  ['fi-10mk-1967',       /(^|\D)10\s*(mk|markkaa|markan)\b/i, 1967, 1967],
  ['fi-10mk-1970',       /(^|\D)10\s*(mk|markkaa|markan)\b/i, 1970, 1970],
  ['fi-10mk-1975',       /(^|\D)10\s*(mk|markkaa|markan)\b/i, 1975, 1975],
  ['fi-25mk-1978',       /(^|\D)25\s*(mk|markkaa|markan)\b/i, 1978, 1978],
  ['fi-1000mk-1992',     /(^|\D)1\s?000\s*(mk|markkaa|markan)\b/i, 1992, 1992],

  // Sweden (needs a Swedish word, or a pre-1940 Scandinavian one for the union coins)
  ['se-1kr-1942-1968',   /\b1\s*(krona|kruunu|kr)\b/i, 1942, 1968, /ruots|swed|sverige|krona\b/i],
  ['se-2kr-1942-1966',   /\b2\s*(kronor|kruunua|kr)\b/i, 1942, 1966, /ruots|swed|sverige|kronor/i],
  ['se-5kr-1954-1971',   /\b5\s*(kronor|kruunua|kr)\b/i, 1954, 1971, /ruots|swed|sverige|kronor/i],
  ['se-50ore-1943-1961', /\b50\s*(öre|ore)\b/i, 1943, 1961, /ruots|swed|sverige|öre/i],
  ['se-25ore-1943-1961', /\b25\s*(öre|ore)\b/i, 1943, 1961, /ruots|swed|sverige|öre/i],
  ['se-10ore-1942-1962', /\b10\s*(öre|ore)\b/i, 1942, 1962, /ruots|swed|sverige|öre/i],
  ['smu-1kr-1875-1942',  /\b1\s*(krona|krone|kruunu|kr)\b/i, 1875, 1941, /ruots|swed|sverige|tansk|denmark|danmark|norj|norway|norge/i],
  ['smu-2kr-1876-1940',  /\b2\s*(kronor|kroner|kruunua|kr)\b/i, 1876, 1940, /ruots|swed|sverige|tansk|denmark|danmark|norj|norway|norge|kronor|kroner/i],
  ['smu-50ore-1875-1939', /\b50\s*(öre|øre|ore)\b/i, 1875, 1939],
  ['smu-25ore-1874-1941', /\b25\s*(öre|øre|ore)\b/i, 1874, 1941],
  ['smu-10ore-1874-1942', /\b10\s*(öre|øre|ore)\b/i, 1874, 1941],

  // Russia / USSR silver (1931 exists in both silver and cupronickel → left to the AI)
  ['ru-10kop-1867-1930', /\b10\s*(kop|kopeek|kopeekka|kopeekkaa|kopeikka|kopek|kopeks)/i, 1867, 1930],
  ['ru-15kop-1867-1930', /\b15\s*(kop|kopeek|kopeekka|kopeekkaa|kopeikka|kopek|kopeks)/i, 1867, 1930],
  ['ru-20kop-1867-1930', /\b20\s*(kop|kopeek|kopeekka|kopeekkaa|kopeikka|kopek|kopeks)/i, 1867, 1930],
  ['ru-50kop-1886-1927', /\b50\s*(kop|kopeek|kopeekka|kopeekkaa|kopeikka|kopek|kopeks)/i, 1886, 1927],
  ['ru-1rub-1886-1924',  /\b1\s*(rupla|ruplaa|rouble|ruble|rubel)/i, 1886, 1924],

  // USA
  ['us-dollar-1878-1935', /morgan|peace dollar|\b1\s*(dollar|dollari)\b/i, 1878, 1935, /\busa\b|\bus\b|yhdysval|morgan|peace|liberty/i],
  ['us-half-1892-1964',   /half dollar|50\s*(cents|centtiä|c)\b/i, 1892, 1964],
  ['us-quarter-1892-1964', /quarter/i, 1892, 1964],

  // Gold bullion / trade coins
  ['gb-sovereign',      /^(?!.*(half|puoli|½)).*(sovereign|soverei|punnan kulta)/i, 1817, 2030],
  ['gb-half-sovereign', /(half|puoli|½)\s*-?\s*sovereign/i, 1817, 2030],
];

// Titles with these words are never a coin to value (banknotes, copies, plated)
const NOT_COIN = /setel|kopio|replik|jäljenn|kullattu|hopeoitu|plated|faksimile/i;


// Precious-metal words: these titles always go on to be identified
const METAL_WORDS = /hope|kult|\bag\s?\d{3}|\bau\s?\d{3}|\b(925|999|9999|835|830|900)\b|sterling|unssi|\boz\b|harkko|krugerrand|maple leaf|philharmon|britannia|panda|vreneli|ducat|dukaat|sovereign|taaleri|thaler|denaari|denari|drakhm|drachm/i;

// Plated / gilded items: never gold or silver, even with a metal word
const PLATED = /kullattu|hopeoitu|plated/i;

// Facts the AI is told in every prompt (coins it tends to get wrong)
const BASE_METAL = 'Finnish 1, 5 and 10 penniä (all years), markka coins after 1968, 5/10/20 markkaa 1928–1952 and Finnish 5 € commemoratives (bimetallic brass/copper-nickel) are base metal — not silver.';

module.exports = { RULES, NOT_COIN, METAL_WORDS, PLATED, BASE_METAL };
```

### rules/deal-rules.js

```js
// DEAL RULES — anyone can edit this file (see rules/README.md).
//
// metal value = grams × fineness × spot price. It is the MAX price worth paying.
// premium     = price ÷ metal value − 1   (−0.20 = 20 % below spot)
// The dashboard's Settings page can change the first three; Settings wins.

module.exports = {
  deals: {
    // BUY NOW: asking price below metal value (always).
    // OFFER: asking price at most this much over metal value (or no price shown)
    // and the seller takes offers → suggest an offer below spot.
    offerMaxPremium: 0.20,
    // Suggested offer = metal value minus this much (never above metal value).
    offerDiscount: 0.10,
    // More than this far under metal value = probably a per-piece price, a typo,
    // a copy or a scam → still listed, marked "unusually cheap — check".
    suspicious: -0.5,
  },

  // Auctions are alerted once, on the last check before they close (closing
  // before the next check + this many hours), if still below spot.
  auctionAlertMarginHours: 1,
};
```

### src/rules.js

```js
// Matching titles against the title rules (the rules themselves: rules/title-rules.js).
// Fixed title rules for common gold/silver coins, so they never depend on the
// AI's memory alone. A match (1) always passes the AI title screen, (2) is
// given to the identification step as a hint, and (3) is kept in "Check weight
// first" if the AI still says "not silver". (In testing the AI dropped
// "1 kruunu 1965" at screening and called "50 öre 1956" cupronickel — both are
// .400 silver.)

const years = (t) => (t.match(/\b(1[6-9]\d\d|20[0-3]\d)\b/g) || []).map(Number);
const inRange = (ys, a, b) => ys.some(y => y >= a && y <= b);

const { RULES, NOT_COIN, METAL_WORDS, PLATED } = require('../rules/title-rules');

// Spec ids the title matches (several = mixed lot or ambiguous; the AI sorts it out)
function matchRules(title) {
  if (!title || NOT_COIN.test(title)) return [];
  const ys = years(title);
  if (!ys.length) return [];
  const out = [];
  for (const [id, re, a, b, ctx] of RULES) {
    if (re.test(title) && inRange(ys, a, b) && (!ctx || ctx.test(title))) out.push(id);
  }
  return out;
}

// Precious-metal words — these titles always reach the identification step
const hasMetalWord = (title) => METAL_WORDS.test(title || '') && !PLATED.test(title || '');

module.exports = { matchRules, hasMetalWord };
```

### .env.example

```sh
# HopeaGold Market Watch — copy to .env and fill in (README → "Run it from scratch").
# .env stays on your computer: it is never uploaded to GitHub.

# Your private ntfy topic — the same name you subscribed to in the ntfy app.
# Make one with:  echo hopeagold-market-$(openssl rand -hex 5)
NTFY_TOPIC=

# ── AI tool ─────────────────────────────────────────────────────────────────
# Market Watch asks an AI command-line program to read listing titles and
# descriptions. Install one, log in to it once in the Terminal, then fill in:
#   AI_COMMAND      full path of the program (find it with: which <program>)
#   AI_ARGS         its arguments; {prompt} is replaced by the question, {model}
#                   by AI_MODEL. Without {prompt}, the question goes to its input.
#   AI_MODEL        the model name, if the arguments use {model}
#   AI_OUTPUT       text           = the program prints the answer as plain text
#                   json:<field>   = it prints JSON and the answer is in <field>
#   AI_ERROR_FIELD  (optional) a JSON field that is set when the program failed
#   AI_STRIP_ENV    (optional) comma-separated variables removed before running it,
#                   e.g. API keys, so it uses your subscription login instead
#
# Market Watch is built and tested with Claude Code (example 1). Any other AI
# command-line tool can be linked instead (examples 2-4, not tested here: check
# each tool's own documentation). Uncomment ONE example and adjust it.
#
# Example 1: Claude Code (built and tested with this)
#   install: curl -fsSL https://claude.ai/install.sh | bash   then run: claude  (log in)
# AI_COMMAND=/Users/you/.local/bin/claude
# AI_ARGS=-p {prompt} --output-format json --model {model} --effort medium --tools "" --strict-mcp-config --settings '{"disableAllHooks":true}'
# AI_MODEL=claude-sonnet-5-5
# AI_OUTPUT=json:result
# AI_ERROR_FIELD=is_error
# AI_STRIP_ENV=ANTHROPIC_API_KEY,ANTHROPIC_AUTH_TOKEN
#
# Example 2: Google Gemini CLI   (npm install -g @google/gemini-cli, then run: gemini)
# AI_COMMAND=/usr/local/bin/gemini
# AI_ARGS=-p {prompt} -m {model} --output-format json
# AI_MODEL=gemini-2.5-pro
# AI_OUTPUT=json:response
# AI_ERROR_FIELD=error
#
# Example 3: OpenAI Codex CLI    (npm install -g @openai/codex, then run: codex login)
# AI_COMMAND=/usr/local/bin/codex
# AI_ARGS=exec --skip-git-repo-check -m {model} {prompt}
# AI_MODEL=gpt-5
# AI_OUTPUT=text
#
# Example 4: Ollama, a free model on your own computer (https://ollama.com, then: ollama pull llama3.1)
# AI_COMMAND=/usr/local/bin/ollama
# AI_ARGS=run {model}
# AI_MODEL=llama3.1
# AI_OUTPUT=text
```

### package.json

```json
{
  "name": "hopeagold-market-watch",
  "version": "2.1.0",
  "private": true,
  "description": "Finds gold and silver coins listed below spot by private sellers on Huuto.net and Tori.fi. Own dashboard on localhost:3002 and phone alerts. Runs on macOS and Raspberry Pi OS.",
  "main": "server.js",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "start": "node server.js",
    "open": "node scripts/open.js",
    "check": "node run.js",
    "try-links": "node try-links.js",
    "dry": "node run.js --no-push",
    "test-push": "node run.js --test-push",
    "summary": "cat data/latest.txt",
    "log": "tail -n 80 data/logs/service.log",
    "test": "node --test test/links.test.js test/check.test.js test/tori.test.js",
    "service:install": "node scripts/service.js install",
    "service:remove": "node scripts/service.js remove",
    "service:restart": "node scripts/service.js restart",
    "service:status": "node scripts/service.js status",
    "service:print": "node scripts/service.js print"
  }
}
```
