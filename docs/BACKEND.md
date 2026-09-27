# StacksClub Backend

Everything server-side lives in Next.js route handlers under `src/app/api` and helpers under `src/server` (every file there imports `server-only`).

## 1. Binance Web3 API client (`src/server/binance`)

### Read the docs first

Do not guess any path, param, header or signing step. Before writing the client, fetch and read:

- Index: https://web3.binance.com/en/dev-docs/llms.txt
- Full docs: https://web3.binance.com/en/dev-docs/llms-full.txt
- Authentication: https://web3.binance.com/en/dev-docs/authentication.md
- Trading API integration flow: https://web3.binance.com/en/dev-docs/products/trading-api/integration-flow.md
- Trading API error codes: https://web3.binance.com/en/dev-docs/products/trading-api/error-codes.md
- Fee and revenue sharing: https://web3.binance.com/en/dev-docs/products/trading-api/fee-and-revenue-sharing.md
- Market API: https://web3.binance.com/en/dev-docs/products/market-api/introduction.md
- Wallet API: https://web3.binance.com/en/dev-docs/products/wallet-api/introduction.md

Known from the index (confirm against the full docs):

- `GET /api/v1/dex/market/rwa/platforms`
- `GET /api/v1/dex/market/rwa/search`
- `GET /api/v1/dex/market/candles`
- Trading API flow: authenticate, approve, quote, build, sign, broadcast, verify. RWA/equity routes may return an RFQ mode that needs an EIP-712 signature from the user, a server-side order submit and status polling until `FILLED` or `FAILED`.

Save the parts you rely on as `docs/binance-notes.md` with the exact endpoint, params, sample response and source URL for each call, so later sessions don't re-derive them.

### Client design

- `binanceFetch<T>(method, path, { query, body })` handles signing, timestamps, JSON parsing, typed errors (`BinanceError` with code, message, http status, request id) and one retry on 5xx or network error with jitter. Never retry order submission automatically.
- Validate every response with zod. Log and surface schema mismatches instead of silently coercing.
- Unit test the signing function against the example in the auth docs if one exists.
- Keys come from `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY`.

### Typed wrappers

- `getRwaPlatforms()`
- `searchRwa({ chainId: 56, platform?, keyword? })`
- `getTokenPrice(chainId, address)` (onchain price and reference price if the RWA data returns both)
- `getCandles(chainId, address, bar, limit)`
- `getQuote({ fromToken, toToken, amount, userAddress, slippageBps })`
- `buildTx(...)` for SWAP routes
- `submitRfqOrder({ quoteId or order payload, signature, userAddress, idempotencyKey })`
- `getOrderStatus(orderId)`
- `getWalletBalances(address)` if the Wallet API fits, otherwise read balances via viem multicall

## 2. Chain helpers (`src/server/chain.ts`, `src/lib/chain.ts`)

- viem public client for BSC mainnet using `BSC_RPC_URL` (Alchemy).
- `readErc20Balances(address, tokens[])` via multicall.
- `waitForReceipt(hash)` with a timeout.
- Vault reads: `getStack`, `getPosition`, `positionsOf`, `creatorClaimable`.
- Constants: chain id 56, USDT address, vault address from `src/lib/contracts/vault.ts`.

## 3. API routes

All inputs validated with zod. All user-scoped routes verify the Privy access token server-side with `@privy-io/server-auth` and resolve the user's wallet address from Privy, never from the request body.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/assets` | GET | Allowlisted assets from Supabase `assets` joined with cached prices. Query: `tab`, `filter`, `sort`. |
| `/api/assets/[provider]/[address]` | GET | One asset: metadata, onchain price, reference price, premium, market status, 24h change, market cap |
| `/api/assets/compare/[ticker]` | GET | All providers for one underlying ticker, side by side |
| `/api/market/candles` | GET | `address`, `bar` (`1m`,`5m`,`1H`,`1D`), `limit`. Cache 5s for `1m`, 60s otherwise. |
| `/api/stacks` | GET | Stacks list for the Stacks tab with index value and change |
| `/api/stacks/[id]` | GET | Recipe from chain (cached in Supabase), metadata, index, holders count, creator earned |
| `/api/stacks/[id]/index` | GET | Index series for the chart (see `FLOWS.md` 6) |
| `/api/stacks/metadata` | POST | Upload the Stack image to Supabase Storage and store metadata JSON. Returns `metadataURI`. |
| `/api/quote` | POST | Fresh quote for one leg. Body: `from`, `to`, `amount` (raw string). Server checks both tokens are USDT or allowlisted. Returns mode (`SWAP` or `RFQ`), expected out, min out, expiry, and the typed data or tx to sign. |
| `/api/orders` | POST | Submit a signed RFQ order. Body: `intentId`, `legIndex`, `signature`, `quoteRef`. Uses `intentId:legIndex` as the idempotency key. |
| `/api/orders/[id]` | GET | Order status, normalized to `PENDING`, `FILLED`, `FAILED`, `EXPIRED` |
| `/api/intents` | POST | Create a buy or sell intent (server computes fee and per-leg allocation from the chain recipe). Returns the intent with its legs. |
| `/api/intents/[id]` | GET/PATCH | Read or advance an intent. PATCH only accepts a leg status change plus a tx hash or order id, and the server verifies that against the chain or Binance before saving. |
| `/api/portfolio` | GET | USDT balance, single stock holdings, positions with values, total, 24h change |
| `/api/positions/[id]/metadata` | GET | ERC-721 metadata JSON |
| `/api/profile` | GET/PUT | Current user's profile |
| `/api/users/[username]` | GET | Public profile, holdings (respecting `show_values`), Stacks, activity |
| `/api/follow` | POST/DELETE | Follow or unfollow |
| `/api/comments` | GET/POST | Comments for a stock or Stack |
| `/api/comments/[id]/like` | POST/DELETE | Like |
| `/api/leaderboard` | GET | `weekly` and `hall-of-fame` for the Home cards |
| `/api/activity` | GET | Following feed |
| `/api/cron/prices` | GET | Vercel Cron every minute. Refreshes the price cache for all allowlisted assets. Protected by `CRON_SECRET`. |
| `/api/cron/index` | GET | Every 5 minutes. Appends a point to each Stack's index series. |

Rate limit write routes per user (simple Supabase or in-memory token bucket is fine).

## 4. Supabase schema (`supabase/migrations/0001_init.sql`)

```sql
create extension if not exists citext;

create table profiles (
  id uuid primary key default gen_random_uuid(),
  privy_id text unique not null,
  wallet_address text unique not null,          -- lowercase
  username citext unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  bio text check (char_length(bio) <= 160),
  x_url text,
  show_values boolean not null default false,
  created_at timestamptz not null default now()
);

create table follows (
  follower_id uuid references profiles(id) on delete cascade,
  followee_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table assets (
  provider text not null check (provider in ('bstock','ondo')),
  chain_id int not null default 56,
  address text not null,                        -- checksum
  ticker text not null,                         -- underlying, e.g. NVDA
  symbol text not null,                         -- provider token symbol
  name text not null,
  logo_url text,
  decimals int not null,
  share_multiplier numeric,
  can_browse boolean not null default true,
  can_stack boolean not null default false,
  can_trade boolean not null default false,
  vault_ok boolean,                             -- set from the fork test result
  source text not null,
  verified_at timestamptz,
  primary key (chain_id, address)
);

create table asset_prices (
  chain_id int not null default 56,
  address text not null,
  price_usd numeric,
  reference_price_usd numeric,
  change_24h numeric,
  market_cap numeric,
  volume_24h numeric,
  market_open boolean,
  updated_at timestamptz not null default now(),
  primary key (chain_id, address)
);

create table stacks (
  id bigint primary key,                        -- onchain stackId
  creator_id uuid references profiles(id),
  creator_address text not null,
  ticker text unique not null,
  name text not null,
  description text,
  image_url text,
  metadata_uri text not null,
  components jsonb not null,                    -- [{address, provider, ticker, weight_bps}]
  launch_units jsonb,                           -- frozen notional units for the index
  tx_hash text not null,
  created_at timestamptz not null default now()
);

create table stack_index_points (
  stack_id bigint references stacks(id) on delete cascade,
  ts timestamptz not null,
  value numeric not null,
  reference_value numeric,
  primary key (stack_id, ts)
);

create table intents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) not null,
  kind text not null check (kind in ('buy_stock','buy_stack','sell_stock','sell_stack','redeem')),
  stack_id bigint,
  position_id bigint,
  asset_address text,
  gross_amount text,                            -- raw USDT units as string
  fee_amount text,
  bps int,                                      -- sell/redeem fraction
  fee_receipt_id bigint,
  status text not null default 'created'
    check (status in ('created','fee_paid','legs_running','legs_done','depositing','done','partial','failed','cancelled')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table intent_legs (
  intent_id uuid references intents(id) on delete cascade,
  leg_index int not null,
  from_token text not null,
  to_token text not null,
  amount_in text not null,
  expected_out text,
  min_out text,
  actual_out text,
  mode text check (mode in ('SWAP','RFQ')),
  order_id text,
  tx_hash text,
  status text not null default 'pending'
    check (status in ('pending','quoted','signed','submitted','filled','failed','expired','skipped')),
  error text,
  updated_at timestamptz not null default now(),
  primary key (intent_id, leg_index)
);

create table trades (                            -- confirmed fills only, used for holders, avg entry and leaderboards
  id bigserial primary key,
  profile_id uuid references profiles(id),
  intent_id uuid references intents(id),
  side text not null check (side in ('buy','sell')),
  asset_address text,
  stack_id bigint,
  position_id bigint,
  usd_amount numeric not null,
  units text,
  price_usd numeric,
  tx_hash text,
  created_at timestamptz not null default now()
);

create table chain_events (                      -- idempotent log of vault events
  chain_id int not null default 56,
  tx_hash text not null,
  log_index int not null,
  event text not null,
  data jsonb not null,
  block_number bigint not null,
  primary key (chain_id, tx_hash, log_index)
);

create table watchlist (
  profile_id uuid references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('asset','stack')),
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, target_type, target_id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('asset','stack')),
  target_id text not null,
  parent_id uuid references comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create table comment_likes (
  comment_id uuid references comments(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  primary key (comment_id, profile_id)
);

create table activity (
  id bigserial primary key,
  profile_id uuid references profiles(id) on delete cascade,
  type text not null check (type in ('buy','sell','redeem','create_stack','claim')),
  target_type text,
  target_id text,
  usd_amount numeric,
  created_at timestamptz not null default now()
);
```

Also add indexes on foreign keys and `(target_type, target_id, created_at desc)` for comments and activity, and a view `holders` that aggregates `trades` per profile and target into net units, cost basis and average entry.

### RLS

- Enable RLS on every table.
- Public read: `profiles` (without `privy_id`, via a view), `follows`, `assets`, `asset_prices`, `stacks`, `stack_index_points`, `comments`, `comment_likes`, `activity`.
- `intents`, `intent_legs`, `trades` and `watchlist`: readable only by the owner.
- All writes go through API routes using the service role key. The browser client uses the anon key for reads and Realtime only.
- Realtime enabled on `activity` and `asset_prices`.

Storage buckets: `avatars` and `stacks`, public read, 2MB limit, images only, writes via API routes.

## 5. Event sync

`/api/cron/sync` every minute: read vault logs since the last synced block (store it in a `sync_state` row), insert into `chain_events` with `on conflict do nothing`, then upsert `stacks`, and write `activity` rows for `StackCreated`, `PositionOpened`, `PositionReleased` and `CreatorClaimed`. The app also calls a targeted sync for a tx hash right after a user action so the UI updates without waiting for cron.

## 6. Seed script (`scripts/seed-assets.ts`)

- Calls the Binance RWA platforms and search endpoints for chain 56.
- For each bStocks and Ondo token: checks there's code at the address, reads `decimals`, `symbol` and `name` via viem, and upserts into `assets` with `can_browse = true`.
- Sets `can_trade` and `can_stack` to true only for assets where `/api/quote` returns a USDT route. Logs the ones without a route.
- Writes `contracts/deploy/assets.json` and `contracts/test/fork-assets.json`.
- Prints a summary table. Run with `pnpm seed:assets`.

## 7. Environment variables

`.env.example`:

```
NEXT_PUBLIC_PRIVY_APP_ID=
PRIVY_APP_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
BSC_RPC_URL=
NEXT_PUBLIC_BSC_RPC_URL=
BINANCE_WEB3_API_KEY=
BINANCE_WEB3_SECRET_KEY=
NEXT_PUBLIC_VAULT_ADDRESS=
NEXT_PUBLIC_USDT_ADDRESS=0x55d398326f99059fF775485246999027B3197955
NEXT_PUBLIC_APP_URL=https://0x-stacks-club.vercel.app
CRON_SECRET=

# Foundry only, set in your shell or Codespaces secrets, never in Vercel
# DEPLOYER_PRIVATE_KEY=
# PLATFORM_FEE_RECIPIENT=
# USDT_ADDRESS=
```

`src/lib/env.ts` validates these with zod at startup and fails loudly with the missing names.
