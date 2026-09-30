# 3AM (formerly Stocks n Clubs, StacksClub)

Social market for tokenized stocks on BNB Smart Chain mainnet (chain ID 56), with a texting assistant and creator-made stock baskets as a side feature.

## Product focus

- Stocks first. Single tokenized stocks are the centre of the product: home, social, stats and the
  texting assistant all lead with stocks. Baskets are one feature among others and mostly live on
  the site.
- The texting assistant (iMessage and Telegram, `bot/`) is the headline feature. It is on Home and
  beside the trade panel. The bot is its own package, never calls Binance, Supabase or the vault,
  and only talks to `/api/bot/*`. See `bot/README.md`.

## Naming

- The user-facing name is `APP_NAME` in `src/lib/constants.ts`. Never hardcode it.
- Users see "basket" / "baskets" (plain wording, no branding). Internally a basket is still a "Stack": the `stacks` table, `stack_id` columns, `StacksClubVault`, `/api/stacks` and `buy_stack` intents keep that name because stored data and the deployed contract depend on it. The docs below use "Stack".
- A basket's Club is only its creator's Telegram group link (`club_links`), revealed by the API to wallets holding the basket onchain. No in-app chat. The old `club_posts` chat UI is retired; its table and API routes are kept for the data.

## Read these before any task

- `docs/ARCHITECTURE.md` for product background, trust boundaries and the reasoning behind decisions
- `docs/UI_SPEC.md` for every screen, component, token and interaction in `/app`
- `docs/CONTRACTS.md` for the vault contract spec and tests
- `docs/BACKEND.md` for the Binance client, API routes and Supabase schema
- `docs/FLOWS.md` for the create, buy, sell, redeem and deposit state machines

If two docs disagree, this file wins, then the more specific doc wins over `ARCHITECTURE.md`. `ARCHITECTURE.md` mentions BNB, USDC, xStocks and PancakeSwap. Those are out of scope for this build (see below).

## Stack

- Next.js 15 (App Router, TypeScript, strict), Tailwind CSS, deployed on Vercel
- Privy (`@privy-io/react-auth`) for auth plus embedded and external EVM wallets, viem for chain calls
- Foundry for contracts, OpenZeppelin v5
- Supabase Postgres with RLS, Supabase Storage for images
- Alchemy BSC mainnet RPC
- Binance Web3 API for RWA catalog, prices, candles, quotes and RFQ/swap execution (server-side only, signed requests)
- Charts: `lightweight-charts` (TradingView, Apache 2.0)
- Data fetching: TanStack Query. State: React state plus Query cache. No Redux.

## Hard rules

- Assets are identified by provider + chain ID + checksum address, never by ticker alone.
- Only allowlisted asset contracts can be used in Stacks or the vault. Never accept an arbitrary token address from the client.
- The app never custodies user funds outside the vault contract and never uses a hot wallet for user trades. Users sign their own transactions and pay their own BNB gas.
  - One exception, decided by the owner on 2026-09-30: **Trade by text**. A user can turn it on in the app, which adds the app's Privy signer to their own embedded wallet. The server may then sign a buy or a sell of a single stock with that wallet, only after the user replies YES to the texting assistant and only through the same intent checks as the site (`src/server/botTrade.ts`). Buys stay within the limits the user set (default $50 a buy, $200 a day); a sell returns USDT to the same wallet. It never withdraws or sends funds elsewhere, funds stay in the user's wallet, and they still pay their own gas. Turning it off removes the signer. Trades started on the site are still signed in the browser.
- Chain state is the source of truth for recipes, position owners, units and fees. Supabase is a cache and social store only. Never trust client-reported balances, ownership or "confirmed" status.
- A signed or submitted RFQ order is not a completed trade. Only FILLED status plus a verified balance increase counts.
- Never claim a Stack buy or sell is atomic. Legs run in sequence and every leg's status is persisted.
- No position is minted until every component is deposited.
- Secrets (Binance keys, Supabase service key) stay server-side. The deployer private key is never read, written or referenced by app code or committed anywhere. Deploy scripts read it from the environment at run time only.
- Contracts have no admin function that can move user-accounted assets.
- Never invent Binance endpoint paths, params or signing details. Read the official docs first (see `docs/BACKEND.md`).

## Settled product rules

- Stack = immutable recipe of 2 to 5 allowlisted stock tokens, weights in basis points summing to 10,000.
- Min buy is $1 for 1 to 3 components, $5 for 4 to 5. Single stock min buy is $1.
- 1% buy fee charged once on the whole purchase, taken from the gross amount before legs run. For Stack buys, 25% to the creator as a claimable balance and 75% to the platform. Single stock buy fees go 100% to the platform. 1% sell fee on actual proceeds goes to the platform. Stack creation has no app fee.
- Each Stack purchase is its own position with exact raw units. No rebalancing. Position NFTs are non-transferable.
- Sell converts a fraction of every component to USDT. Redeem returns that fraction of the stock tokens unchanged.
- Input and settlement token is USDT (BEP-20, `0x55d398326f99059fF775485246999027B3197955`) only.
- Providers in scope: bStocks (default) and Ondo, both from the Binance RWA API.
- Out of scope: xStocks, PancakeSwap data, BNB/USDC as input, fiat on-ramps, fungible Stack tokens, rebalancing, DCA, leverage, perps, position NFT transfers.

## Build order (one-shot)

Build everything below in one pass, in this order, committing after each numbered step with a clear message.

1. Repo scaffold, Tailwind design tokens, fonts, env validation (`src/lib/env.ts` with zod)
2. Contracts: `StacksClubVault` per `docs/CONTRACTS.md`, full Foundry test suite including the BSC fork test, deploy script
3. Binance client and all API routes per `docs/BACKEND.md`
4. Supabase migration SQL and typed client
5. Privy provider, auth gate for `/app`, profile onboarding
6. UI shell and every screen in `docs/UI_SPEC.md`
7. Flows in `docs/FLOWS.md`: deposit sheet, single stock buy/sell, Stack create, Stack buy, Stack sell, redeem, creator claim
8. Social: follows, comments feed, holders tab, weekly top trades
9. Seed script for the asset allowlist from the Binance RWA API
10. README with setup, env vars and deploy steps

## Conventions

- `src/app` routes, `src/components` UI, `src/lib` shared logic, `src/server` server-only code (import `server-only`), `contracts/` Foundry project, `supabase/migrations` SQL.
- All money math in raw bigint units. Convert to display only at the edge. Never use JS floats for amounts sent onchain.
- Write unit tests (Vitest) for fee math, allocation math, position valuation and Binance request signing.
- Every async UI state has a loading skeleton, an empty state and an error state.
- When an external API or token behaves differently from these docs, stop and report it with the exact response, instead of working around it silently.
