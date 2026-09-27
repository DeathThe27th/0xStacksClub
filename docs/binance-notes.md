# Binance Web3 API notes

Everything StacksClub relies on from the Binance Web3 API, with the source for each fact. Written
before the client (`src/server/binance`) so later sessions don't re-derive it. Do not add anything
here that the sources below don't say.

## Sources

| Short name | What it is |
| --- | --- |
| `llms-full` | `docs/binance-src/llms-full.txt`, the official full docs (https://web3.binance.com/en/dev-docs/llms-full.txt), downloaded 2026-09-27 |
| `auth` | Authentication doc, `llms-full` lines 117–490 (https://web3.binance.com/en/dev-docs/authentication) |
| `trading-intro` | Trading API introduction, `llms-full` lines 2200–2337 |
| `integration-flow` | Trading API integration flow, `llms-full` lines 2339–2732 |
| `trading-errors` | Trading API error codes, `llms-full` lines 2944–3160 |
| `market-intro` | Market API introduction, `llms-full` lines 3288–3345 |
| `restricted` | Service-restricted regions, `llms-full` lines 8–55 |
| `connector` | Binance's official generated JS client, https://github.com/binance/binance-web3-connector-js (`clients/web3-wallet/src/rest-api`), linked from `llms-full` "SDKs & Tools". Used for exact parameter names and response fields, which the docs site keeps in its OpenAPI reference rather than in `llms-full`. |

The docs site (web3.binance.com/en/dev-docs) is geo-blocked from the UK and US, which is why the
files were downloaded by hand into `docs/binance-src/`.

## 1. Region restrictions (critical for hosting)

Source: `restricted`.

> IP checks are enforced on both the Developer Portal and the API server side. ... All other
> prohibited regions have no exemption — both client IP and server location are checked.

Prohibited: US (and GU, MP, PR, VI, AS, UM), CA, NL, IR, CU, KP, Crimea/DPR/LPR, **GB**. Japan is
conditional (Binance-account login + non-prohibited KYC + server in Japan), so treat it as blocked.

Consequences for this app:

- Server functions that call Binance must run outside these regions. Vercel's default `iad1` (US)
  is not allowed. `vercel.json` pins functions to `sin1` (Singapore).
- Local development from a restricted region (this Codespace runs in GB) cannot call Binance.
  Binance-backed code is verified through a Vercel preview in `sin1`.
- The app refuses trading routes for visitors whose `x-vercel-ip-country` is in the list
  (`src/lib/geo.ts`, `src/middleware.ts`).

## 2. Base URL and authentication

Source: `auth`.

- Base URL: `https://web3.binance.com/build`. Every request path is `/build/api/v1/...`.
- Headers on every request:
  - `X-OC-APIKEY`: API key
  - `X-OC-TIMESTAMP`: ISO 8601 UTC with milliseconds, e.g. `2026-05-11T10:08:57.715Z` (JS `new Date().toISOString()`)
  - `X-OC-SIGN`: signature
  - optional `X-OC-RECV-WINDOW` (ms, default 5000, max 60000), optional `X-OC-NONCE`
- Signature: `Base64(HMAC-SHA256(secretKey, timestamp + METHOD + requestPath + body))`, UTF-8.
  - `requestPath` includes the `/build` prefix and the raw query string exactly as sent
    (`encodeURIComponent` per key and value, joined with `&`, no re-ordering).
  - `body` is the raw JSON string for POST, `""` for GET.
- Worked example from `auth` (used as a unit-test vector for the pre-hash string):
  `2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT`
  (the docs give no expected signature value, so the HMAC step is tested against Node's
  `crypto` reference implementation on the same inputs).
- The `connector` implements the same thing: `requestPath = basePathSegment + path + search`,
  `bodyString = JSON.stringify(bodyParams)`, `timestamp = new Date().toISOString()`.
- Anti-replay: a signature (or nonce) is valid once within `2 × recvWindow`. Never resend an
  identical signed request; re-sign on retry.

Response envelope (source: `llms-full` "Unified Response Format"):

```json
{ "code": 0, "msg": "success", "data": {}, "timestamp": 1713500000000, "success": true }
```

`code = 0` is success. Errors use the same shape with a non-zero `code` and `data: null`.

Gateway errors (`auth`): 400 `40001` bad params, 401 `40101` bad/missing key, 401 `40102` bad
signature, 401 `40103` timestamp expired or replay, 403 `40104` no permission, 429 `42900` rate
limit (with `Retry-After` seconds), 500 `50000`, 503 `50001`.

Rate limits (`auth`): 1,200 req/60s per IP, 1,200 per key, 6,000 per user, **5 RPS per endpoint**.

## 3. RWA data (catalog and prices)

Source: `market-intro` table "RWA Data"; parameters and fields from `connector`
`modules/rwadata-api.ts` and `types/get-rwa-*`.

### GET `/api/v1/dex/market/rwa/platforms`

- Query: `platformId?` (`ondo` | `bstock`)
- `data[]`: `platformId`, `tickerCount`, `chainDistribution[]`, `website`, `logoUrl`

### GET `/api/v1/dex/market/rwa/tokens` (used by the seed script and price cron)

- Query: `binanceChainId?` (`"56"`), `platformId?` (`ondo` | `bstock`), `tabId?` (sector)
- `data[]` fields:
  - `binanceChainId`, `tokenContractAddress`, `platformId`, `assetType` (1 stock, 2 pre-IPO, 3 ETF)
  - `tokenName`, `tokenSymbol`, `tokenLogoUrl`, `decimals` (string)
  - `underlyingTicker`, `underlyingName`, `tokenToShareRatio` (string, e.g. `"1.003701"`)
  - `tokenPrice` (on-chain USD), `referencePrice` (per-share price derived from the on-chain
    price, **not** an official stock-market quote), `volume24H`, `marketCap`, `peRatioTTM`
  - `statusInfo`: `openState` (bool), `marketStatus` (`premarket` | `regular` | `postmarket` |
    `overnight` | `closed` | `pause`), `reasonCode`, `reasonMsg`, `nextOpenTime`, `nextCloseTime`
- No 24h change field. 24h change comes from candles (section 4).

### GET `/api/v1/dex/market/rwa/price`

- Query: `binanceChainId` (required), `tokenContractAddresses` (comma-separated, max 100)
- `data[]`: `binanceChainId`, `tokenContractAddress`, `platformId`, `tokenPrice`,
  `referencePrice`, `tokenPriceUpdatedAt` (ms)

### GET `/api/v1/dex/market/rwa/search`

- Query: `keyword` (**required**; ticker, company name or contract address), `platformId?`
- `data[]`: `ticker`, `companyName`, `assets[]` of `{platformId, binanceChainId,
  tokenContractAddress, tokenSymbol, assetType}`
- Because `keyword` is required it cannot list the whole catalog. `docs/BACKEND.md` §6 said to
  seed from `platforms` + `search`; the seed uses `rwa/tokens` instead.

### GET `/api/v1/dex/market/rwa/underlying-market`

- Query: `binanceChainId`, `tokenContractAddress` (both required)
- `data`: `statusInfo` (as above), `marketData`: `referencePrice`, `high52W`, `low52W`,
  `volumeShares24H`, `totalShares`, `marketCap`, `peRatioTTM`, `dividendYield`, ...

## 4. Candles

Source: `market-intro` ("Get Token Candlestick Data", GET); params from `connector`
`GetCandlesRequest`; response from `types/get-candles-response.ts`.

### GET `/api/v1/dex/market/candles`

- Query: `binanceChainId`, `tokenContractAddress` (required), `bar?` (default `1m`), `after?`
  (ms, candles earlier than), `before?` (ms, candles later than), `limit?` (default 100)
- `bar` values: `1s 5s 30s 1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M` (lowercase `h`,
  `d`, `w`). `docs/BACKEND.md` listed `1H`/`1D`; the route maps UI timeframes to these values.
- `data`: array of 7-number arrays `[open, high, low, close, volume, timestampMs, tradeCount]`.

## 5. Trading API

Sources: `trading-intro`, `integration-flow`, `trading-errors`; params and fields from `connector`
`modules/trading-api.ts` and `types/*quote*`, `*swap*`, `*rfq*`.

### Which flow applies

- Ondo tokens: always `executionMode=RFQ` (vendors InchFusion, CowSwap, PcsXRfq).
- bStock tokens: mixed. A `SWAP` route (LiquidMesh) and an `RFQ` route (PcsXRfq) may both come
  back. Each route in the `/quote` response carries its own `executionMode` and `quoteId`.
- Ondo pairs must use a whitelisted stablecoin; on BSC that is USDT (`40368`). bStock pairs must
  use a whitelisted counter token (`40370`). USDT is the only input we use.

### GET `/api/v1/dex/aggregator/quote`

- Query: `binanceChainId` (`"56"`), `amount` (sell amount, smallest unit, integer string),
  `fromTokenAddress`, `toTokenAddress`, `userWalletAddress` (**required for RFQ**; it is the RFQ
  receiver and must be the wallet that signs), optional `vendor`, `feePercent` + `feeSource`.
- `data[]` (routes sorted by `toTokenAmount` desc): `quoteId` (TTL ~30s), `vendorName`,
  `fromTokenAmount`, `toTokenAmount`, `tradeFee` (USD), `estimateGasFee` (wei),
  `priceImpactPercent`, `executionMode` (`SWAP` | `RFQ`), `approveTarget` (informational spender),
  `isBest`, `fromToken`/`toToken` `{tokenContractAddress, tokenSymbol, tokenUnitPrice, decimal,
  isHoneyPot, taxRate}`.

### GET `/api/v1/dex/aggregator/approve-transaction`

- Query: `binanceChainId`, `tokenContractAddress`, `approveAmount` (smallest unit), `vendor`
  (**required for RFQ/equity routes**: the `vendorName` from `/quote`; omit for plain SWAP).
- `data[]`: `data` (ERC-20 `approve()` calldata), `dexContractAddress` (spender), `gasLimit`,
  `gasPrice`.
- The tx goes to the token contract with `data` as calldata. We decode the calldata to check the
  spender equals `dexContractAddress` and the amount equals what we asked for (exact approvals).
- Order for RFQ: `/quote` first (to learn the vendor), then `/approve-transaction`, then `/swap`.
  For SWAP: approval before `/quote`. Wait for the approval receipt before continuing.

### GET `/api/v1/dex/aggregator/swap`

- Query: `binanceChainId`, `amount`, `fromTokenAddress`, `toTokenAddress`, `userWalletAddress`,
  `quoteId` (from `/quote`, within ~30s), and `slippagePercent` **or** `autoSlippage=true`.
  Parameters must match the quote or `40462` comes back. Expired quote: `40401`.
- `data`:
  - `executionMode`
  - `tx` (SWAP): `from`, `to` (router), `data`, `value`, `gas`, `gasPrice`,
    `maxPriorityFeePerGas?`, `minReceiveAmount`, `slippagePercent`
  - `rfq` (RFQ): `vendor`, `txType` (`EIP712`), `typedDataToSign` ("serialized as a hex string
    (or JSON-encoded string)" — the client accepts JSON, or hex-encoded UTF-8 JSON, and fails
    loudly on anything else), `signingScheme`, `orderId`
    (`rfq.orderId` is what `/order/submit` calls `quoteId`, per `integration-flow`)
  - `routerResult`

SWAP legs: the user's wallet sends `tx` itself (Privy/viem). `integration-flow` also offers
`POST /pre-transaction/broadcast-transaction`; we don't need it because the wallet broadcasts
through our RPC and we verify the receipt plus the balance delta ourselves.

### POST `/api/v1/dex/aggregator/order/submit` (RFQ only)

- JSON body: `requestId` (UUID v4 idempotency key; same UUID on retry returns the original
  result within 30 min), `userSignature` (`0x` + 65 bytes, EIP-712 `eth_signTypedData_v4` of
  `rfq.typedDataToSign`), `vendor` (= `rfq.vendor`), `quoteId` (= `rfq.orderId`),
  `signingScheme?` (= `rfq.signingScheme`)
- `data`: `orderId`, `status` (typically `PENDING_VENDOR`), `createdAt`
- `42901` = a submit with this `requestId` is already in flight; wait, then retry with the same id.
- We never auto-retry a submit on network errors without the same `requestId`.

### GET `/api/v1/dex/aggregator/order/{orderId}`

- `data`: `orderId`, `status`, `txHash` (only when `FILLED`), `fromAmount`, `toAmount`,
  `filledAt`, `createdAt`
- Statuses: terminal `FILLED`, `FAILED`, `EXPIRED`, `CANCELLED`; intermediate `PENDING_VENDOR`,
  `PENDING_ONCHAIN`. Our API normalizes to `PENDING` | `FILLED` | `FAILED` | `EXPIRED`
  (`CANCELLED` → `FAILED`).
- `FILLED` is not the end of our check: the leg only counts after a verified balance increase at
  the user's address (`CLAUDE.md`).

### Equity-specific errors on `/quote` (`trading-errors` "RFQ Orders")

| Code | Meaning | App behaviour |
| --- | --- | --- |
| `40374` | no liquidity from any vendor | leg fails with "No liquidity right now" |
| `40366` | Ondo max single order exceeded | show message |
| `40367` | Ondo underlying market closed | show "Market closed" with next open time |
| `40369` | bStock exchange closed | same |
| `40368` / `40370` | counter token not whitelisted | should not happen with USDT; surface raw |
| `40375` | Ondo order below minimum USD, exact minimum in `msg` (example: "Minimum order amount is 20 USD.") | show `msg`; see §7 |

### Custom fee

Binance's referral fee (`feePercent`) is ignored on RFQ routes (`trading-intro`, fee doc). Our fees
are collected by the vault contract instead, so we never send fee params.

## 6. Differences from our docs

1. **Hosting region.** Not in our docs at all: US and GB are prohibited for both client and server
   IP. Vercel must run functions in `sin1` (or another permitted region), and US/GB/CA/NL visitors
   are refused on trading routes.
2. **Ondo minimum order size.** `40375` says Ondo orders have a USD minimum (doc example: $20).
   Our settled rule is a $5 minimum for 1–3 component Stacks, which gives ~$1.67 legs. Stacks with
   an Ondo component will fail the Ondo leg below that minimum. **Not changed in code; reported.**
   The buy sheet surfaces the exact `msg` from the quote before any money moves.
3. **RFQ approvals are vendor-specific** (e.g. Permit2 for PcsXRfq). The approval spender comes from
   `/approve-transaction?vendor=`, not from `approveTarget`.
4. **Catalog source.** `rwa/search` needs a keyword; the seed uses `rwa/tokens?binanceChainId=56`.
5. **Candle bars** are lowercase (`1h`, `1d`, `1w`).
6. **No 24h change in RWA data.** Computed from `1h` candles.
7. **`price-info` (POST)** has no documented body in either source, so it is not used.
8. **Market status** is provided per token (`statusInfo`), which we store as `market_open` and use
   for the `Market closed` note.
9. **`rfq.orderId` is under-documented.** `integration-flow` and the connector's `/order/submit`
   parameter docs both say `quoteId` = `rfq.orderId`, but the connector's `/swap` response type does
   not declare `orderId`. The client treats it as optional and stops with a clear error if a live
   response lacks it.
10. **Ondo routes are not always RFQ.** `trading-intro` says Ondo "always" returns `executionMode=RFQ`.
    A live route probe on 2026-09-27 (USDT → token, $25, from the `sin1` preview) returned `SWAP`
    for 20 of 40 Ondo tokens, `40367` market closed for 16 and `40374` insufficient liquidity for 4.
    All 46 bStocks returned `SWAP`; no RFQ route came back for either provider that day. The leg
    runner handles both modes, so nothing depends on the documented split.
11. **Receiver confirmed.** RFQ output goes to `userWalletAddress` (the signer), matching
   `docs/FLOWS.md` §4. The vault is never the swap recipient.
