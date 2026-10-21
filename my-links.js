// YOUR LINKS — put your own Tori and Huuto searches here (README → "Your links").
// The dashboard (Settings → Your links) can change them too; Settings wins.
// Test them without alerts or saving anything:  npm run try-links

module.exports = {
  // 1. TORI: the full address of a Tori search, copied from your browser. Any
  //    filters work (category, price, location, search words). It must start with
  //    https://www.tori.fi/recommerce/forsale/search and must not contain "sort="
  //    (Tori's robots.txt forbids it). Example: the coins and banknotes category.
  tori: 'https://www.tori.fi/recommerce/forsale/search?product_category=2.86.285.138',

  // 2. HUUTO: up to three searches. Each is one Huuto category; buy-now AND
  //    auction listings in it are checked. "metals" = which metals count in that
  //    category (a coin of another metal is dropped). Find a category number in
  //    the address of a Huuto category page: huuto.net/haku?category=<number>
  huuto: [
    { url: 'https://www.huuto.net/haku?category=1166&sort=newest', category: 1166, metals: ['gold', 'silver'] }, // gold coins and bars
    { url: 'https://www.huuto.net/haku?sort=newest&category=1165', category: 1165, metals: ['gold', 'silver'] }, // foreign commemoratives
    { url: 'https://www.huuto.net/haku?sort=newest&category=260', category: 260, metals: ['silver'] },            // foreign coins: silver only
  ],
};
