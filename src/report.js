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
