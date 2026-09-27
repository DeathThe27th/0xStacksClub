# StacksClub

A social market for tokenized stocks and creator-made stock baskets ("Stacks") on BNB Smart Chain
mainnet. Users buy provider-issued stock tokens (bStocks, Ondo) with USDT, build immutable Stacks of
2 to 5 of them, buy their own positions in other people's Stacks, and follow, comment and share.

- Live: https://0x-stacks-club.vercel.app
- Vault: [`0x2a03793A4E00cD639F1811Fc2c0d3f14c78Aec17`](https://bscscan.com/address/0x2a03793A4E00cD639F1811Fc2c0d3f14c78Aec17) (BSC, verified)
- Specs: [`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs). Binance API facts: [`docs/binance-notes.md`](docs/binance-notes.md).

## How it works

- **Positions are exact lots.** Buying a Stack pays a 1% fee to the vault, buys each component in
  turn with the user's own wallet (Binance Web3 Trading API, SWAP or RFQ), then deposits the exact
  tokens received into `StacksClubVault`, which mints a non-transferable position NFT. No
  rebalancing, no fungible Stack token.
- **Nothing is atomic, and the UI says so.** Every buy, sell and redeem is a persisted intent
  (`intents`, `intent_legs`). The server verifies each step against the chain or Binance before
  saving it, so a closed tab resumes from the right step without buying twice.
- **Fees.** 1% buy fee on the gross amount, collected by the vault. On Stack buys 25% of it is the
  creator's, claimable onchain. 1% sell fee on actual proceeds goes to the platform.
  **The sell fee is app-enforced, not contract-enforced:** the contract can't see offchain sale
  proceeds, so the app calls `paySellFee` after the sale settles.
- **Chain is the source of truth** for recipes, owners, units and fees. Supabase is a cache and
  social store.

## Stack

Next.js 15 (App Router, TypeScript strict), Tailwind, Privy (`@privy-io/react-auth`,
`@privy-io/node`), viem, TanStack Query, lightweight-charts, Supabase (Postgres, RLS, Storage,
Realtime), Foundry with OpenZeppelin v5, Binance Web3 API, Alchemy BSC RPC.

```
src/app          routes and pages (/app is the product, /api the server)
src/components   UI
src/lib          shared logic (math, formatting, env, client hooks, generated vault ABI)
src/server       server-only code (Binance client, chain, intents, Supabase)
contracts/       Foundry project: StacksClubVault, tests, deploy script
supabase/        migration and pg_cron schedule
scripts/         seed, ABI export, fork-test bookkeeping
```

## Region restrictions

The Binance Web3 API refuses requests from the US, UK, Canada, the Netherlands and a few other
regions, checking both the server and the client IP (see `docs/binance-notes.md` §1).

- `vercel.json` pins functions to `sin1` (Singapore). Don't move them to a US or UK region.
- Trading routes return HTTP 451 to visitors from restricted regions (`src/middleware.ts`).
- You can't call Binance from a restricted machine, so `pnpm seed:assets` calls the deployed app's
  `/api/cron/seed-assets` route instead of Binance directly.

## Setup

Requirements: Node 20+, pnpm, [Foundry](https://getfoundry.sh).

```bash
pnpm install
cp .env.example .env.local        # fill in the values below
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
| `PINATA_JWT`, `PINATA_GATEWAY_URL` | optional | not used yet; Stack images go to Supabase Storage |
| `NEXT_PUBLIC_VAULT_ADDRESS` | Vercel + local | `0x2a03793A4E00cD639F1811Fc2c0d3f14c78Aec17` |
| `NEXT_PUBLIC_USDT_ADDRESS` | Vercel + local | `0x55d398326f99059fF775485246999027B3197955` |
| `NEXT_PUBLIC_APP_URL` | Vercel + local | `https://0x-stacks-club.vercel.app` |
| `CRON_SECRET` | Vercel + local | `openssl rand -hex 32` |
| `BSCSCAN_API_KEY` | local shell | contract verification |
| `DEPLOYER_PRIVATE_KEY`, `PLATFORM_FEE_RECIPIENT`, `USDT_ADDRESS` | your shell only | never in Vercel or any file |

`src/lib/env.ts` validates these with zod at startup and names anything missing.

### Supabase

1. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql` (tables, RLS, views, storage
   buckets, Realtime).
2. After the first deploy, run `supabase/cron.sql` with your `CRON_SECRET` filled in. It schedules
   the cron routes with pg_cron, because Vercel Hobby only runs cron jobs once a day. On Vercel Pro
   you can use Vercel Cron instead (`/api/cron/prices` and `/api/cron/sync` every minute,
   `/api/cron/index` every 5 minutes, each with `Authorization: Bearer $CRON_SECRET`).

### Privy

In the Privy dashboard: enable email, Google, X and wallet login; create embedded wallets for users
without one; add `https://0x-stacks-club.vercel.app` and your preview domains to allowed origins.

## Contracts

```bash
cd contracts
forge install --no-git foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.4.0
forge build
forge test                                   # unit + invariant tests; fork tests skip without BSC_RPC_URL
BSC_RPC_URL=... forge test --match-contract Fork -vv   # real bStocks/Ondo tokens through the vault
```

The fork test is the check that provider tokens can sit in the vault. On 2026-09-27 all 86 tested
tokens (46 bStocks, 40 Ondo) round-tripped unit for unit.

### Seed the asset allowlist

```bash
SEED_BASE_URL=https://0x-stacks-club.vercel.app CRON_SECRET=... pnpm seed:assets [--allow-closed]
BSC_RPC_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... FORGE_BIN=forge pnpm tsx scripts/mark-vault-ok.ts
```

`seed:assets` pulls bStocks and Ondo tokens from the Binance RWA API (through the deployed app),
checks each contract on BSC, probes for a USDT route, upserts `assets`, and writes
`contracts/test/fork-assets.json` and `contracts/deploy/assets.json`. `mark-vault-ok` runs the
per-token fork test and sets `vault_ok`; only tokens with a route **and** a passing fork test get
`can_trade`/`can_stack`. `--allow-closed` includes fork-tested tokens whose only quote error is
"market closed" in the vault allowlist. For preview deployments behind Vercel Authentication, set
`VERCEL_AUTOMATION_BYPASS_SECRET`.

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
position tokens or creators' claimable fees; `withdrawPlatformFees` is capped at accrued platform
fees. To hand admin to a safer wallet:

```bash
V=0x2a03793A4E00cD639F1811Fc2c0d3f14c78Aec17
for ROLE in $(cast keccak ASSET_ADMIN_ROLE) $(cast keccak PAUSER_ROLE) 0x0000000000000000000000000000000000000000000000000000000000000000; do
  cast send $V "grantRole(bytes32,address)" $ROLE $NEW_ADMIN --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $BSC_RPC_URL
done
cast send $V "setPlatformFeeRecipient(address)" $NEW_RECIPIENT --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $BSC_RPC_URL
# then, from the new admin, renounce or revoke the deployer's roles
```

## App

```bash
pnpm dev          # needs a non-restricted network for anything that calls Binance
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm seed:demo    # LOCAL ONLY: labelled demo profiles and comments; --clean removes them
```

### Deploy to Vercel

Set the environment variables above for **Production and Preview** in the Vercel project
(`vercel env add NAME production` and `vercel env add NAME preview`), then push the branch.
`vercel.json` sets the framework to Next.js and the function region to `sin1`.

## Tests

- `contracts/test`: 44 unit tests (validation, fee math and rounding, receipt misuse, fee-on-transfer
  rejection, partial and full release, soulbound, pause, claims, withdrawal caps), 4 invariants,
  2 BSC fork tests.
- `src/**/*.test.ts` (Vitest): fee and allocation math, release rounding, Stack index, position
  valuation and PnL, Binance request signing against the auth doc's example, RFQ typed-data parsing.
