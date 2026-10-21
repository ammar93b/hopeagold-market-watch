# Rules: anyone can update them

Everything Market Watch *decides* lives in this folder, apart from the code, so you can change a rule without reading the program. Your own search links are in [`../my-links.js`](../my-links.js).

| File | What it decides | Example change |
|---|---|---|
| [`coin-specs.js`](coin-specs.js) | Verified weight and fineness of known coins. Only these, or the weight and fineness written in the listing itself, can trigger a phone alert. | Add a coin you see often |
| [`title-rules.js`](title-rules.js) | Which listing titles are a known coin (pattern and year range), which words mean "gold/silver", which mean "not a coin" (banknotes, copies, plated), and the facts the AI is reminded of | Recognise "1 kruunu 1952" as Swedish silver |
| [`deal-rules.js`](deal-rules.js) | When a listing is BUY NOW, OFFER or "unusually cheap", the offer discount, and when auctions are alerted | Offer 15 % under metal value instead of 10 % |

## How to change a rule safely

1. Edit the file (any text editor). Keep the commas and brackets as they are around your change.
2. Run the tests: `npm test`. They catch typos and broken patterns.
3. See the effect on real listings, with nothing saved and no alerts sent:
   `npm run try-links` (or `npm run try-links -- --no-ai` without an AI tool).
4. If the service is running: `npm run service:restart`.

## Adding a coin

**1. Check the facts.** Look up gross weight and fineness on [Numista](https://numista.com) and one more source. Don't copy them from an AI: in testing an AI said the Finnish 1000 markkaa 1992 holds 15 g of gold. It holds 9 g.

**2. Add a line to `coin-specs.js`** with a new id:

```js
'fi-10mk-1971': { label: 'Finland 10 markkaa 1971 European Athletics', metal: 'silver', grossG: 24.2, fineness: 0.500 },
```

**3. Optional: add a title rule in `title-rules.js`** with the same id, so titles like "10 mk 1971" are recognised without the AI:

```js
['fi-10mk-1971', /(^|\D)10\s*(mk|markkaa|markan)\b/i, 1971, 1971],
```

A rule is `[coin id, title pattern, first year, last year, (optional) words that must also appear]`. The title must contain a year in the range. The id must exist in `coin-specs.js`.

## Commemoratives

Commemoratives are only in the table when they were checked one by one, because specs change by year. For example, Finnish 100 markkaa is .830 in 1989–91 but .925 in 1996, and Finnish 10 € coins exist in both .925 and .500.

Anything not in the table counts as an AI estimate. It is shown under "Check weight first" and never sent to the phone, unless the listing itself states both the weight and the fineness.

## Sharing a rule

Changed a rule others could use, such as a verified coin or a better pattern? Open a pull request on GitHub with the file and your sources.
