# StacksClub — Product

Source of truth: `CLAUDE.md` and `docs/`. This file summarises them for design work; it adds nothing.

## Product

A social market for tokenized stocks and creator-made stock baskets ("Stacks") on BNB Smart Chain
mainnet. Users buy provider-issued stock tokens (bStocks, Ondo), create immutable Stacks of 2–5 of
them, buy positions in other people's Stacks, and follow, comment on and copy each other.
Built for the BNB Chain tokenized-stocks hackathon.

## Users and jobs

- Crypto-native and crypto-curious people who want stock exposure onchain, on their phone.
- Jobs: deposit USDT, buy a stock token, compare providers for the same ticker, build and share a
  Stack, buy into someone's Stack, sell or redeem, see what friends hold and trade, claim creator fees.

## Truths the UI must respect

- It is not a broker or issuer. Tokens are provider-issued, not direct shares. "Redeem" returns the
  exact stock tokens, never cash.
- A Stack has no token and no market price. Its chart is an index ("Value of $1,000 put into this
  Stack at launch, without rebalancing"), shown without `$`.
- Stack buys are never atomic: legs run in sequence and every step is shown.
- Prices are indicative marks, labelled as such. Market-closed states are shown.
- Fees: 1% buy (Stack creator gets 25% of it), 1% sell. Minimum buy $5 (1–3 components), $10 (4–5).

## Platform

`web`, mobile-first (390–430px), dark only; desktop centres the 430px column.

## Binding visual spec

`docs/UI_SPEC.md` (tokens, type scale, layout, components, motion) and `docs/reference/*.png`
for layout reference. StacksClub uses its own mark and Lucide icons; no other app's brand assets.
