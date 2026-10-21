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
