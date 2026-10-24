# Spec: Verified coin specs

Use the following specification as your single source of truth.
Do not make assumptions about any requirement not listed here.

## Feature

A fixed table of verified gross weights and finenesses for common gold and silver coins, which overrides the AI whenever a listing matches one exactly.

## Overview

`rules/coin-specs.js` maps a spec id to `{ label, metal, grossG, fineness }`. The full table, word for word, is in appendix B. It is the reason Market Watch can alert on a coin without the owner checking the weight first: a table match is not an estimate (07). The AI sees the table in its identify prompt as `<id> = <label>` lines (05), and the title rules point into it (05).

**Units**
- `grossG`: the weight of one coin in grams. `fineness`: a decimal (0.900). Fine metal = grossG × fineness.
- Bullion coins are listed by fine weight: `grossG` = the fine weight, `fineness` 1. 1 troy ounce = 31.1035 g.

**What it covers** (74 ids, as of 17 Oct 2026)

| Group | Ids | Title rule? |
|---|---|---|
| Finland, circulation | 25 p and 50 p 1864–1917 (.750), 1 mk 1864–1915 and 2 mk 1865–1908 (.868), 100 mk 1956–60 and 200 mk 1956–59 (.500), 1 mk 1964–68 (.350), 10 mk and 20 mk gold 1878–1913 (.900) | yes |
| Finland, commemoratives (each checked against Numista, 11 Oct 2026) | 500 mk 1951–52, 1000 mk 1960, 10 mk 1967, 1970, 1975, 25 mk 1978, 1000 mk 1992 gold | yes |
| | 100 mk 1989–1991 (.830) | AI only |
| Sweden and Scandinavian Monetary Union | union 10/25/50 öre and 1/2 kronor (to ~1942); Sweden 10/25/50 öre, 1/2/5 kronor (1942–1971, .400) | yes |
| | union gold 5/10/20 kronor | AI only |
| Russia / USSR | 10/15/20 kopeks 1867–1930, 50 kopeks 1886–1927, rouble 1886–1924 | yes |
| | 5 and 25 kopeks, gold 5, 7½, 10, 15 roubles, chervonets | AI only |
| UK | sovereign, half sovereign | yes |
| USA | silver dollar 1878–1935, half 1892–1964, quarter 1892–1964 | yes |
| | half 1965–70 (.400), dime, gold $2.50, $5, $10, $20 | AI only |
| Europe gold, trade coins | 10/20 francs (LMU, Napoleon, Vreneli, Austrian florins), German 10/20 mark, Dutch 10 gulden, Austrian 1/4 ducat, 10/20/100 corona, Mexico 50 and 2 pesos, Maria Theresa thaler 1780 | AI only |
| Bullion | gold 1, 1/2, 1/4, 1/10, 1/20, 1/25 oz; silver 1 oz | AI only |

"AI only" ids are used when the AI names them in identify; no title rule points to them.

**Rules for the table**
- Only add a coin after checking its specs one by one in a catalogue (Numista). Never copy an AI's numbers into the table.
- Commemoratives go in **per year**, never as a series, because specs change between years: Finnish 100 markkaa is .830 in 1989–91 but .925 in 1996; Finnish 10 € coins exist in .925 and .500.
- Coins made in both silver and base metal in the same year (Soviet kopeks of 1931) stay out, so they remain estimates.
- **Lessons that made the table necessary:** the AI alone said 1000 mk 1992 = 15 g gold (really 9 g), 10 mk 1967 = .500 (really .900), Swedish 50 öre 1956 = cupronickel (really .400 silver), Finnish 5 € 2005/2006 = silver (really bimetallic brass/copper-nickel). It also dropped "1 kruunu 1965" at screening.

**Adding a coin**
1. Verify the gross weight, fineness and years in a catalogue.
2. Add `'<country>-<denomination>-<years>': { label, metal, grossG, fineness }` to `rules/coin-specs.js`. The label names the coin and years, because the AI matches by it.
3. Optional: add a title rule in `rules/title-rules.js` (05) so the coin never depends on the AI noticing it.
4. `npm run service:restart`, regenerate the appendix, update this spec's coverage table, commit and push.

## Acceptance criteria

- [ ] Every id used in `rules/title-rules.js` exists in `rules/coin-specs.js` (today: all 37). A missing one would crash every check whose titles match that rule.
- [ ] Every entry has `metal` `gold` or `silver`, `grossG` > 0 and `0 < fineness ≤ 1`.
- [ ] A listing matched to `fi-1000mk-1992` is valued at 9 g × 0.900 = 8.1 g gold.
- [ ] A finding with a table `specId` and a single piece is not an estimate (07) and can be alerted.
- [ ] The identify prompt lists every table id with its label (05, appendix A).

## Out of scope

- Collector or numismatic value, condition, rarity.
- Coins whose metal varies within the same year.
- Automatic updates of the table from the internet.

## Edge cases

- **Restrikes** (Austrian ducats, Maria Theresa thaler 1780): same specs as the originals, so they share the id.
- **"20 francs" from any Latin Monetary Union country:** one id (`lmu-20fr`), because the gold content is identical.
- **A spec id is renamed:** title rules and stored findings keep the old id. Findings store their numbers in `content`, so they still value correctly. Rename the rules too.
- **A lot of several table coins:** the AI gives one `specId` and `qty`, or no id and an estimated total (05).

## Security impact

None. The table is static data in the repo. It changes only by a commit.

## Threat modeling

| Threat | Mitigation |
|---|---|
| A wrong number in the table makes every matching coin look cheaper than it is, and alerts fire | Entries are checked one by one in a catalogue before adding; each change is a reviewed commit; the alert always shows the grams and fineness used, so the owner can spot a wrong spec |
| The AI claims a table id for a coin that isn't it | The prompt allows an id only for the exact coin and year; the dashboard shows the spec label next to every find (12), so a wrong match is visible before buying |
