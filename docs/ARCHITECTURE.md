# StacksClub — Project, Backend, and Architecture Context

This document explains the product and its technical model so another assistant can continue exploring the idea without rebuilding context from scratch.

## 1. The idea

**StacksClub** is a social market for tokenized stocks and creator-made stock baskets (“Stacks”) on BNB Smart Chain. The product combines:

- A market for tokenized stock tokens that already exist on BNB Chain.
- Provider comparison, so a user can choose between available versions of the same underlying stock.
- Creator-defined, immutable stock baskets that users can buy as individual positions.
- Social identities and activity around the people who create and buy those stocks and baskets.

The simplest description is **a social trading app for tokenized stocks on BNB Chain, with user-created stock baskets**. It is not an issuer, stock broker, custody provider, or promise that a token is legally equivalent to a share of the underlying company. The app trades and holds existing onchain provider tokens. “Redeem underlying” means return those exact provider-token units to the user's wallet; it does not mean cash redemption with the issuer.

The current project is aimed at the BNB Chain tokenized-stocks hackathon. Target network is BNB Smart Chain mainnet, chain ID `56`; check the current hackathon rules before submission.

## 2. Product decisions already made

### Stock assets and providers

- Support provider-issued stock tokens deployed on BNB Chain.
- **bStocks is the default where available.** Users should be able to compare bStocks with Ondo and xStocks where each exact asset is verified and supportable.
- A stock asset is identified by **provider + chain ID + contract address**, never ticker alone. For example, two NVDA tokens from different providers are separate onchain assets with potentially different prices, share ratios, restrictions, and liquidity.
- The Binance Web3 RWA API currently documents bStocks (`bstock`) and Ondo. It must not be treated as an xStocks directory. xStocks need a separate official/verified source and a curated BNB contract allowlist.
- An ERC-20/BEP-20 interface does not prove an asset has a route, deep liquidity, free transferability, open issuer market, or issuer redemption rights. The app must check the real contract and current route/status per provider asset.
- Users may buy BNB, USDT, or USDC as input/settlement assets only when a real route exists. BNB is also required for user-paid network gas.

### Stacks

- A **Stack is a recipe**, not a fungible token. It contains 2–5 selected stock-token assets and fixed weights summing to 100% (stored as 10,000 basis points).
- A creator picks the provider token for each component, weights, name/ticker, description, and icon/image. After launch, the recipe cannot be edited.
- The first version is stocks only. Memecoins, arbitrary tokens, leverage, lending/earn, and DCA are later ideas, not initial scope.
- Creating a Stack has no app fee; the creator still pays BNB gas for the onchain transaction.
- Minimum purchase is `$1` for 1–3 assets and `$10` for 4–5 assets.
- Weights apply to the amount allocated when a user buys. There is no automatic rebalancing. If a Stack starts 50%/25%/25%, the next buy uses that recipe, but later price changes can make the holdings' market-value weights very different.

### Position ownership

- The product uses **NFTs under the hood**, but those NFTs represent individual user positions and should not be presented as collectible NFTs in product logic.
- There is no fungible AIK/Stack token with a shared redemption formula. Each purchase creates its own position record/NFT and stores the exact underlying quantities received in that purchase.
- A position is therefore a specific lot: e.g. `x` units of one provider's NVDA token, `y` units of META, etc. Its current value is calculated from those exact units and current token marks.
- Two users buying the same Stack at different times can have different quantities and values while owning positions in the same immutable recipe.
- Do not rebalance a user's holdings to restore the original weights. Do not promise a user's original dollar value or initial weights on redemption.
- Repeated purchases should initially remain separate positions onchain for simple lot accounting; the app can aggregate them conceptually in portfolio calculations later without merging contract records.

### User transactions, fees, and social layer

- Users authenticate through Privy (email/social sign-in and a Privy-managed or connected EVM wallet). The user wallet signs user transactions; the application must not custody user funds or use an app hot wallet for swaps.
- Users pay their own BNB gas. Do not silently take stablecoins, convert them into BNB, or add a gas sponsor for the initial version.
- Buy fee is 1%; sell fee is 1%. For a Stack buy, the creator receives 25% of that buy fee and the platform receives 75%. Standalone stock trade fees go to the platform. Sell fees go to the platform.
- Stack creation itself is free of app fees.
- Social profile fields: username, avatar, bio, and optional X profile URL. An X link is not “verified” unless actual verification is implemented.
- Supabase holds social data and searchable metadata. It is never the source of truth for a position's owner or balance.

## 3. How each financial action is intended to work

### Buy a standalone stock token

1. User selects the exact provider asset and input token (BNB, USDT, or USDC).
2. The server asks the trading/quote provider for a fresh route and checks that the route uses the exact allowlisted contract and BSC chain.
3. The user reviews expected output, minimum received, fee, route/provider, quote age, and gas/approval requirements.
4. User signs the supported execution flow. The app verifies the final receipt/order and token balance before showing the trade as complete.

### Create a Stack

1. Creator chooses 2–5 approved provider assets and sets each weight.
2. Validate unique components, supported transfer/custody, valid integer basis points, total exactly 10,000, and required metadata.
3. Store public image/description metadata (e.g. Pinata CID) and register the immutable recipe onchain.
4. Creator pays BNB network gas; the product charges no creation fee.

### Buy a Stack position

1. User enters a gross buy amount and selects BNB, USDT, or USDC.
2. Get a fresh executable quote/order for each component. Allocate the investable amount using the immutable weights and exact token decimals.
3. Charge the 1% buy fee once against the overall purchase amount, not once per basket component. For a Stack buy, split that fee 25% to the creator and 75% to the platform. The gross-versus-net amount convention should be displayed unambiguously and finalized in fee implementation.
4. Execute each component conversion/order. In general this is a sequence, not a single atomic basket trade. Do not claim all-or-nothing settlement if swaps/orders are separate.
5. Component tokens arrive in the user's wallet (verify the actual provider behavior and recipient; do not assume the vault can be the swap recipient).
6. User approves the vault for exact token amounts where needed and deposits all purchased component tokens. The vault records those exact raw quantities and mints one position NFT.
7. Only after the deposit receipt is confirmed is the position complete.
8. If one leg fails, stop the remaining legs, preserve already acquired tokens in the user's wallet, let the user resume/keep them, and do not mint an incomplete position.

### Redeem underlying from a position

1. Read the position NFT owner and remaining exact raw quantities from the contract.
2. User selects full or partial redemption.
3. The vault returns the same proportion of every component token directly to the owner's wallet, subject to safe rounding.
4. On a partial redemption, round down and leave residual dust in the position. On a full redemption, transfer all remaining raw units. Burn the NFT only when no component balance remains.

### Sell a position for USDC, USDT, or BNB

1. Read position quantities and obtain a fresh sell route for each underlying component into the selected settlement token.
2. User chooses the fraction to sell; the same fraction applies across the basket.
3. The vault releases that fraction of every component to the user's wallet and reduces the position's balances.
4. Execute each underlying-to-settlement conversion through the supported transaction/RFQ path.
5. Charge 1% of actual gross sale proceeds to the platform after settlement. A creator receives no sell-fee share.
6. Mark complete only after all intended swaps and fee collection are confirmed. If a swap fails partway, the wallet may contain settled stablecoin plus unsold underlying tokens. Record and show this as a partial/recoverable outcome; never imply that all assets were sold.

The “Sell” and “Redeem underlying” actions are deliberately different: Sell converts to a chosen settlement asset; Redeem returns the stock tokens unchanged.

## 4. Current technical facts and integration constraints

### Binance Web3 API

Use Binance's official Web3 API server-side for supported BSC RWA catalog data, token/reference pricing, candles, quotes, and trade construction/order submission. The API uses signed requests, so signing keys stay on the server.

Important behavior to carry forward:

- Binance RWA catalog data currently identifies bStocks and Ondo; it is not a complete source for xStocks.
- General market data exposes token candles. These are token-price candles, not necessarily the underlying U.S. exchange's price history.
- Trading API has different execution modes. `SWAP` routes return ordinary transaction details for user wallet signing. Tokenized equity/RWA routes may return `RFQ`; those require the user to sign EIP-712 typed data, the backend to submit the signed order using its authenticated Binance API, and the backend/app to poll until `FILLED` or `FAILED`. A signature or submission is not proof of a completed trade.
- For RWA/RFQ execution, confirm the actual output recipient and token settlement before designing the deposit step. Do not assume contract-directed delivery or that every stock token supports the same flow.
- Quotes are time-sensitive. Re-quote if expired; never use historical chart prices as trade quotes.
- Binance's custom fee mechanism documents one referrer address per swap. Do not assume it performs a 75/25 creator/platform split. The fee split needs a separately verified, auditable implementation.

### PancakeSwap

- PancakeSwap's BNB Smart Chain V2/V3 subgraphs can provide Pancake pool-specific data such as liquidity, price, and volume.
- Use this only when the exact stock-token contract has a verified pool with credible liquidity. A pool snapshot is venue-specific and may be thin or stale; it is neither a universal reference price nor an executable quote.
- Binance Trading API remains the primary source for a fresh executable BSC trade route if it returns one. Do not assume PancakeSwap's separate Aggregator API supports BNB Chain; re-check official network support before considering it.

### BNB Chain contracts

The backend is conventional EVM engineering, but the key product-specific work is exact per-position accounting and a basket buy/sell that may require multiple independent provider orders. Standard ERC-20 ABI compatibility does not remove route, provider, settlement, market-status, custody, and partial-failure concerns.

The simplest reasonable contract design is one `StacksClubVault` combining:

- Verified asset and settlement-token allowlists.
- Immutable Stack recipe registration with creator identity, metadata URI, provider asset addresses, and component weights.
- ERC-721 position ownership.
- Per-position exact token balances and custody accounting.
- Partial/full redemption of underlying quantities.
- Fee collection and creator/platform fee split, if the fee mechanism can be enforced safely and transparently.
- Emergency pause for new deposits/creation while preserving safe withdrawals where possible.

Use OpenZeppelin ERC721, SafeERC20, ReentrancyGuard, and access control. Do not add a generic router or an admin escape hatch that can drain user-accounted assets. The contract must reject non-allowlisted components and must never let the total withdrawable liability exceed actual vault balances. A position's `ownerOf` is the authority for withdrawals.

## 5. Simple backend architecture

Keep the architecture as a single application, not a distributed system:

1. **Existing web app/server routes:** thin, typed endpoints for catalog/price/chart reads, signed Binance API calls, fresh quote/order requests, image upload, and authenticated social writes.
2. **Privy + viem:** user identity, wallet connection, EIP-712 signatures, user-signed transactions, BSC chain configuration.
3. **One BNB contract:** immutable recipes, positions/NFTs, escrowed stock-token units, redeem accounting, and fee enforcement if safely feasible.
4. **Supabase Postgres:** profiles, follows/reactions, Stack metadata/search cache, transaction/order status cache, and optional idempotent event index. Use RLS; server-role key only on server.
5. **Alchemy BSC RPC:** onchain reads, token/contract calls, receipts, and reconciliation.
6. **Binance Web3 API:** verified RWA data, current quotes, standard swap route execution or the appropriate RWA/RFQ flow.
7. **Pancake subgraphs:** optional venue data for validated BSC pool metrics.
8. **Pinata:** user/Stack media and metadata CID; server-side JWT only.

Do not start with microservices, Redis, a queue, an independent indexer, a custom oracle, or an app-controlled signing wallet. Use a small TTL cache for non-executable market data. Read positions from the contract. Supabase is an index/cache and social store, not the ledger.

## 6. Data and trust boundaries

### Asset registry

Each asset record should contain at least:

- Provider ID (`bstock`, `ondo`, `xstocks`, etc.).
- BSC chain ID 56 and checksum contract address.
- Underlying ticker/company name and provider token symbol.
- Token decimals and official share multiplier/ratio if available.
- Source and last verification time.
- Market status and transfer/vault capability.
- Separate booleans/statuses for browse, Stack creation, and executable buy/sell.

No creator or browser request may supply an arbitrary token contract for vault use. Provider data may be wrong or incomplete; verify contract code and essential ERC-20 reads on BSC, then place it in a curated allowlist.

### Position and transaction data

- Chain state is the source of truth for Stack recipes, NFT owner, held quantity, redemptions, fees emitted by contract, and successful onchain transactions.
- Supabase can cache transaction/RFQ state for fast lookup but must reconcile it against the final receipt or Binance order status.
- Make updates idempotent using `(chainId, txHash, logIndex)` for EVM logs and stable idempotency IDs for RFQ submission/retries.
- Never accept client-provided “confirmed,” “owned,” “earned fee,” or balance values as authoritative.

### Valuation

For an individual position, a defensible mark is:

`position mark value = sum(exact raw quantity per provider token × source-labelled current token mark adjusted for decimals)`

Keep the following separate:

- Provider token onchain/indicative price.
- Underlying reference price, adjusted by official share multiplier only when defined.
- Pancake pool quote for a specific pool.
- Fresh executable buy/sell quote and minimum received.
- User's deposit/cost basis, including explicit fee treatment.

Do not call an indicative mark the amount a user can necessarily sell for. No automatic rebalancing means recipe weights do not remain portfolio weights as markets move.

## 7. Open questions for continued product/engineering exploration

These are not settled yet; continue exploring them without changing the decisions above silently:

1. **What is the “price” or chart of a Stack recipe?** There is no fungible Stack token or single shared unit price. Individual position value is clear, but the public Stack page needs a defined reference series (e.g. a notional fixed-dollar buy at launch or a transparent recipe index). Do not present a Stack as having a tradable token price.
2. **Exactly how is cost basis computed?** Decide whether the stated purchase amount includes the 1% buy fee, how slippage/actual outputs affect cost basis, and how partial sells allocate it.
3. **How are creator fees paid?** Binance's documented custom fee has one receiver per swap. Choose and verify an onchain split/claim design or an explicit, auditable alternative. Do not display “creator earnings” until a confirmed fee has actually accrued and the creator can claim it under the chosen rules.
4. **Are position NFTs transferable?** Transferability is possible if all ownership and withdrawal checks follow `ownerOf` and the portfolio index tracks transfers correctly. A nontransferable position is simpler but changes user rights. This still needs a deliberate decision.
5. **How should interrupted basket buys recover?** Current safe default is individual user-wallet outputs, sequential orders, persisted steps, resume/keep-assets recovery, and no position minted until all required components are deposited. Avoid pretending this is atomic.
6. **How should a partially failed Sell recover?** The proposed flow can leave the user with a mixture of stable proceeds and stock tokens. Define when the position fraction is released, how completion status is represented, and how the user resumes without double-selling.
7. **How much token/provider coverage is reliable on day one?** bStocks and Ondo are exposed through Binance RWA data; xStocks needs a separate verified list and each route must be tested. A listing is not proof of a live tradable route.
8. **How strict should price freshness/liquidity thresholds be?** Define when to suppress price/P&L or disable buy/sell for stale quotes, thin Pancake pools, closed issuer markets, or disagreement between sources.
9. **What happens to provider-token transfers when the issuer pauses/halt controls?** Confirm each provider token can enter and leave the vault under actual contract rules, including halt/corporate-action states.
10. **What are the final transaction-count and gas expectations?** A Stack buy may require one fee collection, 2–5 quote/order actions, token approvals, and a final deposit. RWA RFQ signatures and standard swaps differ; measure real flows before claiming a one-click/atomic experience.

## 8. Explicitly out of scope for the first version

- Fungible Stack tokens, fixed supply, or external AMM liquidity for Stack shares.
- Exact personal deposit restoration as a fungible token promise.
- Automatic rebalancing.
- Memecoin components or launching tokens against Stack/stock assets.
- DCA, lending/earn, leverage, shorting, or margin.
- Fiat/card rails unless a real provider and required keys are added later.
- Backend custody, hot-wallet execution, or gas sponsorship.
- Promising issuer redemption, shareholder rights, voting, or dividends beyond verified provider documentation.

## 9. Current setup and useful official references

Project setup already reported: the GitHub repository exists, is connected to Codespaces and Vercel (`0x-stacks-club.vercel.app`), Alchemy was chosen for BNB RPC, the user says API keys are ready, and an isolated deployer wallet with a small BNB balance has been created. Do not put the deployer key in app runtime or use it for user transactions. Confirm actual repository configuration before changing anything.

Official docs to use for further exploration:

- BNB Chain tokenized-stocks hackathon: https://www.bnbchain.org/en/hackathons/tokenized-stocks
- Binance Web3 API docs index: https://web3.binance.com/en/dev-docs/llms.txt
- Binance Web3 full docs: https://web3.binance.com/en/dev-docs/llms-full.txt
- Binance API overview: https://web3.binance.com/en/dev-docs/introduction
- Binance authentication and request signing: https://web3.binance.com/en/dev-docs/authentication
- Binance RWA data: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data
- Binance market data/candles: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/general-data
- Binance Trading API: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api
- Binance Transaction API: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api
- Binance Wallet API: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/wallet-api
- PancakeSwap official subgraph directory: https://developer.pancakeswap.finance/apis/subgraph
- BNB Chain docs: https://docs.bnbchain.org
- Privy docs: https://docs.privy.io
- Supabase docs: https://supabase.com/docs
- Pinata docs: https://docs.pinata.cloud

Continue the discussion from this context. Preserve settled product decisions, clearly label unresolved items, and challenge assumptions where an API, issuer token, or contract behavior has not been verified.
