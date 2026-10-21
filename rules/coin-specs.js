// Standard catalogue specs (gross weight in grams × fineness) for common
// circulation and bullion coins. Market Watch uses these instead of the AI's
// own numbers whenever a listing matches one exactly.
//
// Commemoratives are only here when checked one by one: specs vary by year
// (Finnish 100 markkaa is .830 in 1989–91 but .925 in 1996). Anything else is
// an AI estimate: listed under "Check weight first" in the report, never pushed
// (the AI put the 1000 mk 1992 at 15 g of gold — it is 9 g).

const OZ = 31.1035;

module.exports = {
  // ── Finland ──
  'fi-25p-1865-1917':   { label: 'Finland 25 penniä 1865–1917',          metal: 'silver', grossG: 1.2747,  fineness: 0.750 },
  'fi-50p-1864-1917':   { label: 'Finland 50 penniä 1864–1917',          metal: 'silver', grossG: 2.5494,  fineness: 0.750 },
  'fi-1mk-1864-1915':   { label: 'Finland 1 markka 1864–1915',           metal: 'silver', grossG: 5.1828,  fineness: 0.868 },
  'fi-2mk-1865-1908':   { label: 'Finland 2 markkaa 1865–1908',          metal: 'silver', grossG: 10.3657, fineness: 0.868 },
  'fi-100mk-1956-1960': { label: 'Finland 100 markkaa 1956–1960',        metal: 'silver', grossG: 5.2,     fineness: 0.500 },
  'fi-200mk-1956-1959': { label: 'Finland 200 markkaa 1956–1959',        metal: 'silver', grossG: 8.3,     fineness: 0.500 },
  'fi-1mk-1964-1968':   { label: 'Finland 1 markka 1964–1968 (billon)',  metal: 'silver', grossG: 6.4,     fineness: 0.350 },
  'fi-10mk-1878-1913':  { label: 'Finland 10 markkaa gold 1878–1913',    metal: 'gold',   grossG: 3.2258,  fineness: 0.900 },
  'fi-20mk-1878-1913':  { label: 'Finland 20 markkaa gold 1878–1913',    metal: 'gold',   grossG: 6.4516,  fineness: 0.900 },
  // Finnish markka commemoratives — only the ones checked against Numista (11 Oct 2026)
  'fi-500mk-1951-1952': { label: 'Finland 500 markkaa 1951–1952 Olympics',               metal: 'silver', grossG: 12,    fineness: 0.500 },
  'fi-1000mk-1960':     { label: 'Finland 1000 markkaa 1960 markka centenary (Snellman)', metal: 'silver', grossG: 14,    fineness: 0.875 },
  'fi-10mk-1967':       { label: 'Finland 10 markkaa 1967 Independence 50 years',        metal: 'silver', grossG: 24,    fineness: 0.900 },
  'fi-10mk-1970':       { label: 'Finland 10 markkaa 1970 Paasikivi',                    metal: 'silver', grossG: 22.75, fineness: 0.500 },
  'fi-10mk-1975':       { label: 'Finland 10 markkaa 1975 Kekkonen 75 years',            metal: 'silver', grossG: 23.5,  fineness: 0.500 },
  'fi-25mk-1978':       { label: 'Finland 25 markkaa 1978 Lahti ski championships',      metal: 'silver', grossG: 26.3,  fineness: 0.500 },
  'fi-100mk-1989-1991': { label: 'Finland 100 markkaa 1989 Ateneum / 1989 Lahti ski / 1990 War Invalids / 1991 Ice hockey', metal: 'silver', grossG: 24, fineness: 0.830 },
  'fi-1000mk-1992':     { label: 'Finland 1000 markkaa 1992 Independence 75 years (gold)', metal: 'gold', grossG: 9,     fineness: 0.900 },

  // ── Sweden / Denmark / Norway ──
  'smu-10ore-1874-1942':  { label: 'Scandinavian 10 öre/øre silver 1874–1942', metal: 'silver', grossG: 1.45, fineness: 0.400 },
  'smu-25ore-1874-1941':  { label: 'Scandinavian 25 öre/øre 1874–1941',        metal: 'silver', grossG: 2.42, fineness: 0.600 },
  'smu-50ore-1875-1939':  { label: 'Scandinavian 50 öre/øre 1875–1939',        metal: 'silver', grossG: 5.0,  fineness: 0.600 },
  'smu-1kr-1875-1942':    { label: 'Scandinavian 1 krona/krone 1875–1942',     metal: 'silver', grossG: 7.5,  fineness: 0.800 },
  'smu-2kr-1876-1940':    { label: 'Scandinavian 2 kronor/kroner 1876–1940',   metal: 'silver', grossG: 15.0, fineness: 0.800 },
  'se-10ore-1942-1962':   { label: 'Sweden 10 öre 1942–1962',                  metal: 'silver', grossG: 1.44, fineness: 0.400 },
  'se-25ore-1943-1961':   { label: 'Sweden 25 öre 1943–1961',                  metal: 'silver', grossG: 2.32, fineness: 0.400 },
  'se-50ore-1943-1961':   { label: 'Sweden 50 öre 1943–1961',                  metal: 'silver', grossG: 4.8,  fineness: 0.400 },
  'se-1kr-1942-1968':     { label: 'Sweden 1 krona 1942–1968',                 metal: 'silver', grossG: 7.0,  fineness: 0.400 },
  'se-2kr-1942-1966':     { label: 'Sweden 2 kronor 1942–1966',                metal: 'silver', grossG: 14.0, fineness: 0.400 },
  'se-5kr-1954-1971':     { label: 'Sweden 5 kronor 1954–1971',                metal: 'silver', grossG: 18.0, fineness: 0.400 },
  'smu-5kr-gold':         { label: 'Scandinavian 5 kronor gold',               metal: 'gold',   grossG: 2.2401, fineness: 0.900 },
  'smu-10kr-gold':        { label: 'Scandinavian 10 kronor/kroner gold',       metal: 'gold',   grossG: 4.4803, fineness: 0.900 },
  'smu-20kr-gold':        { label: 'Scandinavian 20 kronor/kroner gold',       metal: 'gold',   grossG: 8.9606, fineness: 0.900 },

  // ── Russia / USSR ──
  'ru-5kop-1867-1915':  { label: 'Russia 5 kopeks silver 1867–1915',     metal: 'silver', grossG: 0.8998,  fineness: 0.500 },
  'ru-10kop-1867-1930': { label: 'Russia/USSR 10 kopeks silver 1867–1930', metal: 'silver', grossG: 1.7996, fineness: 0.500 },
  'ru-15kop-1867-1930': { label: 'Russia/USSR 15 kopeks silver 1867–1930', metal: 'silver', grossG: 2.6994, fineness: 0.500 },
  'ru-20kop-1867-1930': { label: 'Russia/USSR 20 kopeks silver 1867–1930', metal: 'silver', grossG: 3.5992, fineness: 0.500 },
  'ru-25kop-1886-1901': { label: 'Russia 25 kopeks 1886–1901',           metal: 'silver', grossG: 4.9989,  fineness: 0.900 },
  'ru-50kop-1886-1927': { label: 'Russia/USSR 50 kopeks 1886–1927',      metal: 'silver', grossG: 9.9977,  fineness: 0.900 },
  'ru-1rub-1886-1924':  { label: 'Russia/USSR 1 rouble 1886–1924',       metal: 'silver', grossG: 19.9954, fineness: 0.900 },
  'ru-5rub-1897-1911':  { label: 'Russia 5 roubles gold 1897–1911',      metal: 'gold',   grossG: 4.3013,  fineness: 0.900 },
  'ru-7.5rub-1897':     { label: 'Russia 7½ roubles gold 1897',          metal: 'gold',   grossG: 6.4519,  fineness: 0.900 },
  'ru-10rub-1898-1911': { label: 'Russia 10 roubles gold 1898–1911',     metal: 'gold',   grossG: 8.6026,  fineness: 0.900 },
  'ru-15rub-1897':      { label: 'Russia 15 roubles gold 1897',          metal: 'gold',   grossG: 12.9039, fineness: 0.900 },
  'su-chervonets':      { label: 'USSR chervonets (10 roubles) gold 1923/1975–1982', metal: 'gold', grossG: 8.6026, fineness: 0.900 },

  // ── UK / Commonwealth ──
  'gb-sovereign':      { label: 'Gold sovereign (full)',  metal: 'gold', grossG: 7.9881, fineness: 0.9167 },
  'gb-half-sovereign': { label: 'Gold half sovereign',    metal: 'gold', grossG: 3.9940, fineness: 0.9167 },

  // ── USA ──
  'us-dollar-1878-1935':  { label: 'US silver dollar (Morgan / Peace) 1878–1935', metal: 'silver', grossG: 26.73, fineness: 0.900 },
  'us-half-1892-1964':    { label: 'US half dollar 1892–1964',                    metal: 'silver', grossG: 12.5,  fineness: 0.900 },
  'us-half-1965-1970':    { label: 'US Kennedy half dollar 1965–1970',            metal: 'silver', grossG: 11.5,  fineness: 0.400 },
  'us-quarter-1892-1964': { label: 'US quarter 1892–1964',                        metal: 'silver', grossG: 6.25,  fineness: 0.900 },
  'us-dime-1892-1964':    { label: 'US dime 1892–1964',                           metal: 'silver', grossG: 2.5,   fineness: 0.900 },
  'us-gold-2.5':          { label: 'US $2.50 gold (pre-1934)',                    metal: 'gold',   grossG: 4.18,   fineness: 0.900 },
  'us-gold-5':            { label: 'US $5 gold (pre-1934)',                       metal: 'gold',   grossG: 8.359,  fineness: 0.900 },
  'us-gold-10':           { label: 'US $10 gold (pre-1934)',                      metal: 'gold',   grossG: 16.718, fineness: 0.900 },
  'us-gold-20':           { label: 'US $20 gold double eagle (pre-1934)',         metal: 'gold',   grossG: 33.436, fineness: 0.900 },

  // ── Latin Monetary Union & Europe gold ──
  'lmu-10fr':           { label: '10 francs/lire gold (LMU, Austria 4 florin)', metal: 'gold', grossG: 3.2258, fineness: 0.900 },
  'lmu-20fr':           { label: '20 francs/lire gold (Napoleon, Vreneli, LMU, Austria 8 florin)', metal: 'gold', grossG: 6.4516, fineness: 0.900 },
  'de-10mark':          { label: 'Germany 10 mark gold 1872–1914',  metal: 'gold', grossG: 3.9825,  fineness: 0.900 },
  'de-20mark':          { label: 'Germany 20 mark gold 1871–1915',  metal: 'gold', grossG: 7.9650,  fineness: 0.900 },
  'nl-10gulden':        { label: 'Netherlands 10 gulden gold',      metal: 'gold', grossG: 6.7290,  fineness: 0.900 },
  'at-1ducat':          { label: 'Austria 1 ducat (incl. restrikes)', metal: 'gold', grossG: 3.4909, fineness: 0.986 },
  'at-4ducat':          { label: 'Austria 4 ducat (incl. restrikes)', metal: 'gold', grossG: 13.9636, fineness: 0.986 },
  'at-10corona':        { label: 'Austria 10 corona gold',          metal: 'gold', grossG: 3.3875,  fineness: 0.900 },
  'at-20corona':        { label: 'Austria 20 corona gold',          metal: 'gold', grossG: 6.7751,  fineness: 0.900 },
  'at-100corona':       { label: 'Austria 100 corona gold',         metal: 'gold', grossG: 33.8753, fineness: 0.900 },
  'mx-50pesos':         { label: 'Mexico 50 pesos gold',            metal: 'gold', grossG: 41.6666, fineness: 0.900 },
  'mx-2pesos':          { label: 'Mexico 2 pesos gold',             metal: 'gold', grossG: 1.6666,  fineness: 0.900 },
  'mt-thaler-1780':     { label: 'Maria Theresa thaler 1780 (restrike)', metal: 'silver', grossG: 28.0668, fineness: 0.8333 },

  // ── Bullion coins by fine weight (Krugerrand, Maple Leaf, Eagle, Philharmonic, Britannia, Kangaroo…) ──
  'gold-1oz':      { label: 'Gold bullion 1 oz',     metal: 'gold',   grossG: OZ,      fineness: 1 },
  'gold-1/2oz':    { label: 'Gold bullion 1/2 oz',   metal: 'gold',   grossG: OZ / 2,  fineness: 1 },
  'gold-1/4oz':    { label: 'Gold bullion 1/4 oz',   metal: 'gold',   grossG: OZ / 4,  fineness: 1 },
  'gold-1/10oz':   { label: 'Gold bullion 1/10 oz',  metal: 'gold',   grossG: OZ / 10, fineness: 1 },
  'gold-1/20oz':   { label: 'Gold bullion 1/20 oz',  metal: 'gold',   grossG: OZ / 20, fineness: 1 },
  'gold-1/25oz':   { label: 'Gold bullion 1/25 oz',  metal: 'gold',   grossG: OZ / 25, fineness: 1 },
  'silver-1oz':    { label: 'Silver bullion 1 oz',   metal: 'silver', grossG: OZ,      fineness: 1 },
};
