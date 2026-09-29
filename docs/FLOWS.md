# StacksClub Flows

Every money flow is a persisted state machine in `intents` and `intent_legs`. The client drives it, the server verifies each step before saving it. If the tab closes, reopening the app shows a banner "You have an unfinished buy" that resumes from the saved state.

All amounts are raw bigint units. USDT on BSC has 18 decimals, but always read decimals from the token, never hardcode.

## 0. Wallet and signing

- Privy embedded wallet is created on login for users without one. External wallets (MetaMask, Binance Wallet, Trust) are also allowed.
- Configure Privy with BSC mainnet as the default chain and set embedded wallet confirmation modals off (`showWalletUIs: false`) so the progress checklist is the only UI. External wallets will still show their own prompts. That's expected.
- Before any flow, check the user has enough BNB for the estimated gas. If not, show "You need about 0.002 BNB for network fees" with a link to the Deposit sheet.
- Approvals: approve exact amounts only, never unlimited.

## 1. Deposit

1. Show the user's wallet address as a QR and text.
2. Poll USDT and BNB balances every 5 seconds while the sheet is open.
3. On increase, toast `+25.00 USDT received` and refresh the portfolio.

No server state involved.

## 2. Buy a single stock

1. User enters gross amount G (at least $1 in USDT raw units).
2. `POST /api/intents` with `kind = buy_stock`. Server computes `fee = G * 100 / 10000` and `net = G - fee`, creates one leg USDT → asset for `net`.
3. Pay fee: approve `fee` USDT to the vault, call `payBuyFee(0, G)`. PATCH the intent with the tx hash. Server confirms the `BuyFeePaid` event and stores `fee_receipt_id`. Status `fee_paid`.
4. Run the leg (section 4). On FILLED and a verified balance increase, status `done`.
5. Insert a `trades` row and an `activity` row. Show the success state.

No position is created for single stocks. The tokens live in the user's wallet.

## 3. Buy a Stack

1. User enters G. Minimum $1 for 2 to 3 components, $5 for 4 to 5.
2. `POST /api/intents` with `kind = buy_stack`. The server reads the recipe from chain, computes fee and net, and splits net across components by weight. Allocation rule: `alloc[i] = net * weight[i] / 10000` rounded down, then add any remainder to the largest weight. Unit-test this.
3. Pay fee with `payBuyFee(stackId, G)`. Creator gets 25% of the fee as claimable.
4. Run each leg in sequence (section 4). Status `legs_running`.
5. When all legs are FILLED with verified balances, status `legs_done`.
6. Deposit: for each component approve exactly `actual_out[i]` to the vault, then call `openPosition(stackId, feeReceiptId, actualOuts)`. Status `depositing`, then `done` on the `PositionOpened` event.
7. Record trades and activity. Show "Position #N created".

Checklist labels shown to the user: `Pay fee`, `Buy NVDA (bStocks)`, `Buy MSFT (Ondo)`, `Buy GOOGL (bStocks)`, `Approve tokens`, `Create position`.

### Failure handling

- A leg fails or its quote expires: re-quote once automatically if the reason is expiry. Otherwise mark the leg `failed`, stop, and set the intent to `partial`.
- The user sees two choices:
  - `Retry` runs that leg again with a fresh quote.
  - `Stop and keep tokens` sets the intent to `cancelled`. Tokens already bought stay in the user's wallet and show up as single stock holdings. The fee is not refunded (the UI says this before they confirm).
- Never call `openPosition` unless every leg is `filled`.
- A resumed intent re-reads balances from chain first, so a leg that actually filled while the app was closed is detected and not bought twice. Match by the Binance order id status, not by balance alone.

## 4. Running one leg

1. `POST /api/quote` with from, to and amount.
2. If mode is `SWAP`: ensure allowance for the router the quote names (exact amount), have the user send the built tx, wait for the receipt, read the actual output from the balance delta.
3. If mode is `RFQ`: have the user sign the EIP-712 typed data the quote returns (`signTypedData` from Privy), `POST /api/orders` with the signature, then poll `GET /api/orders/[id]` every 2 seconds for up to 90 seconds. On `FILLED`, read the balance delta.
4. Verify the output token arrived at the user's own address and `actual_out >= min_out`. If the tokens landed anywhere else, stop and report it (this breaks an assumption in these docs).
5. Save `actual_out`, `order_id` or `tx_hash` to the leg. Status `filled`.

## 5. Sell and redeem

### Sell a single stock
1. User picks a %. Leg: asset → USDT for that fraction of their wallet balance.
2. Run the leg. On FILLED, compute proceeds from the USDT balance delta.
3. Approve and call `paySellFee(0, proceeds)`.
4. Record trade and activity.

### Sell a Stack position
1. User picks a %, converted to bps.
2. Call `release(positionId, bps, 1)`. The released units land in the user's wallet. Store the released amounts on the intent.
3. Create one leg per component, component → USDT for the released amount.
4. Run legs in sequence. Sum proceeds from the USDT balance deltas.
5. Approve and call `paySellFee(positionId, totalProceeds)`.
6. If a leg fails, the intent is `partial`. The UI shows what was sold, what is still in the wallet as a single stock, and offers `Retry` for the remaining legs. Released units are never re-deposited automatically. The position is already reduced onchain, so there is no double-sell risk.

### Redeem
1. User picks a %.
2. Call `release(positionId, bps, 0)`. Tokens go to the user's wallet.
3. Done. No fee.

## 6. Stack index (the Stack "price")

A Stack has no token and no market price. The public chart uses a fixed-units index.

1. At creation, the server takes the current onchain price `p0[i]` of each component and computes notional units `u[i] = (1000 * weight[i] / 10000) / p0[i]`. Store `u` as `launch_units`. Index value at launch is 1000.
2. At any time, `index = sum(u[i] * p_now[i])`. `change since launch = index / 1000 - 1`.
3. The same with reference prices gives `reference_value`.
4. Cron appends a point every 5 minutes. The chart shows these points. For 1H and LIVE, compute from component candles on demand.
5. Display the index as a number like `1,042.18`, never with a `$`, and explain it in About: "Value of $1,000 put into this Stack at launch, without rebalancing."

Unit-test the index math.

## 7. Position valuation and PnL

- Value = `sum(balance[i] * price[i] / 10^decimals[i])` using current onchain prices. Label as indicative.
- Cost basis = gross amount G of the buy that opened it, fee included. For a partial sell, reduce the cost basis by the same bps.
- PnL = value − remaining cost basis. Show both $ and %.
- Portfolio total = USDT balance + single stock holdings value + all positions value. 24h change uses each price's 24h change.

## 8. Create a Stack

1. Client validates components, weights and ticker (see UI spec 8.2).
2. `POST /api/stacks/metadata` uploads the image and returns `metadataURI`.
3. User calls `createStack(assets, weights, metadataURI, ticker)`.
4. On the `StackCreated` event, the server upserts `stacks`, computes `launch_units`, writes the first index point and an `activity` row.
5. Redirect to the Stack page with a share prompt ("Share AI Kings on X") that prefills a tweet with the link.

## 9. Creator claim

1. Profile shows `creatorClaimable` read from chain, never from Supabase.
2. `claimCreatorFees()`. On the event, toast and record activity.

## 10. Leaderboards

- Weekly Top Trades: sum of realised plus unrealised PnL per user from `trades` in the last 7 days, top 10, each card showing the single best asset or Stack.
- Hall of Fame: Stacks ranked by total creator fees earned from `BuyFeePaid` events.
- Computed in SQL views, cached 60 seconds.
