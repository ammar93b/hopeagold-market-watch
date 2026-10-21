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
