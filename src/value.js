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
