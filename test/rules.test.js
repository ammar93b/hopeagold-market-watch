// Checks the files anyone may edit: rules/ and my-links.js. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const COIN_SPECS = require('../rules/coin-specs');
const { RULES, NOT_COIN, METAL_WORDS, PLATED, BASE_METAL } = require('../rules/title-rules');
const DEAL_RULES = require('../rules/deal-rules');
const MY_LINKS = require('../my-links');
const { checkToriUrl, checkHuutoLinks } = require('../src/settings');
const { matchRules, hasMetalWord } = require('../src/rules');

test('coin specs: every coin has a label, metal, weight and fineness', () => {
  for (const [id, c] of Object.entries(COIN_SPECS)) {
    assert.ok(c.label, `${id}: label missing`);
    assert.ok(['gold', 'silver'].includes(c.metal), `${id}: metal must be 'gold' or 'silver'`);
    assert.ok(c.grossG > 0 && c.grossG < 100000, `${id}: grossG must be grams, e.g. 24.2`);
    assert.ok(c.fineness > 0 && c.fineness <= 1, `${id}: fineness must be a decimal, e.g. 0.925`);
  }
});

test('title rules: well formed, and every id exists in rules/coin-specs.js', () => {
  for (const r of RULES) {
    const [id, re, from, to, ctx] = r;
    assert.ok(COIN_SPECS[id], `rule ${id}: no coin with this id in rules/coin-specs.js`);
    assert.ok(re instanceof RegExp, `rule ${id}: the title pattern must be a /regex/`);
    assert.ok(Number.isInteger(from) && Number.isInteger(to) && from <= to, `rule ${id}: years must be first year ≤ last year`);
    assert.ok(ctx === undefined || ctx instanceof RegExp, `rule ${id}: the extra words must be a /regex/`);
  }
  for (const [name, re] of Object.entries({ NOT_COIN, METAL_WORDS, PLATED })) assert.ok(re instanceof RegExp, `${name} must be a /regex/`);
  assert.ok(typeof BASE_METAL === 'string' && BASE_METAL.length > 20, 'BASE_METAL must be the text the AI is told');
});

test('title rules: known examples still match', () => {
  assert.deepStrictEqual(matchRules('Ruotsalainen 1 kruunu 1965 Gustav VI Adolf'), ['se-1kr-1942-1968']);
  assert.deepStrictEqual(matchRules('KULTAKOLIKKO 10MK V.1878'), ['fi-10mk-1878-1913']);
  assert.deepStrictEqual(matchRules('Suomen Pankki 10 markkaa 1945 seteli'), []);
  assert.ok(hasMetalWord('hopeinen 925 mitali'));
  assert.ok(!hasMetalWord('kullattu kolikko'));
});

test('deal rules: values in a sensible range', () => {
  const d = DEAL_RULES.deals;
  assert.ok(d.offerMaxPremium >= 0 && d.offerMaxPremium <= 1, 'offerMaxPremium: 0 to 1 (0.20 = 20 %)');
  assert.ok(d.offerDiscount >= 0 && d.offerDiscount <= 0.5, 'offerDiscount: 0 to 0.5 (0.10 = 10 %)');
  assert.ok(d.suspicious < 0 && d.suspicious >= -0.95, 'suspicious: negative, e.g. -0.5');
  assert.ok(DEAL_RULES.auctionAlertMarginHours >= 0, 'auctionAlertMarginHours: 0 or more');
});

test('my-links.js: the links pass the same checks as the dashboard', () => {
  assert.doesNotThrow(() => checkToriUrl(MY_LINKS.tori));
  assert.doesNotThrow(() => checkHuutoLinks(MY_LINKS.huuto));
});
