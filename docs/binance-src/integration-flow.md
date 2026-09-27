# Integration Flow

A complete token-swap integration spans three Binance Web3 APIs:

- **Trading API** selects a route, builds the swap transaction, and provides the ERC-20 approval
  transaction data when authorization is needed.
- **Transaction API** broadcasts transactions after your wallet signs them.
- **Wallet API** reads the resulting on-chain transaction and its status.

> The Trading API and Transaction API **never hold your private key**. They only return unsigned
> transaction data or relay a transaction that you have already signed. Keep signing operations in
> your own wallet or signer.

Every request to these APIs is authenticated with your API Key and Secret Key. See
[Authentication](/authentication) for the required headers and HMAC signing details.

## Two Meanings of “Authorization”

This flow contains two separate authorization concepts:

1. **API request authentication**: every Binance Web3 API request must include `X-OC-APIKEY`,
   `X-OC-TIMESTAMP`, and `X-OC-SIGN`. See [Authentication](/authentication) for HMAC signing
   details.
2. **ERC-20 token approval**: before an EVM swap can spend an ERC-20 token, the token contract must
   approve the selected DEX spender. This is an on-chain transaction signed by the user's wallet. It
   is conditional: skip it when the allowance is already sufficient, and do not use this pattern for
   native tokens, Solana, or Tron.

## End-to-End Flow (SWAP mode)

The following is the standard flow for regular tokens. The approval step is conditional and must be
confirmed on-chain before the swap transaction is submitted.

```
0. Authenticate every API request with API Key + Secret Key
1. GET  /approve-transaction (optional) → request ERC-20 approval transaction data
   Sign and broadcast the approval tx, then wait for confirmation
2. GET  /quote                         → select a route and receive quoteId
3. GET  /swap                          → get the unsigned swap tx
4. Sign the swap tx locally with the user's wallet
5. POST /broadcast-transaction         → broadcast the signed swap tx
6. GET  /transaction-detail-by-txhash → poll the final on-chain status
```

For latency-sensitive integrations, `GET /quote-and-swap` combines steps 2 and 3. It does not remove
the conditional ERC-20 approval step.

## Step 0 — Authenticate API Requests

All requests in this guide are authenticated. Use the exact URL path, including `/build`, when
calculating `X-OC-SIGN`; the API request signature is separate from the on-chain wallet signature.
See [Authentication](/authentication) for the required headers, HMAC-SHA256 pre-hash, timestamp
window, and rate limits.

## Step 1 — Request and Submit the ERC-20 Approval (Conditional)

Approval is needed only when all of the following apply:

- the selected chain is EVM;
- the sell token is an ERC-20 token; and
- the user's current allowance for the standard DEX spender is less than the amount to swap.

For a regular `SWAP` integration, check the allowance first and, when it is insufficient, call the
authorization endpoint `GET /api/v1/dex/aggregator/approve-transaction` **before** requesting a
quote. This endpoint is the source of the approval transaction data. At this point, `approveTarget`
is not available yet and is not required to call the authorization endpoint.

| Parameter              | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| `binanceChainId`       | The chain where the swap will be executed                            |
| `tokenContractAddress` | The sell-token contract address                                      |
| `approveAmount`        | The amount to authorize, in the token's smallest unit                |
| `vendor`               | Omit for the regular SWAP flow; use a `vendorName` only for RFQ flow |

The response contains `data[].data` (ERC-20 `approve()` calldata), `dexContractAddress` (the
spender), and gas fields. Construct an EVM transaction whose `to` is the token contract address,
whose `data` is the returned calldata, and whose `from` is the user's wallet. Sign it locally and
broadcast it through `POST /api/v1/dex/pre-transaction/broadcast-transaction`.

Wait until the approval transaction is confirmed before continuing to `/quote`. Do not confuse the
approval transaction with the swap transaction: each has its own nonce, signature, `txHash`, and
status. Passing `approveTransaction=true` to `/swap` is a convenience for returning approval data in
`data.tx.signatureData`; it does not replace calling `/approve-transaction` when authorization is
needed, and the client must still sign, broadcast, and confirm the returned approval before the
swap.

> **RFQ exception:** RFQ/RWA routes require a vendor-specific approval in some cases, and the
> `vendor` parameter must be the `vendorName` returned by `/quote`. For RFQ, call `/quote` first,
> then call `/approve-transaction` with that vendor before continuing to `/swap`. See
> [RFQ mode](#rfq-mode-equity-tokens).

## Step 2 — Get a Quote

After the regular approval has been confirmed, or when approval was not needed, call
`GET /api/v1/dex/aggregator/quote` with the chain, token pair, amount, and (when required) the user
wallet address. Select a route from the response and retain its `quoteId`.

The quote response also tells you:

- `executionMode`: follow the `SWAP` flow for regular tokens or the
  [RFQ flow](#rfq-mode-equity-tokens) for equity/RWA tokens.
- `approveTarget`: an informational spender address for the selected route. It does **not** perform
  authorization and is not a substitute for `/approve-transaction`. For a regular SWAP, use it only
  to cross-check the spender returned by the authorization endpoint if your integration requires
  that validation.
- `quoteId`: the route identifier consumed by `/swap`; it expires in about 30 seconds.

If the quote expires, request a new quote instead of retrying the same `quoteId`.

## Step 3 — Build the Swap Transaction

Call `GET /api/v1/dex/aggregator/swap` with the `quoteId` from step 2 and the same route parameters:
`binanceChainId`, `fromTokenAddress`, `toTokenAddress`, `amount`, and the required
`userWalletAddress` (the wallet that will sign the transaction, i.e. the sender). Slippage is set
with `slippagePercent` or `autoSlippage=true` — one of the two must be provided. These parameters
must match the cached quote. The response returns an **unsigned** payload under `data.tx`.

You can instead call `GET /api/v1/dex/aggregator/quote-and-swap` with the full quote parameters when
you do not need to choose a route first. Currently its `vendor` shortcut supports `LiquidMesh`.

| Chain family      | What the unsigned payload contains                                                      |
| ----------------- | --------------------------------------------------------------------------------------- |
| EVM               | `from`, `to`, `data`, `value`, `gas`, `gasPrice`, and optionally `maxPriorityFeePerGas` |
| Solana (`CT_501`) | Versioned transaction data plus `computeUnitPrice` and `computeUnitLimit`               |
| Tron (`CT_195`)   | Router `to`, contract calldata in `data`, and call `value`                              |

## Step 4 — Sign Locally

Use the wallet that owns `data.tx.from` (or the supplied user wallet address). The Binance Web3 API
must never receive a private key or seed phrase.

### EVM chains (BSC, Ethereum, Base, ...)

Map the response fields to an EIP-1559 or legacy transaction and sign it. The resulting raw signed
transaction is a hex string beginning with `0x`.

| `data.tx` field        | Signed transaction field           |
| ---------------------- | ---------------------------------- |
| `from`                 | Signer / sender                    |
| `to`                   | Transaction recipient (DEX router) |
| `data`                 | ABI-encoded calldata               |
| `value`                | Native-token value in wei          |
| `gas`                  | Gas limit                          |
| `gasPrice`             | Legacy gas price in wei            |
| `maxPriorityFeePerGas` | EIP-1559 priority fee in wei       |

### Python example: sign approval and swap transactions

Install the signing and RPC libraries:

```bash
pip install eth-account web3
```

The following example uses the `eth-account` private-key signer and a JSON-RPC connection only to
obtain the next nonce. `approve_response` is the JSON response from `/approve-transaction`, and
`swap_response` is the JSON response from `/swap`. The private key stays local and is never sent to
Binance Web3 API.

```python
import os

from eth_account import Account
from web3 import Web3

CHAIN_ID = 56  # BSC; use the chain ID from your request
RPC_URL = os.environ["EVM_RPC_URL"]
PRIVATE_KEY = os.environ["WALLET_PRIVATE_KEY"]
TOKEN_CONTRACT_ADDRESS = os.environ["FROM_TOKEN_ADDRESS"]

w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = Account.from_key(PRIVATE_KEY)


def as_int(value):
    """Convert decimal or 0x-prefixed API values to integers."""
    if value is None:
        return 0
    return int(value, 0) if isinstance(value, str) else int(value)


def sign_evm_transaction(*, to, data, value, gas, gas_price, max_priority_fee_per_gas=None):
    nonce = w3.eth.get_transaction_count(account.address, "pending")
    transaction = {
        "chainId": CHAIN_ID,
        "nonce": nonce,
        "to": Web3.to_checksum_address(to),
        "data": data or "0x",
        "value": as_int(value),
        "gas": as_int(gas),
    }
    if max_priority_fee_per_gas:
        transaction["maxFeePerGas"] = as_int(gas_price)
        transaction["maxPriorityFeePerGas"] = as_int(max_priority_fee_per_gas)
    else:
        transaction["gasPrice"] = as_int(gas_price)

    signed = account.sign_transaction(transaction)
    raw_transaction = signed.raw_transaction.hex()
    return raw_transaction if raw_transaction.startswith("0x") else "0x" + raw_transaction


# 1) For a regular SWAP, call GET /approve-transaction before GET /quote
#    when the allowance is insufficient.
approve_item = approve_response["data"][0]
signed_approval_tx = sign_evm_transaction(
    to=TOKEN_CONTRACT_ADDRESS,  # approve() is called on the token contract
    data=approve_item["data"],
    value=0,
    gas=approve_item["gasLimit"],
    gas_price=approve_item["gasPrice"],
)

# Send signed_approval_tx as signedTransaction to the broadcast endpoint,
# wait for approval confirmation, and then call GET /quote.

# 2) After the quote is selected, call GET /swap.
swap_tx = swap_response["data"]["tx"]
if swap_tx["from"].lower() != account.address.lower():
    raise ValueError("The swap transaction sender does not match the signing wallet")

signed_swap_tx = sign_evm_transaction(
    to=swap_tx["to"],
    data=swap_tx["data"],
    value=swap_tx.get("value", "0"),
    gas=swap_tx["gas"],
    gas_price=swap_tx["gasPrice"],
    max_priority_fee_per_gas=swap_tx.get("maxPriorityFeePerGas"),
)

broadcast_payload = {
    "binanceChainId": str(CHAIN_ID),
    "address": account.address,
    "signedTransaction": signed_swap_tx,
    "enableMevProtection": False,
}
# POST broadcast_payload to /broadcast-transaction with the API HMAC headers.
```

The helper uses the returned `gasPrice` as the legacy `gasPrice` when `maxPriorityFeePerGas` is
absent. When `/swap` returns `maxPriorityFeePerGas`, it uses the returned `gasPrice` as
`maxFeePerGas` and constructs a type-2 EIP-1559 transaction. The raw signed transaction is
normalized to a `0x...` string before it is sent as `signedTransaction`. The API request HMAC
signature and the on-chain wallet signature shown above are independent.

### Solana (`CT_501`)

Sign the versioned transaction with the user's Solana wallet and serialize the signed transaction as
base64. If you need to add instructions before signing, use `/swap-instruction`, compile the v0
transaction locally, and then sign it.

### Tron (`CT_195`)

Build a `TRIGGER_SMART_CONTRACT` transaction from the returned fields, sign it with a Tron signer,
and serialize the signer's JSON object as `signedTransaction`. It must contain `raw_data` and a
`signature` array. Do **not** send the raw calldata hex as `signedTransaction`; the broadcast API
will reject it because it cannot identify the signer.

## Step 5 — Broadcast the Signed Swap Transaction

Call `POST /api/v1/dex/pre-transaction/broadcast-transaction`:

| Field                 | Value                                                         |
| --------------------- | ------------------------------------------------------------- |
| `binanceChainId`      | The same chain ID used by `/quote` and `/swap`                |
| `signedTransaction`   | EVM raw signed hex, Solana base64, or Tron signed JSON string |
| `address`             | The user's wallet address; for EVM this is `data.tx.from`     |
| `enableMevProtection` | Optional and EVM-only; `true` uses a private mempool          |

A successful response returns `data.txHash` and an internal `data.orderId`. Keep the `txHash`; it is
the key used by the Wallet API to query the transaction details.

### Sample Broadcast Call (EVM)

```bash
curl -X POST 'https://web3.binance.com/build/api/v1/dex/pre-transaction/broadcast-transaction' \\
  -H 'X-OC-APIKEY: your-api-key' \\
  -H 'X-OC-TIMESTAMP: 2026-08-04T00:00:00.000Z' \\
  -H 'X-OC-SIGN: <request-signature>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "binanceChainId": "56",
    "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "signedTransaction": "0xf86c808504a817c80082520894d8da6bf26964af9d7eed9e03e53415d37aa96045880de0b6b3a76400008025a0...",
    "enableMevProtection": false
  }'
```

The `X-OC-SIGN` value above is the Binance Web3 API request signature. It is unrelated to the
on-chain wallet signature encoded in `signedTransaction`.

## Step 6 — Query Transaction Details and Poll Status

Use the `txHash` returned by the broadcast response with the Wallet API endpoint
`GET /api/v1/dex/post-transaction/transaction-detail-by-txhash`:

```bash
curl -G 'https://web3.binance.com/build/api/v1/dex/post-transaction/transaction-detail-by-txhash' \\
  -H 'X-OC-APIKEY: your-api-key' \\
  -H 'X-OC-TIMESTAMP: 2026-08-04T00:00:01.000Z' \\
  -H 'X-OC-SIGN: <request-signature>' \\
  --data-urlencode 'binanceChainId=56' \\
  --data-urlencode 'txHash=0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890'
```

The response's `data` array contains the transaction detail. Inspect `data[].txStatus`:

| `txStatus` | Meaning                                                 | Client action                                                  |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `pending`  | The transaction has been broadcast but is not finalized | Poll again with backoff                                        |
| `success`  | The transaction succeeded on-chain                      | Show the confirmed swap and token transfers                    |
| `fail`     | The transaction was mined but failed                    | Show the failure and inspect gas, method, and transfer details |

Immediately after broadcast, the endpoint may return an empty `data` array while indexing catches
up. Treat that as “not indexed yet,” wait briefly, and retry. Always pass both `binanceChainId` and
the exact `txHash`; hashes from the approval transaction and swap transaction are different.

The returned detail also includes block height, gas used, transaction fee, input/output addresses,
internal calls, and token transfers. Use `tokenTransferDetails` to verify that the expected sell and
buy-token movements occurred, rather than treating a broadcast response alone as proof of a
successful swap.

## Field Mapping Across the Complete Flow

| Source                                   | Next step                                                            |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `/approve-transaction` → `data[].data`   | Build the approval tx, sign, broadcast, and wait for confirmation    |
| `/quote` → `quoteId`                     | Pass to `/swap`                                                      |
| `/quote` → `approveTarget`               | Optional spender cross-check only; it does not perform authorization |
| `/swap` → `data.tx`                      | Map to the local wallet transaction and sign it                      |
| `/broadcast-transaction` → `data.txHash` | Pass to Wallet API transaction-detail-by-txhash                      |
| Wallet API → `data[].txStatus`           | Drive the final pending/success/fail UI state                        |

## RFQ Mode (Equity Tokens)

Equity / RWA tokens such as Ondo and BStock can return `executionMode=RFQ`. This is not the normal
raw-transaction flow: quote first to learn the `vendorName`, request vendor-specific approval when
needed, then sign an EIP-712 order and submit it to the RFQ service instead of broadcasting
`data.tx`.

```
1. GET  /quote            → executionMode = RFQ; obtain vendorName and typed-data inputs
2. GET  /approve-transaction (optional) → pass vendorName when ERC-20 approval is needed
   Sign and broadcast the approval tx, then wait for confirmation
3. GET  /swap             → returns rfq.typedDataToSign
4. Sign rfq.typedDataToSign with the user's wallet (eth_signTypedData_v4)
5. POST /order/submit     → submit userSignature + vendor + quoteId + requestId
6. GET  /order/{orderId}  → poll until FILLED / FAILED
```

The signing wallet must match `userWalletAddress` from `/quote`. `POST /order/submit` requires
`userSignature` (the EIP-712 signature), `vendor`, and `quoteId` — the latter two come from the
`rfq` object in the `/swap` response, and note that this `quoteId` is the value of `rfq.orderId`,
not the route identifier from `/quote`. Also pass `requestId`, a new UUID per order; reuse the same
`requestId` when retrying for idempotency. `signingScheme` is optional and defaults to the vendor's
default when omitted. For RFQ, use the RFQ order-status endpoint as the primary status source. The
Wallet API transaction detail endpoint applies to an on-chain transaction hash and is not a
replacement for RFQ order status.

## Common Pitfalls

| Pitfall                          | Fix                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `40102 Invalid signature`        | Include `/build` in the signed request path and sign the exact raw query string; see [Authentication](/authentication). |
| `QUOTE_EXPIRED` (40401)          | Call `/swap` within about 30 seconds of `/quote`, or use `/quote-and-swap`.                                             |
| `SWAP_QUOTE_MISMATCH` (40462)    | Keep the `/swap` amount, token pair, fee direction, and other quote-bound parameters unchanged.                         |
| ERC-20 swap reverts              | Call `approve-transaction`, sign and broadcast its returned calldata, then confirm approval before submitting the swap. |
| Wallet API returns empty `data`  | The transaction may not be indexed yet; retry with backoff using the same chain ID and `txHash`.                        |
| Tron `invalid signedTransaction` | Send the signed `{raw_data, signature}` JSON, not calldata hex.                                                         |
| Solana transaction rejected      | Re-check `computeUnitLimit` and `computeUnitPrice`; use `/swap-instruction` to inspect instructions.                    |

## Related Endpoints

| API             | Endpoint                                                        | Purpose                                                |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| Trading API     | `GET /api/v1/dex/aggregator/quote`                              | Select a route and receive `quoteId`                   |
| Trading API     | `GET /api/v1/dex/aggregator/quote-and-swap`                     | Quote + build a transaction in one call                |
| Trading API     | `GET /api/v1/dex/aggregator/swap`                               | Build the unsigned swap transaction                    |
| Trading API     | `GET /api/v1/dex/aggregator/approve-transaction`                | Request ERC-20 approval transaction data               |
| Transaction API | `POST /api/v1/dex/pre-transaction/broadcast-transaction`        | Broadcast an approval or swap transaction              |
| Wallet API      | `GET /api/v1/dex/post-transaction/transaction-detail-by-txhash` | Query block, transfer, and pending/success/fail status |
| Trading API     | `POST /api/v1/dex/aggregator/order/submit`                      | Submit a signed RFQ order                              |
| Trading API     | `GET /api/v1/dex/aggregator/order/{orderId}`                    | Poll RFQ settlement status                             |
