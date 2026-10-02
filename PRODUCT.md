# 3AM — Product

Source of truth: `CLAUDE.md` and `docs/`. This file summarises them for design work; it adds nothing.
The display name is `APP_NAME` in `src/lib/constants.ts` (currently 3AM; formerly Stocks n Clubs and
StacksClub).

## Product

A social market for tokenized stocks on BNB Smart Chain mainnet. Stocks come first: people buy,
hold and sell single provider-issued stock tokens (bStocks, Ondo) with USDT, see what other people
on the app trade, and can do most of it by text through the assistant on iMessage (Telegram is
built and switched off until a bot is set up).

Baskets are one feature among others: an immutable recipe of 2 to 5 stocks that a user creates and
others buy their own position in. Each basket can have a holders-only Telegram club link.

## Users and jobs

- Crypto-native and crypto-curious people who want stock exposure onchain, on their phone.
- Jobs: deposit USDT, buy and sell a stock, check a price or the news, see what people on the app
  are trading, follow traders, text the assistant for prices, news, portfolio and trades, build or
  buy a basket, claim creator fees.

## Truths the UI must respect

- It is not a broker or issuer. Tokens are provider-issued, not direct shares. "Redeem" returns the
  exact stock tokens, never cash.
- Stocks lead everywhere: home, social, stats and the assistant. Baskets are secondary and mostly
  live on the site.
- A basket has no token and no market price. Its index starts at 1,000 at launch and is shown
  without `$`. Its picture is the logos of its stocks in turn, unless the creator uploaded one.
- Buys and sells are never atomic: steps run in sequence and every step is saved.
- Prices are indicative marks. Market-closed states are shown.
- Fees: 1% buy (on a basket buy the creator gets a quarter of it), 1% sell. Minimum buy $1 for a
  stock or a basket of up to 3 stocks, $5 for a basket of 4 or 5.
- Users sign their own trades in the browser. The one exception is Trade by text: a user can let
  the app sign buys and sells of single stocks they confirm by replying YES to the assistant, with
  limits on buys (default $50 a buy, $200 a day). Off by default.

## Platform

web

Mobile-first (390–430px column). Desktop uses a wider layout with a market pane and a trade panel.
Four themes: light (default), dark, Rainbow and Binance, or System to follow the device.

## Binding visual spec

`docs/UI_SPEC.md` (tokens, type scale, layout, components, motion) and `docs/reference/*.png` for
layout reference. The brand is the wordmark (Bricolage Grotesque 800), not a logo mark; the UI font
is Geist; icons are Lucide. No other app's brand assets.
