// Your links: the Tori address rules, the three Huuto links, and page addresses.
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkToriUrl, checkHuutoLinks } = require('../src/settings');
const { toriPageUrl } = require('../src/sources');

const TORI = 'https://www.tori.fi/recommerce/forsale/search?product_category=2.86.285.138';

test('a Tori search address is accepted and keeps its filters', () => {
  const u = checkToriUrl(`${TORI}&q=hopea&price_to=500`);
  assert.match(u, /product_category=2\.86\.285\.138/);
  assert.match(u, /q=hopea/);
  assert.match(u, /price_to=500/);
});

test('a page number in the pasted link is dropped (the service adds its own)', () => {
  assert.doesNotMatch(checkToriUrl(`${TORI}&page=4`), /page=/);
});

test('Tori links that Tori forbids or that are not Tori searches are refused', () => {
  assert.throws(() => checkToriUrl(`${TORI}&sort=price_asc`), /Remove "sort="/);
  assert.throws(() => checkToriUrl('https://www.huuto.net/haku?x=1'), /Tori search address/);
  assert.throws(() => checkToriUrl('http://www.tori.fi/recommerce/forsale/search?q=x'), /Tori search address/);
  assert.throws(() => checkToriUrl('https://evil.example/recommerce/forsale/search?q=x'), /Tori search address/);
  assert.throws(() => checkToriUrl('tori hopea'), /full address/);
  assert.throws(() => checkToriUrl(''), /Paste your Tori link/);
});

test('page addresses keep every filter and add the page number', () => {
  assert.equal(toriPageUrl(TORI, 1), TORI);
  assert.equal(toriPageUrl(TORI, 3), `${TORI}&page=3`);
  assert.equal(toriPageUrl('https://www.tori.fi/recommerce/forsale/search?q=hopea', 2),
    'https://www.tori.fi/recommerce/forsale/search?q=hopea&page=2');
});

test('the three Huuto links: each becomes its category with its metals', () => {
  const links = checkHuutoLinks([
    { url: 'https://www.huuto.net/haku?category=1166&sort=newest', metals: ['gold', 'silver'] },
    { url: 'https://www.huuto.net/haku?sort=newest&category=1165', metals: ['gold', 'silver'] },
    { url: 'https://www.huuto.net/haku?sort=newest&category=260', metals: ['silver'] },
  ]);
  assert.deepEqual(links.map(l => l.category), [1166, 1165, 260]);
  assert.deepEqual(links[2].metals, ['silver']);
});

test('empty Huuto rows are ignored; a row without metals or category is refused', () => {
  const links = checkHuutoLinks([
    { url: '', metals: [] },
    { url: 'https://www.huuto.net/haku?category=260', metals: ['silver'] },
  ]);
  assert.equal(links.length, 1);
  assert.throws(() => checkHuutoLinks([{ url: 'https://www.huuto.net/haku?category=260', metals: [] }]), /gold, silver, or both/);
  assert.throws(() => checkHuutoLinks([{ url: 'https://www.huuto.net/haku?sort=newest', metals: ['gold'] }]), /needs a category/);
  assert.throws(() => checkHuutoLinks([{ url: 'https://www.tori.fi/haku?category=260', metals: ['gold'] }]), /Huuto search address/);
  assert.throws(() => checkHuutoLinks([]), /at least one Huuto link/);
  assert.throws(() => checkHuutoLinks(Array.from({ length: 4 }, () => ({ url: 'https://www.huuto.net/haku?category=260', metals: ['gold'] }))), /At most three/);
});

test('two Huuto links with the same category are refused', () => {
  assert.throws(() => checkHuutoLinks([
    { url: 'https://www.huuto.net/haku?category=260', metals: ['silver'] },
    { url: 'https://www.huuto.net/haku?sort=newest&category=260', metals: ['gold'] },
  ]), /same category/);
});
