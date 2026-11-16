# token-radar

A ranked board of pre-token protocols, priced at the multiple their own size and category trade at.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jakadul/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jakadul/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every protocol in a sealed DefiLlama snapshot that records no token, ranked by what a token would be worth if that protocol's record stayed as it is, with the comparables behind each number and a farm plan for each protocol.

## What it does

`main.ts` reads `/input/snapshot.json` and writes four things: `board.json`, the 226-row ranked board with a farm plan per row; `data.js`, the dashboard's data; `dossier.json`, written by the vendored `vendor/makefun-board.ts`; and copies of `dashboard/` and `screenshots/`. It runs on Node 22 with the standard library alone, in about a second, and twice in a row it writes the same bytes.

The board covers every slug in the snapshot's watchlist (40 of 758 protocols) and 186 pre-token protocols below the watchlist floor, so the ranking is a ranking and not the house's floor list repeated.

## The value model

Implied value is a comparables valuation, and every input to it comes from the snapshot:

- **multiple**: the snapshot's own 110 live-token protocols answer what a protocol is worth per dollar of TVL. `lib/scale.ts` fits their market cap over TVL against TVL in log space, takes each category's median against that fit, and shrinks a thin category back toward the curve by how few comparables it has. A pre-token protocol is priced at the multiple its own size and category trade at, never at a constant chosen by hand.
- **growth**: the seven-day change, clipped to -25% to 60% and weighted 0.6, read as a launch window rather than a price.
- **maturity**: 0.75 to 1.00 over three years of running with no token.
- **band**: the comparables' own spread around the fit, x0.40 to x2.20, so every row carries a low and a high beside its point value.

The two judgements the snapshot cannot supply (the growth weight and the maturity curve) are printed on the dashboard's "How it is priced" tab, and every detail sheet shows the arithmetic in full so a reader can check the number by hand. No protocol name is special-cased: one function scores all 226 rows.

## The dashboard

`dashboard/` is a static page: no network call, no framework, a board sortable by rank, name, TVL, growth or multiple, filters for text, category and implied value, and a detail sheet per protocol with its arithmetic, the live comparables its category rests on, and a six-step farm plan that states a cost and a time per step. The page recomputes every row's implied value from the model and says so when it matches `board.json`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```


## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=witty-gecko-28&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
