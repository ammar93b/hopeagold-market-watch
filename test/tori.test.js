// Tori: company badges on search cards, and sold/removed listings.
// The snippets copy Tori's real markup (checked 18 Oct 2026).
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseToriPage, parseToriItem } = require('../src/sources');

// One search card, with an optional company element and an optional extra label
function card(id, { company = null, label = null } = {}) {
  return `<a class="sf-search-ad-link" href="#"><div><span>12,50 €</span></div><h2 class="h4" id="search-ad-${id}-x">1 markka 1874</h2>`
    + `<div><span class="whitespace-nowrap truncate mr-8">Helsinki</span><span class="whitespace-nowrap">3 t</span></div>`
    + (label ? `<div class="flex"><span>${label}</span></div>` : '')
    + (company ? `</div><div class="mt-4 sm:mt-8 text-xs s-text-subtle truncate"><span>${company}</span></div>` : '')
    + `<div class="flex flex-wrap justify-between flex-col"></div><span class="sr-only">Lisää suosikkeihin</span></a>`;
}

test('a company card is a company; a private card is not', () => {
  const [shop, person] = parseToriPage(card(1, { company: 'Kultakolikko.fi' }) + card(2));
  assert.equal(shop.business, 'Kultakolikko.fi');
  assert.equal(person.business, null);
  assert.equal(person.price, 12.5);
  assert.equal(person.ageMin, 180);
});

test('another label on a private card (e.g. shipping) is not a company', () => {
  const [c] = parseToriPage(card(3, { label: 'Toimitus' }));
  assert.equal(c.business, null);
});

test('Catawiki is recognized by its seller element', () => {
  const [c] = parseToriPage(card(4, { company: 'Catawiki' }));
  assert.equal(c.business, 'Catawiki');
});

test('a listing page: open with its price, or closed when Tori marks it disposed', () => {
  const page = (disposed) => `<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","offers":{"@type":"Offer","price": "200","priceCurrency": "EUR","availability":"https://schema.org/InStock"}}</script>`
    + `<script>window.__s="{\\"images\\":[],\\"disposed\\":${disposed},\\"adViewTypeLabel\\":\\"Myydään\\"}"</script>`
    + `<div data-testid="description"><div class="whitespace-pre-wrap">Hopeinen&nbsp;raha &amp; kotelo</div></div>`;
  assert.deepEqual(parseToriItem(page(false)), { status: 'open', description: 'Hopeinen raha & kotelo', price: 200 });
  assert.equal(parseToriItem(page(true)).status, 'closed');
  assert.equal(parseToriItem('<html>no data</html>').status, 'open');
});

test('the price comes from the listing\'s own Product data, not another price on the page', () => {
  const page = `<script type="application/ld+json">{"@type":"Organization","price":"9"}</script>`
    + `<script type="application/ld+json">{"@type":"Product","offers":{"price":"145,50","availability":"https://schema.org/InStock"}}</script>`
    + `<script>x="{\\"price\\":3,\\"disposed\\":true,\\"other\\":1}"</script>`;
  const r = parseToriItem(page);
  assert.equal(r.price, 145.5);
  assert.equal(r.status, 'open'); // a "disposed" flag of another object doesn't close the ad
});

test('Tori marks a sold listing by availability too', () => {
  const page = `<script type="application/ld+json">{"@type":"Product","offers":{"price":"20","availability":"https://schema.org/SoldOut"}}</script>`;
  assert.equal(parseToriItem(page).status, 'closed');
});
