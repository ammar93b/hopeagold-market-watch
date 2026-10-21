// AI steps through an AI command-line program on your own account, set in .env:
// AI_COMMAND, AI_ARGS, AI_MODEL, AI_OUTPUT, AI_ERROR_FIELD, AI_STRIP_ENV (README → "AI tool").
// Two jobs: screen titles for gold/silver, identify metal content.
// The AI never sets prices, values or verdicts — code does that (src/value.js).

const { spawn } = require('child_process');
const CFG = require('../config');
const COIN_SPECS = require('../rules/coin-specs');
const { AI, DATA } = require('./env');
const fs = require('fs');

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// AI_ARGS → argument list. "double" or 'single' quotes keep spaces; "" is an empty argument.
function splitArgs(s) {
  return [...String(s).matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3]);
}

// The program's environment, without the variables listed in AI_STRIP_ENV (e.g. API keys
// that would make the program bill an API account instead of your subscription)
function childEnv() {
  const env = { ...process.env };
  for (const k of AI.stripEnv) delete env[k];
  // Tells local tools (e.g. a git-sync hook) that this is Market Watch's own AI call
  env.MARKET_WATCH_AI = '1';
  return env;
}

// Running AI programs, so a stopped check can end them (abortAll)
const running = new Set();
function killTree(child) {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
}
function abortAll() { for (const c of running) killTree(c); running.clear(); }

// Reads one field (a.b.c) from the program's JSON answer
const field = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

// Runs the AI program once. {prompt} and {model} in AI_ARGS are filled in; with no
// {prompt} in AI_ARGS the prompt goes to the program's standard input.
function runAi(prompt) {
  if (!AI.command) return Promise.reject(new Error('No AI program set: add AI_COMMAND (and AI_ARGS, AI_MODEL, AI_OUTPUT) to .env, see README → "AI tool"'));
  if (AI.output !== 'text' && !/^json:.+/.test(AI.output)) return Promise.reject(new Error(`AI_OUTPUT must be "text" or "json:<field>", not "${AI.output}"`));
  const raw = splitArgs(AI.args);
  const viaStdin = !raw.some(a => a.includes('{prompt}'));
  // One pass with a function: "$&" or "{model}" inside listing text are left as they are
  const args = raw.map(a => a.replace(/\{prompt\}|\{model\}/g, (m) => (m === '{prompt}' ? prompt : AI.model)));
  fs.mkdirSync(DATA, { recursive: true });
  return new Promise((resolve, reject) => {
    // cwd = data/ so the program doesn't pick up any project instructions. Its own process
    // group (detached) so a timeout also ends anything it started.
    const child = spawn(AI.command, args, { cwd: DATA, env: childEnv(), detached: true, stdio: [viaStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    running.add(child);
    let out = '';
    let err = '';
    const timer = setTimeout(() => { killTree(child); reject(new Error(`AI timed out after ${CFG.ai.timeoutMs / 60000} min`)); }, CFG.ai.timeoutMs);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(timer); running.delete(child); reject(new Error(`Could not start the AI program at ${AI.command}: ${e.message}`)); });
    if (viaStdin) { child.stdin.on('error', () => {}); child.stdin.end(prompt); }
    child.on('close', (code) => {
      clearTimeout(timer);
      running.delete(child);
      const failed = () => new Error(`AI program exited with code ${code}: ${(err || out).trim().slice(0, 300)}`);
      if (AI.output === 'text') {
        if (code !== 0) return reject(failed());
        return resolve(out.trim());
      }
      let res = null;
      try { res = JSON.parse(out); } catch {}
      if (!res) return reject(failed());
      // e.g. a usage limit ("session limit · resets 4:30am") comes back as an error result
      if (AI.errorField && field(res, AI.errorField)) {
        const e = field(res, AI.errorField);
        return reject(new Error(String(field(res, AI.output.slice(5)) || (typeof e === 'object' ? JSON.stringify(e) : e) || 'AI error')));
      }
      if (code !== 0) return reject(failed());
      resolve(String(field(res, AI.output.slice(5)) ?? ''));
    });
  });
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  for (const c of fenced ? [fenced[1], text] : [text]) {
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try { return JSON.parse(c.slice(start, end + 1)); } catch {}
  }
  return null;
}

async function askJson(prompt) {
  const text = await runAi(prompt);
  const json = extractJson(text);
  if (!json) throw new Error(`AI returned no JSON: "${text.replace(/\s+/g, ' ').slice(0, 200)}"`);
  return json;
}

// ── 1. Screen titles ────────────────────────────────────────────────────────

const { BASE_METAL } = require('../rules/title-rules');

const SCREEN_PROMPT = `You screen new coin listings from two Finnish marketplaces (Huuto.net, Tori.fi) for a gold & silver price tracker.

Return the key of EVERY listing that probably contains real GOLD or SILVER:
- The title says so: kulta, kultaraha, kultainen, kultakolikko, hopea, hopeinen, hopeaa, hopearaha, Au, Ag, 925, 900, 999, 9999, 835, 830, 750, 500 (as fineness), unssi / oz, harkko (bar), sterling.
- Or the coin itself is gold/silver even if the title doesn't say it, e.g. Finnish 25/50 penniä 1865–1917, 1 and 2 markkaa 1864–1915, 100/200 markkaa 1956–1960, 1 markka 1964–1968, 10/20 markkaa 1878–1913 (gold), markka commemoratives (500 mk 1951–52, 1000 mk 1960, 10 mk 1967–1977, 25/50/100 markkaa…), silver 10/20 euro commemoratives, Swedish öre/kronor silver issues before 1969, Russian 5–50 kopeks 1867–1931 and roubles before 1925, thalers and crowns, US silver dollars/halves/quarters/dimes before 1965, Roman denarii, medieval and early-modern European silver (reales, scudi, groschen, …), sovereigns, ducats, Vreneli, Napoleons, Krugerrands and other bullion.
- Lots and collections that likely include silver or gold pieces (e.g. "hopearahoja", "vanhoja kolikoita 1800-luku").
${BASE_METAL}
Exclude: banknotes (setelit), plated (kullattu, hopeoitu, gold/silver plated), copies (kopio, replika, jäljennös), base-metal coins, euro circulation coins and 2 € commemoratives, medals and tokens with no precious metal stated, albums, capsules, books.

Answer with ONLY this JSON: {"keys": ["huuto:123", "tori:456"]}`;

async function screen(items) {
  const keep = new Set();
  for (const batch of chunk(items, CFG.ai.screenBatch)) {
    const lines = batch.map(i => `${i.key} | ${i.title} | ${i.category}`).join('\n');
    const out = await askJson(`${SCREEN_PROMPT}\n\nLISTINGS (key | title | category):\n${lines}`);
    // A reply without the list is a failed call, not "nothing is gold": the check retries
    if (!Array.isArray(out.keys)) throw new Error(`AI answer had no "keys" list: ${JSON.stringify(out).slice(0, 160)}`);
    for (const k of out.keys) keep.add(String(k));
  }
  return items.filter(i => keep.has(i.key));
}

// ── 2. Identify metal content ───────────────────────────────────────────────

const SPEC_LINES = Object.entries(COIN_SPECS).map(([id, s]) => `${id} = ${s.label}`).join('\n');

const IDENTIFY_PROMPT = `You identify the precious-metal content of coin listings from Huuto.net and Tori.fi (Finnish marketplaces). Code will value them at spot — you only identify what the PRICE buys.

SPEC TABLE — standard specs. Give a specId ONLY when the listing names that exact coin (denomination AND the year or type that the spec covers). "100 markkaa juhlarahat" with no year is NOT a match. Never invent ids:
${SPEC_LINES}

For each listing return:
- key: as given
- metal: "gold" | "silver" | "none"   (none = plated, copy, base metal, banknote, or no precious metal after all)
- name: short name of what is sold, e.g. "Sovereign 1871", "1 markka 1874", "Lot: 3× 20 kopeks 1908–1915"
- specId: a SPEC TABLE id, or null
- qty: how many precious-metal pieces the price buys (1 for a single coin)
- grossG, fineness: only when specId is null — weight in grams of ONE piece and fineness as a decimal (0.925). Use the listing's own numbers when it states them, otherwise your catalogue knowledge. A lot sold by total weight ("15,2 g erä"): qty 1, grossG = the total weight.
- estimate: true when grossG/fineness come from your knowledge rather than the listing or the SPEC TABLE, or when the number of silver/gold pieces in a lot is a guess (e.g. "mm. 1 mk 1964–1968" with no count)
- priceBasis: "total" (the price buys all qty pieces), "each" (the price is per piece: "/kpl", "kappalehinta", several identical items for sale at a per-item price), or "unclear"
- note: at most 15 words — what a buyer should know (condition, collector demand, mixed lot, price may be per piece, possible copy…)

Rules: ${BASE_METAL} A "known type (title rule)" line means a fixed rule matched the title to that SPEC TABLE coin, whose specs are verified: it IS gold/silver — use that specId unless the listing clearly shows a different coin or year, a copy or plating. In a mixed lot count only the gold/silver pieces you can identify (estimate: true). Commemoratives not in the SPEC TABLE: use that exact year's specs if you know them (estimate: true). Never give prices, values or opinions on whether it is a good deal.

Answer with ONLY this JSON: {"items": [ { …one object per listing… } ]}`;

function describeSale(i) {
  if (!(i.price > 0)) return `price not shown${i.priceText ? ` ("${i.priceText}")` : ''}`;
  if (i.saleType === 'auction') return `auction, current price ${i.price} € with ${i.bidders || 0} bids${i.buyNowPrice ? `, buy-now ${i.buyNowPrice} €` : ''}`;
  return `buy now ${i.price} €`;
}

async function identify(items) {
  const byKey = new Map();
  for (const batch of chunk(items, CFG.ai.identifyBatch)) {
    const blocks = batch.map(i => [
      `key: ${i.key}`,
      `title: ${i.title}`,
      `category: ${i.category}`,
      `sale: ${describeSale(i)}`,
      i.quantity > 1 ? `quantity for sale: ${i.quantity}` : null,
      i.rules?.length ? `known type (title rule): ${i.rules.map(id => `${id} = ${COIN_SPECS[id].label}`).join('; ')}` : null,
      `description: ${(i.description || '(none)').slice(0, 700)}`,
    ].filter(Boolean).join('\n')).join('\n\n');
    const out = await askJson(`${IDENTIFY_PROMPT}\n\nLISTINGS:\n\n${blocks}`);
    if (!Array.isArray(out.items)) throw new Error(`AI answer had no "items" list: ${JSON.stringify(out).slice(0, 160)}`);
    for (const r of out.items) {
      if (!r?.key) continue;
      // An id the coin table doesn't have is treated as no id, so every later check applies
      if (r.specId && !COIN_SPECS[r.specId]) r.specId = null;
      byKey.set(String(r.key), r);
    }
  }
  return byKey;
}

module.exports = { screen, identify, runAi, splitArgs, abortAll };
