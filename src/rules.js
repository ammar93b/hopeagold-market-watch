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
