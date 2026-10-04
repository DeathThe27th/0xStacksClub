# 3AM

[![CI](https://github.com/DeathThe27th/0xStacksClub/actions/workflows/ci.yml/badge.svg)](https://github.com/DeathThe27th/0xStacksClub/actions/workflows/ci.yml)

**Wall Street keeps hours. You don't.**

3AM is a social market for tokenized US stocks on BNB Smart Chain. You can buy and sell Nvidia,
Tesla, Microsoft and more at any hour, from the web app or just by texting it on iMessage. Users
sign in with email, Google or X, get their own self-custodial wallet, fund it by card, and trade
bStocks and Ondo tokens priced and routed by the Binance Web3 API.

| | |
| --- | --- |
| **Live app** | https://www.trade3am.xyz |
| **Vault contract** | [`0x2a03793A4E00cD639F1811Fc2c0d3f14c78Aec17`](https://bscscan.com/address/0x2a03793A4E00cD639F1811Fc2c0d3f14c78Aec17) on BSC mainnet (verified) |
| **Plain-English write-up** | [`docs/WRITEUP.md`](docs/WRITEUP.md) |
| **Chain** | BNB Smart Chain mainnet (56), settled in USDT |
| **Tokenized stocks** | bStocks (default) and Ondo, through the Binance Web3 RWA API |

Built for **BNB Hack: Tokenized Stocks Edition**, main track (Tokenized Stocks Products & Agents).

---

## For judges: a 5-minute tour

1. **Open https://www.trade3am.xyz** and click **Get started**. Sign in with Google, email or X. An
   embedded wallet is created for you, with no seed phrase.
2. **Browse:** pick any stock (for example NVDA). You'll see the live price, chart, news, the
   real share's reference price, the token's premium and a "Market closed" label outside US hours.
3. **Fund (optional):** **Deposit → Deposit with card** opens a MoonPay checkout that sends USDT
   straight to your own wallet. You can also send USDT on BSC to the address under
   **Deposit crypto**. Trades need a few cents of BNB for gas.
4. **Trade:** buy $1 or more. The panel shows the fee, a fresh quote with a guaranteed minimum,
   and each step as it runs. Sell from the same panel.
5. **Text it:** open **Settings → Connect iMessage** on your profile, enter your number and send
   the code. Then try "price NVDA", "how's my portfolio?" or "put 5 bucks into nvidia" → YES
   (after turning on Trade by text and setting a limit).
6. **Baskets:** **Create basket** lets you pick 2 to 5 stocks, drag the weights and launch. Each
   buy becomes an onchain position in the vault.

> **Region note.** The Binance Web3 API refuses requests from the US, UK, Canada, the Netherlands
> and a few other regions, checking both the server's and the client's IP. 3AM's servers run in
> Singapore (`sin1`), and trading routes return HTTP 451 to visitors from restricted regions.
> Browsing works everywhere. To try a trade from a restricted region, use a VPN to an allowed one.

### Where the hackathon requirements live in the code

| Requirement | Where |
| --- | --- |
| Tokenized stock platform at the centre | bStocks and Ondo catalog, prices and trading: [`src/server/binance`](src/server/binance), [`src/server/assets`](src/server/assets), [`scripts/seed-assets.ts`](scripts/seed-assets.ts) |
| BSC mainnet only | Chain 56 throughout: [`src/lib/constants.ts`](src/lib/constants.ts) (`CHAIN_ID = 56`), [`src/server/chain.ts`](src/server/chain.ts), the vault on BSC mainnet, USDT `0x55d3…7955` |
| Binance Web3 API integration | Signed client [`src/server/binance/client.ts`](src/server/binance/client.ts) and [`sign.ts`](src/server/binance/sign.ts), typed wrappers [`index.ts`](src/server/binance/index.ts), all API notes in [`docs/binance-notes.md`](docs/binance-notes.md) |
| Spot only | No leverage or perps. Trades are USDT ↔ stock token. |
| Agent | The iMessage and Telegram assistant in [`bot/`](bot) and its server routes [`src/app/api/bot`](src/app/api/bot), with text trades in [`src/server/botTrade.ts`](src/server/botTrade.ts) |

---

## Features

| Feature | What it does |
| --- | --- |
| **Sign in, own your wallet** | Privy login (email, Google, X) creates a self-custodial embedded wallet. External wallets work too. Users sign every site trade and pay their own gas. |
| **Deposit by card** | Privy funding flow with a licensed on-ramp (MoonPay) delivers USDT, or BNB for gas, straight to the user's wallet. The app never touches the money and just watches the chain for it to arrive. |
| **24/7 stock trading** | Buy and sell single stocks from $1 with a 1% fee, a fresh quote, a guaranteed minimum and live step tracking |
| **Honest market hours** | Token price, the real share's reference price, the premium between them, and the market status with next open time |
| **Live data** | Prices, candles (1H to ALL), company news, 24h volume, market cap and "traded on 3AM" volume |
| **Texting assistant** | iMessage and Telegram: prices, movers, news, portfolio and buy or sell in plain English. Replies are checked against real data. |
| **Trade by text** | Opt-in. Buys and sells only after the user replies YES (matched by code, not the model), within the user's own limits (default $50 a buy, $200 a day). Funds never leave the user's wallet. |
| **Social** | Weekly top trades, Hall of Fame, live trade toasts, holders with average entry and P&L, comments, follows, public profiles |
| **Baskets** | Immutable 2 to 5 stock recipes. Each buy is its own soulbound position NFT in the vault with exact units. Creators earn 25% of the buy fee and can attach a holders-only Telegram club. |
| **Safety** | Price guard (refuses quotes more than 5% worse than market), simulated gas, resumable trades, exact approvals only |

---

## How it uses the Binance Web3 API

All calls are server-side and HMAC-signed (`X-OC-APIKEY`, `X-OC-TIMESTAMP`, `X-OC-SIGN`). Every
response is validated with zod, errors are typed with Binance's code and request ID, and order
submission is never retried automatically.

| Module | Endpoint | Used for |
| --- | --- | --- |
| RWA Data | `rwa/platforms`, `rwa/tokens` | Provider list, full BSC catalog, token metadata, market status (seed script and price cron) |
| RWA Data | `rwa/price` | Live batched prices (up to 100 tokens per call), and the price guard |
| RWA Data | `rwa/search` | Search by ticker, company or address |
| RWA Data | `rwa/underlying-market` | The real share's reference price, 52-week range and market status |
| Market | `market/candles` | Charts and 24h change |
| Trading | `aggregator/quote` | Quotes for every buy and sell leg (SWAP or RFQ) |
| Trading | `aggregator/approve-transaction` | Exact-amount approvals for the quoted router or vendor |
| Trading | `aggregator/swap` | Builds SWAP transactions (re-simulated for gas before the user signs) |
| Trading | `aggregator/order/submit`, `aggregator/order/{id}` | RFQ orders: user-signed EIP-712, submitted with an idempotency key, polled to `FILLED` |

Where the live API behaved differently from its docs (Ondo routing, `/swap` gas, null candle
fields, the Ondo minimum order size), it's recorded in
[`docs/binance-notes.md` §6](docs/binance-notes.md#6-differences-from-our-docs).

---

## Architecture

```
 Browser (Next.js, Privy wallet)  ── user signs every site trade ──▶  BNB Smart Chain
        │ /api/* (Privy auth)                                       StacksClubVault, USDT,
        ▼                                                           bStocks / Ondo tokens
 Vercel functions, sin1 (server-only) ──────────────────────────────▶ (reads + verification)
   • Binance Web3 API client (signed)       ──▶ Binance Web3 API
   • Intent state machine + chain checks
   • Price guard, region gate, rate limits
   • /api/bot/* for the assistant           ◀── bot/ (iMessage + Telegram, no keys, no signing)
        │
        ▼
 Supabase Postgres (cache + social, RLS, Realtime, Storage)
```

**Trust rules the code follows:**
- The chain is the source of truth for recipes, owners, units and fees. Supabase is only a cache
  and social store.
- A submitted order isn't a completed trade. Only Binance `FILLED` *plus* a verified balance
  increase at the user's own address counts.
- Every buy, sell and redeem is a persisted intent (`intents`, `intent_legs`). The server verifies
  each step before saving it, so a closed tab resumes without buying twice.
- Basket buys are never claimed to be atomic. Legs run in sequence, each persisted, and no position
  is minted until every component is deposited.
- Assets are identified by provider + chain + checksummed address and must be on the allowlist.
  The server never accepts an arbitrary token address from the client.
- All money math uses raw `bigint` units.
- Secrets (Binance, Supabase service and Privy signer keys) stay server-side.

**Fees:** 1% on buys, taken once from the gross amount (on basket buys, 25% to the creator and 75%
to the platform), and 1% on actual sell proceeds. Creating a basket is free. The sell fee is
app-enforced, because the contract can't see offchain sale proceeds.

---

## Repository layout

```
src/app            Next.js routes: /app is the product, /api the server routes
src/components     UI components
src/lib            shared logic: fee and allocation math, trade runner, env, chain, formatting
src/server         server-only code: Binance client, intents, chain checks, assistant, social
bot/               the iMessage and Telegram assistant (separate package, runs on a VPS)
contracts/         Foundry project: StacksClubVault, tests, deploy script, deployment record
supabase/          SQL migrations and the pg_cron schedule
scripts/           asset seeding, fork-test bookkeeping, ABI export, local demo data
docs/              specs and notes (see below)
```

| Doc | What's in it |
| --- | --- |
| [`docs/WRITEUP.md`](docs/WRITEUP.md) | Plain-English explanation of the product and how it works |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Product background, trust boundaries and design decisions |
| [`docs/BACKEND.md`](docs/BACKEND.md) | Binance client, API routes, Supabase schema |
| [`docs/FLOWS.md`](docs/FLOWS.md) | Deposit, buy, sell, redeem and claim state machines |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Vault contract spec |
| [`docs/UI_SPEC.md`](docs/UI_SPEC.md) | Screens, components and design tokens |
| [`docs/binance-notes.md`](docs/binance-notes.md) | Every Binance Web3 API fact we rely on, with sources, plus where the live API differed |
| [`bot/README.md`](bot/README.md) | The texting assistant: tools, guardrails, setup |
| [`contracts/README.md`](contracts/README.md) | Vault functions, tests and deployment |
| [`CLAUDE.md`](CLAUDE.md) | Engineering rules for the codebase (also used by AI coding agents) |

---

## Tests

| Suite | Command | Result |
| --- | --- | --- |
| App (Vitest) | `pnpm test` | 73 passing: trade runner against a simulated wallet and chain, fee and allocation math, release rounding, position valuation and P&L, Binance request signing, RFQ typed-data parsing, phone handling |
| Contracts (Foundry) | `cd contracts && forge test` | 45 passing (unit + invariant). The 2 BSC fork tests run with `BSC_RPC_URL`: 86 real tokens round-tripped through the vault. |
| Bot | `cd bot && pnpm test` | 49 passing: parser, reply formatting, handler, send quota |
| Static checks | `pnpm lint && pnpm typecheck` | clean |

---

## Run it locally

Requirements: Node 20+, pnpm, [Foundry](https://getfoundry.sh).

```bash
pnpm install
cp .env.example .env.local        # fill in the values below
pnpm dev                          # needs a network region Binance allows (see Region note)
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

### Environment variables

| Name | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Vercel + local | Privy app |
| `PRIVY_APP_SECRET` | Vercel + local | server only |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel + local | public reads and Realtime |
| `SUPABASE_SECRET_KEY` | Vercel + local | server only, bypasses RLS |
| `BSC_RPC_URL` | Vercel + local | Alchemy BSC mainnet |
| `NEXT_PUBLIC_BSC_RPC_URL` | Vercel + local | browser reads (restrict the key's allowed origins in Alchemy) |
| `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_SECRET_KEY` | Vercel + local | server only |
| `PINATA_JWT`, `PINATA_GATEWAY_URL` | optional | not used yet; basket images go to Supabase Storage |
| `NEXT_PUBLIC_VAULT_ADDRESS` | Vercel + local | `0x2a03793A4E00cD639F1811Fc2c0d3f14c78Aec17` |
| `NEXT_PUBLIC_USDT_ADDRESS` | Vercel + local | `0x55d398326f99059fF775485246999027B3197955` |
| `NEXT_PUBLIC_APP_URL` | Vercel + local | `https://www.trade3am.xyz` |
| `CRON_SECRET` | Vercel + local | `openssl rand -hex 32` |
| `BOT_API_SECRET` | Vercel + local + `bot/.env` | `openssl rand -hex 32`, shared with the bot |
| `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET` | Vercel + local + `bot/.env` | Photon project; the app registers phones with it |
| `NEXT_PUBLIC_PRIVY_SIGNER_ID`, `PRIVY_SIGNER_PRIVATE_KEY` | Vercel + local, optional | Privy authorization key for Trade by text. The private key is server only. |
| `NEXT_PUBLIC_TELEGRAM_BOT` | Vercel + local, optional | Telegram bot username without `@`; turns on Connect Telegram |
| `BSCSCAN_API_KEY` | local shell | contract verification |
| `DEPLOYER_PRIVATE_KEY`, `PLATFORM_FEE_RECIPIENT`, `USDT_ADDRESS` | your shell only | never in Vercel or any file |

`src/lib/env.ts` validates these with zod at startup and names anything missing.

### Supabase

1. In the Supabase SQL editor, run the migrations in `supabase/migrations/` in order: `0001_init.sql`
   (tables, RLS, views, storage buckets, Realtime), `0002_clubs.sql`, `0003_club_links.sql`,
   `0004_imessage.sql` and `0005_assistant.sql`.
2. After the first deploy, run `supabase/cron.sql` with your `CRON_SECRET` filled in. It schedules
   the cron routes with pg_cron (`/api/cron/prices` and `/api/cron/sync` every minute,
   `/api/cron/index` every 5 minutes, each with `Authorization: Bearer $CRON_SECRET`).

### Privy

In the Privy dashboard:
- Enable email, Google, X and wallet login.
- Create embedded wallets for users without one.
- Enable card funding (MoonPay) for BSC.
- Add `https://www.trade3am.xyz`, `https://trade3am.xyz` and your preview domains to the allowed
  origins.

### Seed the asset allowlist

```bash
SEED_BASE_URL=https://www.trade3am.xyz CRON_SECRET=... pnpm seed:assets [--allow-closed]
BSC_RPC_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... FORGE_BIN=forge pnpm tsx scripts/mark-vault-ok.ts
```

`seed:assets`:
- pulls bStocks and Ondo tokens from the Binance RWA API (through the deployed app, since Binance
  can't be called from a restricted region)
- checks each contract on BSC and probes for a USDT route
- upserts `assets`, and writes `contracts/test/fork-assets.json` and `contracts/deploy/assets.json`

`mark-vault-ok` runs the per-token fork test. Only tokens with a route **and** a passing fork test
can be traded or used in baskets. After seeding, call `/api/cron/mirror-logos` to copy token logos
into Supabase Storage.

### Deploy the vault

```bash
cd contracts
export DEPLOYER_PRIVATE_KEY=...            # in your shell only
export PLATFORM_FEE_RECIPIENT=0x...
export USDT_ADDRESS=0x55d398326f99059fF775485246999027B3197955
forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --broadcast --verify --etherscan-api-key $BSCSCAN_API_KEY
cd .. && pnpm export-abi                   # writes src/lib/contracts/vault.ts from the broadcast
```

The deployer gets `DEFAULT_ADMIN_ROLE`, `ASSET_ADMIN_ROLE` and `PAUSER_ROLE`. No role can move
position tokens or creators' claimable fees, and `withdrawPlatformFees` is capped at accrued
platform fees.

### Deploy the app to Vercel

Set the environment variables above for Production and Preview, then push. `vercel.json` pins the
functions to `sin1` (Singapore). Don't move them to a US or UK region, because Binance refuses
those.

### Run the assistant

See [`bot/README.md`](bot/README.md): Photon Spectrum for iMessage and Telegram, optional Gemini
for conversation, run with pm2 on a VPS. The bot holds no Binance, Supabase or wallet secrets. It
only calls `/api/bot/*` with a shared secret.

---

## Naming

The user-facing name lives in one place: `APP_NAME` in `src/lib/constants.ts`. Users see
"baskets". In code, tables and the contract, a basket is a **Stack** (`stacks`, `StacksClubVault`,
`/api/stacks`), because stored data and the deployed contract depend on that name. The project
was previously called StacksClub, hence the repository name.
