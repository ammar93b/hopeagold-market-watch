// Your choices from the dashboard, kept apart from findings.json so a run in
// progress can never overwrite them (data/decisions.json).
//   status: contacted | bought | dismissed
//   confirm: { grossG, fineness, qty } — your own reading of the listing's weight
// A snapshot of the listing is kept, so "Bought" history outlives the 7-day findings.

const store = require('./store');

const load = () => store.load('decisions', {});

function snapshot(f) {
  return f ? { name: f.name, url: f.url, platform: f.platform, saleType: f.saleType, price: f.price, meltEur: f.meltEur, metal: f.metal } : null;
}

function setStatus(key, status, finding) {
  const all = load();
  if (status === 'reset') { if (all[key]) delete all[key].status; }
  else all[key] = { ...(all[key] || {}), status, at: new Date().toISOString(), snapshot: snapshot(finding) || all[key]?.snapshot };
  if (all[key] && !all[key].status && !all[key].confirm) delete all[key];
  store.save('decisions', all);
  return all[key] || null;
}

function confirmWeight(key, { grossG, fineness, qty }, finding) {
  const g = Number(grossG);
  let fin = Number(fineness);
  if (fin > 1) fin /= 1000;
  const q = Math.max(1, Math.round(Number(qty) || 1));
  if (!(g > 0 && g < 100000)) throw new Error('Weight must be grams, e.g. 24 or 24.2');
  if (!(fin > 0 && fin <= 1)) throw new Error('Fineness must be like 925, 0.925 or 500');
  const all = load();
  all[key] = { ...(all[key] || {}), confirm: { grossG: g, fineness: fin, qty: q, at: new Date().toISOString() }, snapshot: snapshot(finding) || all[key]?.snapshot };
  store.save('decisions', all);
  return all[key];
}

// Puts your status and confirmed weights onto the findings (before valuing)
function apply(findings, all = load()) {
  for (const f of findings) {
    const d = all[f.key];
    f.userStatus = d?.status || null;
    if (d?.confirm && f.content) {
      const { grossG, fineness, qty } = d.confirm;
      f.content = { ...f.content, grossG, fineness, qty, fineG: grossG * fineness * qty, estimate: false, specLabel: 'weight confirmed by you' };
      f.priceBasis = 'total';
    }
  }
  return findings;
}

module.exports = { load, setStatus, confirmWeight, apply };
