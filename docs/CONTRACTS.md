# StacksClub Contracts

One contract, `StacksClubVault`, in a Foundry project at `contracts/`. Solidity `^0.8.24`, OpenZeppelin v5. Target BSC mainnet (chain 56).

## 1. Responsibilities

1. Asset allowlist (stock tokens) and a single settlement token (USDT)
2. Immutable Stack recipes
3. Buy fee collection with the creator/platform split, and creator claims
4. Positions as non-transferable ERC-721 tokens with exact per-component raw balances
5. Partial and full release of position units (used by both Sell and Redeem)
6. Sell fee collection
7. Pause for new activity that never blocks withdrawals or claims

## 2. Roles

Use `AccessControl`.

- `DEFAULT_ADMIN_ROLE`: grants roles, sets the platform fee recipient.
- `ASSET_ADMIN_ROLE`: adds assets and disables them for new use.
- `PAUSER_ROLE`: pauses and unpauses.

No role can move tokens that belong to positions or to creators' claimable balances. The only admin withdrawal is `withdrawPlatformFees`, which is capped at the accrued platform fee balance.

## 3. Storage

```solidity
struct Asset {
    bool allowed;        // usable in new Stacks and new deposits
    bool exists;         // ever added; withdrawals always work for existing assets
    uint8 decimals;
    bytes32 provider;    // keccak256("bstock") or keccak256("ondo")
}

struct Stack {
    address creator;
    uint64 createdAt;
    string metadataURI;  // Supabase Storage URL or ipfs:// for image + description JSON
    bytes32 tickerHash;  // keccak256 of uppercase ticker
    address[] assets;    // 2..5, unique, all allowed at creation
    uint16[] weightsBps; // same length, each > 0, sum == 10_000
}

struct FeeReceipt {
    address payer;
    uint256 stackId;     // 0 for a single stock buy
    uint256 grossAmount; // USDT raw units the fee was computed on
    bool used;
}

struct Position {
    uint256 stackId;
    uint64 openedAt;
    uint256 feeReceiptId;
    // balances in raw units, same order as the Stack's assets
}

IERC20 public immutable settlementToken;   // USDT
address public platformFeeRecipient;

uint16 public constant FEE_BPS = 100;          // 1%
uint16 public constant CREATOR_SHARE_BPS = 2_500; // 25% of the fee

mapping(address => Asset) public assets;
mapping(uint256 => Stack) internal stacks;
mapping(bytes32 => bool) public tickerTaken;
uint256 public stackCount;

mapping(uint256 => FeeReceipt) public feeReceipts;
uint256 public feeReceiptCount;

mapping(uint256 => Position) public positions;
mapping(uint256 => mapping(address => uint256)) public positionBalance; // positionId => asset => raw units
uint256 public positionCount;

mapping(address => uint256) public creatorClaimable; // USDT raw
uint256 public platformAccrued;                       // USDT raw
mapping(address => uint256) public totalHeld;         // asset => sum of all position balances
```

## 4. Functions

### Assets

- `addAsset(address token, bytes32 provider)` (ASSET_ADMIN): requires code at the address, reads `decimals()` and stores it, sets `allowed` and `exists`. Emits `AssetAdded`.
- `setAssetAllowed(address token, bool allowed)` (ASSET_ADMIN): only affects new Stacks and new deposits.

### Stacks

- `createStack(address[] assets, uint16[] weightsBps, string metadataURI, string ticker) returns (uint256 stackId)`
  - `whenNotPaused`
  - 2 to 5 components, lengths match, no duplicates, every asset `allowed`, every weight > 0, sum exactly 10,000
  - ticker 2 to 6 chars, A to Z only, not taken
  - stores the recipe with `msg.sender` as creator. Stack IDs start at 1.
  - emits `StackCreated(stackId, creator, assets, weightsBps, metadataURI, ticker)`
- `getStack(uint256 stackId)` view returns the full recipe.

### Buy fee

- `payBuyFee(uint256 stackId, uint256 grossAmount) returns (uint256 receiptId)`
  - `whenNotPaused`, `nonReentrant`
  - `stackId == 0` means a single stock buy. Otherwise the Stack must exist.
  - `fee = grossAmount * FEE_BPS / 10_000`, require `fee > 0`
  - pulls `fee` USDT from `msg.sender` with SafeERC20
  - Stack buy: `creatorCut = fee * CREATOR_SHARE_BPS / 10_000`, credited to `creatorClaimable[creator]`, the rest to `platformAccrued`. Single stock buy: all to `platformAccrued`.
  - stores a `FeeReceipt` and emits `BuyFeePaid(receiptId, payer, stackId, grossAmount, fee, creatorCut)`
  - Receipt IDs start at 1.

### Positions

- `openPosition(uint256 stackId, uint256 feeReceiptId, uint256[] amounts) returns (uint256 positionId)`
  - `whenNotPaused`, `nonReentrant`
  - receipt must exist, be unused, have `payer == msg.sender` and `stackId` equal to this Stack. Mark it used.
  - `amounts.length` equals the Stack's component count and every amount > 0
  - every component asset must still be `allowed`
  - for each component, pull `amounts[i]` with `safeTransferFrom` and require that the vault's balance increased by exactly `amounts[i]` (rejects fee-on-transfer or rebasing behaviour)
  - record balances, update `totalHeld`, mint the ERC-721 to `msg.sender`
  - emits `PositionOpened(positionId, owner, stackId, feeReceiptId, amounts)`
- `release(uint256 positionId, uint16 bps, uint8 purpose)`
  - `nonReentrant`, NOT gated by pause
  - caller must be `ownerOf(positionId)`, `bps` in 1..10,000, `purpose` 0 = redeem, 1 = sell (only for events and indexing)
  - for each component: if `bps == 10_000` release the whole remaining balance, else `amount = balance * bps / 10_000` rounded down. Skip zero amounts. Transfer to the owner, reduce `positionBalance` and `totalHeld`.
  - burn the NFT when every component balance is zero
  - emits `PositionReleased(positionId, owner, bps, purpose, amounts)`
- `getPosition(uint256 positionId)` view returns stackId, openedAt, owner, assets and balances.
- `positionsOf(address owner)` view. Keep an owner enumeration (use `ERC721Enumerable` or a simple owner array with swap-and-pop on burn).

### Sell fee

- `paySellFee(uint256 positionId, uint256 proceeds)`: `nonReentrant`, pulls `proceeds * FEE_BPS / 10_000` USDT to `platformAccrued`, emits `SellFeePaid(payer, positionId, proceeds, fee)`. `positionId` 0 means a single stock sell. This is app-enforced, not contract-enforced, and the docs and README must say so.

### Claims and platform fees

- `claimCreatorFees()`: `nonReentrant`, not pause gated, sends the caller's whole `creatorClaimable`, zeroes it first. Emits `CreatorClaimed`.
- `withdrawPlatformFees(uint256 amount)` (DEFAULT_ADMIN): requires `amount <= platformAccrued`, sends to `platformFeeRecipient`. Emits `PlatformWithdrawn`.

### Non-transferable NFT

Override `_update` so that any transfer where both `from` and `to` are non-zero reverts with `Soulbound()`. Mint and burn still work. `tokenURI` returns `{baseURI}/api/positions/{id}/metadata`.

### Pause

`pause` and `unpause` (PAUSER). Paused blocks `createStack`, `payBuyFee`, `openPosition`. It never blocks `release`, `claimCreatorFees` or `paySellFee`.

## 5. Invariants

1. For every asset, `IERC20(asset).balanceOf(vault) >= totalHeld[asset]`.
2. `settlementToken.balanceOf(vault) >= platformAccrued + sum(creatorClaimable)`.
3. A position's balances only decrease, and only through `release` by its owner.
4. A fee receipt opens at most one position.
5. Recipes never change after creation.

## 6. Tests (`contracts/test`)

Unit tests with mock ERC-20s (6, 8 and 18 decimals) covering:

- Stack creation validation: component count, duplicates, weight sum, zero weight, disallowed asset, ticker format and uniqueness
- Fee math for single and Stack buys, including rounding on small amounts and the creator/platform split
- Receipt misuse: wrong payer, wrong Stack, reused receipt
- Open position with exact amounts, reject fee-on-transfer token, reject disallowed asset
- Release: 25%, 33.33%, 100%, repeated partials down to dust, burn on zero, non-owner revert
- Soulbound: transfer and safeTransfer revert
- Pause: blocks new activity, allows release and claims
- Claims and platform withdrawal caps
- Invariant tests (Foundry `invariant_` with a handler) for invariants 1 to 4

### Fork test (`VaultFork.t.sol`)

Runs against BSC mainnet with `vm.createSelectFork(vm.envString("BSC_RPC_URL"))`. Skips cleanly if the env var is missing.

- Read real bStocks and Ondo token addresses from `contracts/test/fork-assets.json`, which the seed script (`BACKEND.md` 6) writes from the Binance RWA API. Use at least one of each provider.
- For each token: try `deal(token, user, amount)`. If the balance does not change (non-standard storage), find a current holder via a `FORK_HOLDER_<SYMBOL>` env var and `vm.prank` a transfer from them instead.
- Add the assets, create a Stack, pay a fee with forked USDT, open a position, release 50%, release 100%.
- If any transfer into or out of the vault reverts, fail with a clear message naming the token and the revert data. This is the check that tells us whether provider tokens can sit in the vault. Report it; do not work around it.

## 7. Deploy

`script/Deploy.s.sol`:

- reads `DEPLOYER_PRIVATE_KEY`, `PLATFORM_FEE_RECIPIENT` and `USDT_ADDRESS` from the environment, never from files
- deploys the vault, grants roles to the deployer
- reads `contracts/deploy/assets.json` and calls `addAsset` for each
- writes the deployed address and ABI to `src/lib/contracts/vault.ts` via a small post-deploy Node script (`scripts/export-abi.ts`)

Command documented in the README:

```
forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --broadcast --verify
```

The user runs this themselves. Claude Code never runs a broadcast.
