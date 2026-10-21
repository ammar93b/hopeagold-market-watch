// TITLE RULES — anyone can edit this file (see rules/README.md).
//
// A listing title that matches a rule is a known gold/silver coin: it always
// goes on to be identified, and its weight and fineness come from
// rules/coin-specs.js (the id in the first column must exist there).
//
// One rule = [coin id, title pattern, first year, last year, (optional) words
// that must also be in the title]. The title must contain a year in range.
// After a change: npm test, then npm run try-links to see it on real listings.

// [specId, denomination regex, from year, to year, extra context regex]
const RULES = [
  ['fi-25p-1865-1917',   /\b25\s*(p|penni|penniä|pennin|pennia)\b/i, 1865, 1917],
  ['fi-50p-1864-1917',   /\b50\s*(p|penni|penniä|pennin|pennia)\b/i, 1864, 1917],
  ['fi-1mk-1864-1915',   /(^|\D)1\s*(mk|markka|markan)\b|^markka\b/i, 1864, 1915],
  ['fi-1mk-1964-1968',   /(^|\D)1\s*(mk|markka|markan)\b|^markka\b|hopeamarkk/i, 1964, 1968],
  ['fi-2mk-1865-1908',   /(^|\D)2\s*(mk|markkaa|markan)\b/i, 1865, 1908],
  ['fi-10mk-1878-1913',  /(^|\D)10\s*(mk|markkaa|markan)\b/i, 1878, 1913],
  ['fi-20mk-1878-1913',  /(^|\D)20\s*(mk|markkaa|markan)\b/i, 1878, 1913],
  ['fi-100mk-1956-1960', /(^|\D)100\s*(mk|markkaa|markan)\b/i, 1956, 1960],
  ['fi-200mk-1956-1959', /(^|\D)200\s*(mk|markkaa|markan)\b/i, 1956, 1959],
  ['fi-500mk-1951-1952', /(^|\D)500\s*(mk|markkaa|markan)\b/i, 1951, 1952],
  ['fi-1000mk-1960',     /(^|\D)1\s?000\s*(mk|markkaa|markan)\b/i, 1960, 1960],
  ['fi-10mk-1967',       /(^|\D)10\s*(mk|markkaa|markan)\b/i, 1967, 1967],
  ['fi-10mk-1970',       /(^|\D)10\s*(mk|markkaa|markan)\b/i, 1970, 1970],
  ['fi-10mk-1975',       /(^|\D)10\s*(mk|markkaa|markan)\b/i, 1975, 1975],
  ['fi-25mk-1978',       /(^|\D)25\s*(mk|markkaa|markan)\b/i, 1978, 1978],
  ['fi-1000mk-1992',     /(^|\D)1\s?000\s*(mk|markkaa|markan)\b/i, 1992, 1992],

  // Sweden (needs a Swedish word, or a pre-1940 Scandinavian one for the union coins)
  ['se-1kr-1942-1968',   /\b1\s*(krona|kruunu|kr)\b/i, 1942, 1968, /ruots|swed|sverige|krona\b/i],
  ['se-2kr-1942-1966',   /\b2\s*(kronor|kruunua|kr)\b/i, 1942, 1966, /ruots|swed|sverige|kronor/i],
  ['se-5kr-1954-1971',   /\b5\s*(kronor|kruunua|kr)\b/i, 1954, 1971, /ruots|swed|sverige|kronor/i],
  ['se-50ore-1943-1961', /\b50\s*(öre|ore)\b/i, 1943, 1961, /ruots|swed|sverige|öre/i],
  ['se-25ore-1943-1961', /\b25\s*(öre|ore)\b/i, 1943, 1961, /ruots|swed|sverige|öre/i],
  ['se-10ore-1942-1962', /\b10\s*(öre|ore)\b/i, 1942, 1962, /ruots|swed|sverige|öre/i],
  ['smu-1kr-1875-1942',  /\b1\s*(krona|krone|kruunu|kr)\b/i, 1875, 1941, /ruots|swed|sverige|tansk|denmark|danmark|norj|norway|norge/i],
  ['smu-2kr-1876-1940',  /\b2\s*(kronor|kroner|kruunua|kr)\b/i, 1876, 1940, /ruots|swed|sverige|tansk|denmark|danmark|norj|norway|norge|kronor|kroner/i],
  ['smu-50ore-1875-1939', /\b50\s*(öre|øre|ore)\b/i, 1875, 1939],
  ['smu-25ore-1874-1941', /\b25\s*(öre|øre|ore)\b/i, 1874, 1941],
  ['smu-10ore-1874-1942', /\b10\s*(öre|øre|ore)\b/i, 1874, 1941],

  // Russia / USSR silver (1931 exists in both silver and cupronickel → left to the AI)
  ['ru-10kop-1867-1930', /\b10\s*(kop|kopeek|kopeekka|kopeekkaa|kopeikka|kopek|kopeks)/i, 1867, 1930],
  ['ru-15kop-1867-1930', /\b15\s*(kop|kopeek|kopeekka|kopeekkaa|kopeikka|kopek|kopeks)/i, 1867, 1930],
  ['ru-20kop-1867-1930', /\b20\s*(kop|kopeek|kopeekka|kopeekkaa|kopeikka|kopek|kopeks)/i, 1867, 1930],
  ['ru-50kop-1886-1927', /\b50\s*(kop|kopeek|kopeekka|kopeekkaa|kopeikka|kopek|kopeks)/i, 1886, 1927],
  ['ru-1rub-1886-1924',  /\b1\s*(rupla|ruplaa|rouble|ruble|rubel)/i, 1886, 1924],

  // USA
  ['us-dollar-1878-1935', /morgan|peace dollar|\b1\s*(dollar|dollari)\b/i, 1878, 1935, /\busa\b|\bus\b|yhdysval|morgan|peace|liberty/i],
  ['us-half-1892-1964',   /half dollar|50\s*(cents|centtiä|c)\b/i, 1892, 1964],
  ['us-quarter-1892-1964', /quarter/i, 1892, 1964],

  // Gold bullion / trade coins
  ['gb-sovereign',      /^(?!.*(half|puoli|½)).*(sovereign|soverei|punnan kulta)/i, 1817, 2030],
  ['gb-half-sovereign', /(half|puoli|½)\s*-?\s*sovereign/i, 1817, 2030],
];

// Titles with these words are never a coin to value (banknotes, copies, plated)
const NOT_COIN = /setel|kopio|replik|jäljenn|kullattu|hopeoitu|plated|faksimile/i;


// Precious-metal words: these titles always go on to be identified
const METAL_WORDS = /hope|kult|\bag\s?\d{3}|\bau\s?\d{3}|\b(925|999|9999|835|830|900)\b|sterling|unssi|\boz\b|harkko|krugerrand|maple leaf|philharmon|britannia|panda|vreneli|ducat|dukaat|sovereign|taaleri|thaler|denaari|denari|drakhm|drachm/i;

// Plated / gilded items: never gold or silver, even with a metal word
const PLATED = /kullattu|hopeoitu|plated/i;

// Facts the AI is told in every prompt (coins it tends to get wrong)
const BASE_METAL = 'Finnish 1, 5 and 10 penniä (all years), markka coins after 1968, 5/10/20 markkaa 1928–1952 and Finnish 5 € commemoratives (bimetallic brass/copper-nickel) are base metal — not silver.';

module.exports = { RULES, NOT_COIN, METAL_WORDS, PLATED, BASE_METAL };
