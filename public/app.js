// HopeaGold Market Watch dashboard

let S = null; // last /api/state
const filter = { metal: 'all', site: 'all' };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = (dec) => new Intl.NumberFormat('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const eur = (n) => n == null ? '—' : `${nf(Math.abs(n) < 100 ? 2 : 0).format(n)} €`;
const pct = (p) => p == null ? '—' : `${p > 0 ? '+' : ''}${nf(Math.abs(p) < 0.1 ? 1 : 0).format(p * 100)} %`;
const when = (iso) => iso ? new Date(iso).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 60 ? `${Math.max(m, 1)} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
function left(iso) {
  const m = Math.round((new Date(iso) - Date.now()) / 60000);
  if (m <= 0) return 'closed';
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m % 60} min` : `${m} min`;
}
const where = (f) => f.platform === 'huuto' ? (f.saleType === 'auction' ? 'Huuto auction' : 'Huuto buy now') : 'Tori';
const content = (f) => {
  const c = f.content; if (!c) return '';
  return `${c.qty > 1 ? `${c.qty} × ` : ''}${nf(2).format(c.grossG)} g × ${Math.round(c.fineness * 1000)} = ${nf(2).format(c.fineG)} g ${c.metal === 'gold' ? 'Au' : 'Ag'}${c.specLabel ? ` · ${c.specLabel}` : ''}`;
};
const byDiscount = (a, b) => (a.premium ?? 0) - (b.premium ?? 0) || (b.savedEur ?? 0) - (a.savedEur ?? 0);
const shown = (f) => (filter.metal === 'all' || f.metal === filter.metal) && (filter.site === 'all' || f.platform === filter.site);

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function load() {
  try { S = await api('/api/state'); } catch { return; }
  render();
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function itemCell(f) {
  return `<td class="item"><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>
    ${f.suspicious ? '<span class="badge b-warn">unusually cheap — check</span>' : ''}
    ${f.userStatus === 'contacted' ? '<span class="badge b-tag">contacted</span>' : ''}
    <div class="small">“${esc(f.title)}”</div>
    <div class="small">${esc(content(f))}</div>
    ${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}</td>`;
}

function actions(f) {
  return `<div class="acts" data-key="${esc(f.key)}">
    <button class="btn${f.userStatus === 'contacted' ? ' on' : ''}" data-act="${f.userStatus === 'contacted' ? 'reset' : 'contacted'}">${f.userStatus === 'contacted' ? '✓ Contacted' : 'Contacted'}</button>
    <button class="btn" data-act="bought">Bought</button>
    <button class="btn" data-act="dismissed">Not interested</button></div>`;
}

const extra = (f) => `${f.deliveryPrice ? `<div class="small">+ shipping ${eur(f.deliveryPrice)}</div>` : ''}<div class="small">${esc(f.location || '')}</div>`;

// ── Tabs ────────────────────────────────────────────────────────────────────

function renderDeals(list) {
  const cat1 = [...list.filter(f => f.category === 'buy').sort(byDiscount), ...list.filter(f => f.category === 'offer').sort(byDiscount)].filter(shown);
  const auc = list.filter(f => f.category === 'auction').sort(byDiscount).filter(shown);
  const d = S.deals;
  const chip = (g, v, l) => `<button class="chip${filter[g] === v ? ' active' : ''}" data-filter="${g}" data-val="${v}">${l}</button>`;

  $('tab-deals').innerHTML = `
    <div class="filters">${chip('metal', 'all', 'Gold + silver')}${chip('metal', 'gold', 'Gold')}${chip('metal', 'silver', 'Silver')}<span class="gap"></span>${chip('site', 'all', 'Huuto + Tori')}${chip('site', 'huuto', 'Huuto')}${chip('site', 'tori', 'Tori')}</div>

    <h2>CATEGORY 1 — BUY NOW · Huuto buy-now + Tori</h2>
    <p class="lead">BUY NOW = price below metal value. OFFER = up to +${Math.round(d.offerMaxPremium * 100)} % over (or no price) and the seller takes offers: offer ${Math.round(d.offerDiscount * 100)} % under metal value, never above it. Most below spot first.</p>
    ${cat1.length ? `<div class="wrap"><table>
      <thead><tr><th>#</th><th>Action</th><th>Coin</th><th class="num">Price</th><th class="num">Metal value</th><th class="num">vs spot</th><th class="num">You save</th><th>Where</th><th>Listed</th><th></th></tr></thead>
      <tbody>${cat1.map((f, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td>${f.category === 'buy' ? '<span class="badge b-buy">BUY NOW</span>' : `<span class="badge b-offer">OFFER ${eur(f.offerPrice)}</span><div class="small">max ${eur(f.maxPrice)}</div>`}</td>
        ${itemCell(f)}
        <td class="num">${f.price > 0 ? eur(f.price) : '<span class="small">no price</span>'}</td>
        <td class="num">${eur(f.meltEur)}</td>
        <td class="num ${f.premium < 0 ? 'good' : ''}">${pct(f.premium)}</td>
        <td class="num ${f.category === 'buy' ? 'good' : ''}">${f.category === 'buy' ? eur(f.savedEur) : `<span class="small">at offer ${eur(f.meltEur - f.offerPrice)}</span>`}</td>
        <td>${where(f)}${extra(f)}</td>
        <td class="small">${ago(f.listedAt)}</td>
        <td>${actions(f)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nothing below spot right now.</p>'}

    <h2>CATEGORY 2 — HUUTO AUCTIONS below spot (from your Huuto link)</h2>
    <p class="lead">Auctions in your Huuto link whose current price is below the metal value. Bid at most the max bid (= metal value). Final prices usually rise near the close — your phone gets a ⏰ BID alert on the last check before each closes.</p>
    ${auc.length ? `<div class="wrap"><table>
      <thead><tr><th>#</th><th>Coin</th><th class="num">Now</th><th class="num">Metal value</th><th class="num">vs spot</th><th class="num">Save now</th><th class="num">Max bid</th><th>Time left</th><th></th></tr></thead>
      <tbody>${auc.map((f, i) => `<tr>
        <td class="n">${i + 1}</td>${itemCell(f)}
        <td class="num">${eur(f.price)}<div class="small">${f.bidders || 0} bids</div></td>
        <td class="num">${eur(f.meltEur)}</td>
        <td class="num good">${pct(f.premium)}</td>
        <td class="num good">${eur(f.savedEur)}</td>
        <td class="num"><b>${eur(f.maxPrice)}</b></td>
        <td><span class="left" data-closing="${esc(f.closingTime)}">${left(f.closingTime)}</span><div class="small">closes ${when(f.closingTime)}</div>${extra(f)}</td>
        <td>${actions(f)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No auctions below spot right now.</p>'}`;
  $('cDeals').textContent = list.filter(f => ['buy', 'offer', 'auction'].includes(f.category)).length || '';
}

function renderCheck(list) {
  const rows = list.filter(f => f.category === 'check').sort(byDiscount);
  $('cCheck').textContent = rows.length || '';
  $('tab-check').innerHTML = `
    <h2>CHECK WEIGHT FIRST</h2>
    <p class="lead">These would be deals, but the metal content is an AI estimate (or it's unclear if the price is per piece). Open the listing, then enter the weight and fineness it states — the coin moves to Deals with the real numbers. Never sent to your phone until confirmed.</p>
    ${rows.length ? `<div class="wrap"><table>
      <thead><tr><th>Coin</th><th class="num">Price</th><th class="num">Est. metal</th><th class="num">vs spot</th><th>Where</th><th>Confirm from the listing</th></tr></thead>
      <tbody>${rows.map(f => `<tr>${itemCell(f)}
        <td class="num">${f.price > 0 ? eur(f.price) : '—'}</td>
        <td class="num">${eur(f.meltEur)}</td>
        <td class="num">${pct(f.premium)}</td>
        <td>${where(f)}${f.saleType === 'auction' ? `<div class="small">${left(f.closingTime)} left</div>` : ''}<div class="small">${esc(f.checkReason)}</div></td>
        <td><div class="confirm" data-key="${esc(f.key)}">
          <input type="number" step="0.01" min="0" placeholder="grams" value="${f.content?.grossG ?? ''}" data-f="grossG">
          <input type="number" step="1" min="1" max="1000" placeholder="925" value="${f.content ? Math.round(f.content.fineness * 1000) : ''}" data-f="fineness">
          <input type="number" step="1" min="1" placeholder="pieces" value="${f.content?.qty ?? 1}" data-f="qty">
          <button class="btn" data-confirm>Confirm</button>
          <button class="btn" data-act="dismissed">Not silver/gold</button>
          <span class="err-text"></span></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nothing to check.</p>'}`;
}

function renderHistory() {
  const row = (b) => `<tr><td class="item"><a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.name)}</a><div class="small">${esc(b.platform === 'huuto' ? (b.saleType === 'auction' ? 'Huuto auction' : 'Huuto') : 'Tori')}</div></td>
    <td class="num">${eur(b.price)}</td><td class="num">${eur(b.meltEur)}</td><td class="num good">${b.meltEur && b.price ? eur(b.meltEur - b.price) : '—'}</td>
    <td class="small">${when(b.at)}</td><td><div class="acts" data-key="${esc(b.key)}"><button class="btn" data-act="reset">Undo</button></div></td></tr>`;
  const table = (list, empty) => list.length ? `<div class="wrap"><table><thead><tr><th>Coin</th><th class="num">Price</th><th class="num">Metal value</th><th class="num">Saved</th><th>When</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : `<p class="empty">${empty}</p>`;
  const total = S.bought.reduce((a, b) => a + (b.meltEur && b.price ? b.meltEur - b.price : 0), 0);
  $('tab-history').innerHTML = `
    <h2>BOUGHT</h2><p class="lead">Coins you marked as bought${S.bought.length ? ` — ${S.bought.length} coins, saved ${eur(total)} vs spot at the time` : ''}. Kept permanently.</p>
    ${table(S.bought, 'Nothing marked as bought yet.')}
    <h2>NOT INTERESTED</h2><p class="lead">Hidden from Deals and never alerted again.</p>
    ${table(S.hidden, 'Nothing hidden.')}`;
}

function renderRuns() {
  $('tab-runs').innerHTML = `
    <h2>RUNS</h2><p class="lead">Every check, newest first. Scheduled at ${S.settings.runHours.map(h => `${h}:00`).join(', ')}.</p>
    <div class="wrap"><table><thead><tr><th>When</th><th>Why</th><th class="num">Took</th><th>Scanned</th><th>Excluded</th><th>Result</th></tr></thead><tbody>
    ${S.runs.map(r => { const s = r.stats || {}; return `<tr>
      <td class="small">${when(r.at)}</td><td class="small">${esc(r.reason)}</td><td class="num small">${r.durationSec ?? '—'} s</td>
      <td class="small">${s.huuto != null ? `Huuto ${s.huuto} · Tori ${s.tori} · new ${s.newListings ?? '—'}` : '—'}</td>
      <td class="small">${s.catawiki != null ? `Catawiki ${s.catawiki} · companies ${(s.toriBusiness || 0) + (s.huutoBusiness || 0)} · wanted ${s.wanted || 0}` : '—'}</td>
      <td class="small">${r.error ? `<span class="err-text">${esc(r.error)}</span>` : esc(r.summary || '')}</td></tr>`; }).join('')}
    </tbody></table></div>`;
}

function renderSettings() {
  const st = S.settings;
  const hours = Array.from({ length: 24 }, (_, h) => `<label><input type="checkbox" name="hour" value="${h}" ${st.runHours.includes(h) ? 'checked' : ''}>${String(h).padStart(2, '0')}</label>`).join('');
  $('tab-settings').innerHTML = `<form class="form" id="settingsForm">
    <fieldset><legend>Run hours (local time)</legend><div class="hours">${hours}</div></fieldset>
    <fieldset><legend>Prices</legend>
      <label>Suggest an OFFER when the asking price is at most <input type="number" name="offerMaxPremium" min="0" max="100" step="1" value="${Math.round(st.offerMaxPremium * 100)}"> % over metal value</label>
      <label>Suggested offer = metal value minus <input type="number" name="offerDiscount" min="0" max="50" step="1" value="${Math.round(st.offerDiscount * 100)}"> %</label>
      <label>Mark "unusually cheap — check" when more than <input type="number" name="suspicious" min="10" max="95" step="5" value="${Math.round(-st.suspicious * 100)}"> % under spot</label>
    </fieldset>
    <fieldset class="links">
      <legend>Your two links</legend>
      <p class="dim">Market Watch watches exactly these two places. Buy-now and auction listings both count.</p>
      <h3>1. Tori: paste a Tori search link</h3>
      <ol class="steps">
        <li>On <b>tori.fi</b> search or filter what you want (category, price, location, words).</li>
        <li>Copy the full address from the browser bar, from <code>https://</code> to the end.</li>
        <li>Paste it below and press <b>Save settings</b>. Don't add <code>sort=</code>: Tori doesn't allow it.</li>
      </ol>
      <label class="wide">Tori link <input type="text" name="toriUrl" value="${esc(st.toriUrl)}" placeholder="https://www.tori.fi/recommerce/forsale/search?…"></label>
      <h3>2. Huuto: your three searches</h3>
      <p class="dim">Paste each Huuto search address (from huuto.net, with its category). Buy-now and auction listings in them both count. Choose which metals you want from each one.</p>
      ${[0, 1, 2].map(k => {
        const row = (st.huutoLinks || [])[k] || { url: '', metals: [] };
        const m = row.metals || [];
        const sel = m.includes('gold') && m.includes('silver') ? 'both' : m.includes('silver') ? 'silver' : m.includes('gold') ? 'gold' : 'both';
        return `<div class="huuto-row"><label class="wide">Huuto link ${k + 1} <input type="text" name="huutoUrl${k}" value="${esc(row.url || '')}" placeholder="https://www.huuto.net/haku?category=…"></label>
          <label>Metals <select name="huutoMetals${k}"><option value="both" ${sel === 'both' ? 'selected' : ''}>gold and silver</option><option value="silver" ${sel === 'silver' ? 'selected' : ''}>silver only</option><option value="gold" ${sel === 'gold' ? 'selected' : ''}>gold only</option></select></label></div>`;
      }).join('')}
    </fieldset>
    <fieldset><legend>Phone alerts (ntfy)</legend>
      <label>Topic <input type="text" name="ntfyTopic" value="${esc(st.ntfyTopic)}" placeholder="${esc(S.ntfy.fromEnv ? S.ntfy.topic : '')}"></label>
      <div class="dim">In use: <b>${esc(S.ntfy.topic || 'none')}</b>${S.ntfy.fromEnv ? ' (from .env)' : ''}. Subscribe to exactly this topic in the ntfy iPhone app. Leave empty to use .env.</div>
      <label><input type="checkbox" name="dailySummary" ${st.dailySummary !== false ? 'checked' : ''}> ☀️ Morning summary on the first check of the day</label>
      <div class="dim">Always sent: 🟢 BUY NOW (one alert per deal), 💬 offers (one summary), ⏰ auctions on the last check before they close.</div>
      <p><button type="button" class="btn" id="testPush">Send test alert</button> <button type="button" class="btn" id="resend">Send open deals to my phone</button> <span id="pushMsg"></span></p>
    </fieldset>
    <button class="btn gold" type="submit">Save settings</button> <span id="saveMsg"></span>
  </form>`;
}

function render() {
  if (!S) return;
  const s = S.spot;
  $('spot').innerHTML = s ? `<span><b class="g">Gold</b> ${eur(s.gold.eurOz)}/oz · ${eur(s.gold.eurG)}/g</span><span><b class="s">Silver</b> ${nf(2).format(s.silver.eurOz)} €/oz · ${nf(3).format(s.silver.eurG)} €/g</span><span class="dim">spot ${when(s.at)}</span>` : '<span class="dim">No spot price yet</span>';
  renderStatus(S.running);
  const last = S.runs[0];
  const lr = $('lastRun');
  lr.classList.toggle('hidden', !last);
  if (last) {
    lr.classList.toggle('err', !!last.error);
    lr.innerHTML = last.error ? `<b>Last check ${when(last.at)} failed:</b> ${esc(last.error)} — showing the previous results; the next run retries.` : `<b>Last check ${when(last.at)}:</b> ${esc(last.summary || '')}`;
  }
  const active = S.findings;
  renderDeals(active);
  renderCheck(active);
  renderHistory();
  renderRuns();
  if (!document.activeElement?.closest('#settingsForm')) renderSettings();
}

function renderStatus(running) {
  const st = $('runStatus');
  st.classList.toggle('busy', !!running);
  st.textContent = running ? `⏳ ${running.stage || 'Running'}…` : (S ? `Next check ${when(S.nextRunAt)}` : '');
  $('runNow').disabled = !!running;
}

// ── Events ──────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `tab-${t.dataset.tab}`));
}));

$('runNow').addEventListener('click', async () => {
  try { await api('/api/run', {}); renderStatus({ stage: 'Starting' }); } catch (e) { alert(e.message); }
});

document.querySelector('main').addEventListener('click', async (e) => {
  const chip = e.target.closest('[data-filter]');
  if (chip) { filter[chip.dataset.filter] = chip.dataset.val; return render(); }

  const act = e.target.closest('[data-act]');
  if (act) {
    const key = act.closest('[data-key]').dataset.key;
    try { await api('/api/action', { key, action: act.dataset.act }); await load(); } catch (err) { alert(err.message); }
    return;
  }

  const conf = e.target.closest('[data-confirm]');
  if (conf) {
    const box = conf.closest('[data-key]');
    const val = (f) => box.querySelector(`[data-f="${f}"]`).value;
    try {
      await api('/api/confirm', { key: box.dataset.key, grossG: val('grossG'), fineness: val('fineness'), qty: val('qty') });
      await load();
    } catch (err) { box.querySelector('.err-text').textContent = err.message; }
    return;
  }

  if (e.target.id === 'resend') {
    const msg = $('pushMsg');
    msg.className = ''; msg.textContent = 'Sending…';
    try { const r = await api('/api/resend', {}); msg.className = 'ok-text'; msg.textContent = `Sent: ${r.sent.buy} buy now, ${r.sent.offer} offers, ${r.sent.auction} auctions.`; }
    catch (err) { msg.className = 'err-text'; msg.textContent = err.message; }
    return;
  }

  if (e.target.id === 'testPush') {
    const msg = $('pushMsg');
    msg.className = ''; msg.textContent = 'Sending…';
    try { await api('/api/test-push', {}); msg.className = 'ok-text'; msg.textContent = 'Sent — check your phone.'; }
    catch (err) { msg.className = 'err-text'; msg.textContent = err.message; }
  }
});

document.querySelector('main').addEventListener('submit', async (e) => {
  if (e.target.id !== 'settingsForm') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const msg = $('saveMsg');
  try {
    await api('/api/settings', {
      runHours: fd.getAll('hour').map(Number),
      toriUrl: fd.get('toriUrl'),
      huutoLinks: [0, 1, 2].map(k => ({
        url: fd.get(`huutoUrl${k}`),
        metals: { both: ['gold', 'silver'], silver: ['silver'], gold: ['gold'] }[fd.get(`huutoMetals${k}`)] || [],
      })),
      offerMaxPremium: Number(fd.get('offerMaxPremium')) / 100,
      offerDiscount: Number(fd.get('offerDiscount')) / 100,
      suspicious: -Number(fd.get('suspicious')) / 100,
      ntfyTopic: fd.get('ntfyTopic'),
      dailySummary: fd.get('dailySummary') === 'on',
    });
    msg.className = 'ok-text'; msg.textContent = 'Saved.';
    document.activeElement?.blur();
    await load();
  } catch (err) { msg.className = 'err-text'; msg.textContent = err.message; }
});

// Live: run progress + refresh after each run; countdowns every 30 s
const ev = new EventSource('/api/events');
ev.addEventListener('status', (e) => { const d = JSON.parse(e.data); if (S) S.running = d.running; renderStatus(d.running); });
ev.addEventListener('update', () => load());
setInterval(() => document.querySelectorAll('[data-closing]').forEach(el => { el.textContent = left(el.dataset.closing); }), 30000);

load();
