// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StacksClubVault
/// @notice Immutable stock-token basket recipes ("Stacks"), buy/sell fee collection with a
///         creator/platform split, and non-transferable ERC-721 positions that escrow the exact
///         raw token units a user deposited. See docs/CONTRACTS.md.
/// @dev No role can move position-held tokens or creators' claimable balances. The only admin
///      withdrawal is `withdrawPlatformFees`, capped at `platformAccrued`.
contract StacksClubVault is ERC721Enumerable, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Asset {
        bool allowed; // usable in new Stacks and new deposits
        bool exists; // ever added; withdrawals always work for existing assets
        uint8 decimals;
        bytes32 provider; // keccak256("bstock") or keccak256("ondo")
    }

    struct Stack {
        address creator;
        uint64 createdAt;
        string metadataURI;
        bytes32 tickerHash;
        address[] assets;
        uint16[] weightsBps;
    }

    struct FeeReceipt {
        address payer;
        uint256 stackId; // 0 for a single stock buy
        uint256 grossAmount; // settlement-token raw units the fee was computed on
        bool used;
    }

    struct Position {
        uint256 stackId;
        uint64 openedAt;
        uint256 feeReceiptId;
    }

    // ---------------------------------------------------------------------
    // Constants and roles
    // ---------------------------------------------------------------------

    bytes32 public constant ASSET_ADMIN_ROLE = keccak256("ASSET_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint16 public constant FEE_BPS = 100; // 1%
    uint16 public constant CREATOR_SHARE_BPS = 2_500; // 25% of the fee
    uint16 internal constant BPS = 10_000;
    uint256 internal constant MIN_COMPONENTS = 2;
    uint256 internal constant MAX_COMPONENTS = 5;

    uint8 public constant PURPOSE_REDEEM = 0;
    uint8 public constant PURPOSE_SELL = 1;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    IERC20 public immutable settlementToken;
    address public platformFeeRecipient;
    string internal baseURI_;

    mapping(address => Asset) public assets;
    mapping(uint256 => Stack) internal stacks;
    mapping(bytes32 => bool) public tickerTaken;
    uint256 public stackCount;

    mapping(uint256 => FeeReceipt) public feeReceipts;
    uint256 public feeReceiptCount;

    mapping(uint256 => Position) public positions;
    mapping(uint256 => mapping(address => uint256)) public positionBalance;
    uint256 public positionCount;

    mapping(address => uint256) public creatorClaimable;
    uint256 public platformAccrued;
    /// @notice Sum of all creators' claimable balances. Tracked so invariant 2 is checkable.
    uint256 public totalCreatorClaimable;
    mapping(address => uint256) public totalHeld;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AssetAdded(address indexed token, bytes32 indexed provider, uint8 decimals);
    event AssetAllowedSet(address indexed token, bool allowed);
    event StackCreated(
        uint256 indexed stackId,
        address indexed creator,
        address[] assets,
        uint16[] weightsBps,
        string metadataURI,
        string ticker
    );
    event BuyFeePaid(
        uint256 indexed receiptId,
        address indexed payer,
        uint256 indexed stackId,
        uint256 grossAmount,
        uint256 fee,
        uint256 creatorCut
    );
    event PositionOpened(
        uint256 indexed positionId, address indexed owner, uint256 indexed stackId, uint256 feeReceiptId, uint256[] amounts
    );
    event PositionReleased(
        uint256 indexed positionId, address indexed owner, uint16 bps, uint8 purpose, uint256[] amounts
    );
    event SellFeePaid(address indexed payer, uint256 indexed positionId, uint256 proceeds, uint256 fee);
    event CreatorClaimed(address indexed creator, uint256 amount);
    event PlatformWithdrawn(address indexed recipient, uint256 amount);
    event PlatformFeeRecipientSet(address indexed recipient);
    event BaseURISet(string baseURI);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error NotAContract(address token);
    error AssetAlreadyExists(address token);
    error UnknownAsset(address token);
    error AssetNotAllowed(address token);
    error InvalidProvider();
    error InvalidComponentCount();
    error LengthMismatch();
    error DuplicateAsset(address token);
    error ZeroWeight();
    error WeightsMustSumTo10000();
    error InvalidTicker();
    error TickerTaken();
    error UnknownStack(uint256 stackId);
    error ZeroFee();
    error UnknownReceipt(uint256 receiptId);
    error ReceiptAlreadyUsed(uint256 receiptId);
    error ReceiptPayerMismatch();
    error ReceiptStackMismatch();
    error ZeroAmount();
    error TransferAmountMismatch(address token, uint256 expected, uint256 received);
    error NotPositionOwner();
    error InvalidBps();
    error InvalidPurpose();
    error NothingToClaim();
    error ExceedsAccrued();
    error Soulbound();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(IERC20 settlementToken_, address platformFeeRecipient_, address admin, string memory baseURI)
        ERC721("StacksClub Position", "SCPOS")
    {
        if (address(settlementToken_) == address(0) || platformFeeRecipient_ == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        settlementToken = settlementToken_;
        platformFeeRecipient = platformFeeRecipient_;
        baseURI_ = baseURI;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ASSET_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Assets
    // ---------------------------------------------------------------------

    function addAsset(address token, bytes32 provider) external onlyRole(ASSET_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (token.code.length == 0) revert NotAContract(token);
        if (token == address(settlementToken)) revert AssetNotAllowed(token);
        if (provider == bytes32(0)) revert InvalidProvider();
        if (assets[token].exists) revert AssetAlreadyExists(token);
        uint8 decimals = IERC20Metadata(token).decimals();
        assets[token] = Asset({allowed: true, exists: true, decimals: decimals, provider: provider});
        emit AssetAdded(token, provider, decimals);
    }

    /// @notice Only affects new Stacks and new deposits. Existing positions can always be released.
    function setAssetAllowed(address token, bool allowed) external onlyRole(ASSET_ADMIN_ROLE) {
        if (!assets[token].exists) revert UnknownAsset(token);
        assets[token].allowed = allowed;
        emit AssetAllowedSet(token, allowed);
    }

    // ---------------------------------------------------------------------
    // Stacks
    // ---------------------------------------------------------------------

    function createStack(
        address[] calldata assetList,
        uint16[] calldata weightsBps,
        string calldata metadataURI,
        string calldata ticker
    ) external whenNotPaused returns (uint256 stackId) {
        uint256 n = assetList.length;
        if (n < MIN_COMPONENTS || n > MAX_COMPONENTS) revert InvalidComponentCount();
        if (weightsBps.length != n) revert LengthMismatch();

        uint256 sum;
        for (uint256 i; i < n; ++i) {
            address a = assetList[i];
            if (!assets[a].allowed) revert AssetNotAllowed(a);
            for (uint256 j; j < i; ++j) {
                if (assetList[j] == a) revert DuplicateAsset(a);
            }
            if (weightsBps[i] == 0) revert ZeroWeight();
            sum += weightsBps[i];
        }
        if (sum != BPS) revert WeightsMustSumTo10000();

        bytes32 tickerHash = _validateTicker(ticker);
        if (tickerTaken[tickerHash]) revert TickerTaken();
        tickerTaken[tickerHash] = true;

        stackId = ++stackCount;
        Stack storage s = stacks[stackId];
        s.creator = msg.sender;
        s.createdAt = uint64(block.timestamp);
        s.metadataURI = metadataURI;
        s.tickerHash = tickerHash;
        s.assets = assetList;
        s.weightsBps = weightsBps;

        emit StackCreated(stackId, msg.sender, assetList, weightsBps, metadataURI, ticker);
    }

    function getStack(uint256 stackId)
        external
        view
        returns (
            address creator,
            uint64 createdAt,
            string memory metadataURI,
            bytes32 tickerHash,
            address[] memory assetList,
            uint16[] memory weightsBps
        )
    {
        Stack storage s = _stack(stackId);
        return (s.creator, s.createdAt, s.metadataURI, s.tickerHash, s.assets, s.weightsBps);
    }

    // ---------------------------------------------------------------------
    // Buy fee
    // ---------------------------------------------------------------------

    function payBuyFee(uint256 stackId, uint256 grossAmount)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 receiptId)
    {
        address creator;
        if (stackId != 0) creator = _stack(stackId).creator;

        uint256 fee = (grossAmount * FEE_BPS) / BPS;
        if (fee == 0) revert ZeroFee();

        _pullExact(settlementToken, msg.sender, fee);

        uint256 creatorCut;
        if (stackId != 0) {
            creatorCut = (fee * CREATOR_SHARE_BPS) / BPS;
            creatorClaimable[creator] += creatorCut;
            totalCreatorClaimable += creatorCut;
        }
        platformAccrued += fee - creatorCut;

        receiptId = ++feeReceiptCount;
        feeReceipts[receiptId] = FeeReceipt({payer: msg.sender, stackId: stackId, grossAmount: grossAmount, used: false});
        emit BuyFeePaid(receiptId, msg.sender, stackId, grossAmount, fee, creatorCut);
    }

    // ---------------------------------------------------------------------
    // Positions
    // ---------------------------------------------------------------------

    function openPosition(uint256 stackId, uint256 feeReceiptId, uint256[] calldata amounts)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 positionId)
    {
        Stack storage s = _stack(stackId);

        FeeReceipt storage r = feeReceipts[feeReceiptId];
        if (r.payer == address(0)) revert UnknownReceipt(feeReceiptId);
        if (r.used) revert ReceiptAlreadyUsed(feeReceiptId);
        if (r.payer != msg.sender) revert ReceiptPayerMismatch();
        if (r.stackId != stackId) revert ReceiptStackMismatch();
        r.used = true;

        uint256 n = s.assets.length;
        if (amounts.length != n) revert LengthMismatch();

        positionId = ++positionCount;
        positions[positionId] = Position({stackId: stackId, openedAt: uint64(block.timestamp), feeReceiptId: feeReceiptId});

        for (uint256 i; i < n; ++i) {
            address a = s.assets[i];
            uint256 amount = amounts[i];
            if (amount == 0) revert ZeroAmount();
            if (!assets[a].allowed) revert AssetNotAllowed(a);
            _pullExact(IERC20(a), msg.sender, amount);
            positionBalance[positionId][a] = amount;
            totalHeld[a] += amount;
        }

        _safeMint(msg.sender, positionId);
        emit PositionOpened(positionId, msg.sender, stackId, feeReceiptId, amounts);
    }

    /// @notice Release `bps` of every component back to the owner. Used by both Sell (purpose 1)
    ///         and Redeem (purpose 0). Never gated by pause.
    function release(uint256 positionId, uint16 bps, uint8 purpose) external nonReentrant {
        address owner = _ownerOf(positionId);
        if (owner == address(0) || owner != msg.sender) revert NotPositionOwner();
        if (bps == 0 || bps > BPS) revert InvalidBps();
        if (purpose > PURPOSE_SELL) revert InvalidPurpose();

        address[] storage list = stacks[positions[positionId].stackId].assets;
        uint256 n = list.length;
        uint256[] memory amounts = new uint256[](n);
        bool empty = true;

        for (uint256 i; i < n; ++i) {
            address a = list[i];
            uint256 bal = positionBalance[positionId][a];
            uint256 amount = bps == BPS ? bal : (bal * bps) / BPS;
            if (amount != 0) {
                bal -= amount;
                positionBalance[positionId][a] = bal;
                totalHeld[a] -= amount;
                amounts[i] = amount;
            }
            if (bal != 0) empty = false;
        }

        // Effects done; burn before external transfers.
        if (empty) _burn(positionId);

        for (uint256 i; i < n; ++i) {
            if (amounts[i] != 0) IERC20(list[i]).safeTransfer(owner, amounts[i]);
        }

        emit PositionReleased(positionId, owner, bps, purpose, amounts);
    }

    function getPosition(uint256 positionId)
        external
        view
        returns (
            uint256 stackId,
            uint64 openedAt,
            address owner,
            address[] memory assetList,
            uint256[] memory balances
        )
    {
        Position storage p = positions[positionId];
        stackId = p.stackId;
        openedAt = p.openedAt;
        owner = _ownerOf(positionId);
        assetList = stacks[stackId].assets;
        balances = new uint256[](assetList.length);
        for (uint256 i; i < assetList.length; ++i) {
            balances[i] = positionBalance[positionId][assetList[i]];
        }
    }

    function positionsOf(address owner) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(owner);
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = tokenOfOwnerByIndex(owner, i);
        }
    }

    // ---------------------------------------------------------------------
    // Sell fee (app-enforced: the contract cannot see offchain sale proceeds)
    // ---------------------------------------------------------------------

    function paySellFee(uint256 positionId, uint256 proceeds) external nonReentrant {
        uint256 fee = (proceeds * FEE_BPS) / BPS;
        if (fee == 0) revert ZeroFee();
        _pullExact(settlementToken, msg.sender, fee);
        platformAccrued += fee;
        emit SellFeePaid(msg.sender, positionId, proceeds, fee);
    }

    // ---------------------------------------------------------------------
    // Claims and platform fees
    // ---------------------------------------------------------------------

    function claimCreatorFees() external nonReentrant {
        uint256 amount = creatorClaimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        creatorClaimable[msg.sender] = 0;
        totalCreatorClaimable -= amount;
        settlementToken.safeTransfer(msg.sender, amount);
        emit CreatorClaimed(msg.sender, amount);
    }

    function withdrawPlatformFees(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (amount > platformAccrued) revert ExceedsAccrued();
        platformAccrued -= amount;
        settlementToken.safeTransfer(platformFeeRecipient, amount);
        emit PlatformWithdrawn(platformFeeRecipient, amount);
    }

    function setPlatformFeeRecipient(address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (recipient == address(0)) revert ZeroAddress();
        platformFeeRecipient = recipient;
        emit PlatformFeeRecipientSet(recipient);
    }

    // ---------------------------------------------------------------------
    // Pause
    // ---------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Metadata
    // ---------------------------------------------------------------------

    function setBaseURI(string calldata baseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseURI_ = baseURI;
        emit BaseURISet(baseURI);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(baseURI_, "/api/positions/", Strings.toString(tokenId), "/metadata");
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _stack(uint256 stackId) internal view returns (Stack storage s) {
        s = stacks[stackId];
        if (s.creator == address(0)) revert UnknownStack(stackId);
    }

    /// @dev Pulls `amount` and requires the vault balance to rise by exactly that much, which
    ///      rejects fee-on-transfer and similar non-standard tokens.
    function _pullExact(IERC20 token, address from, uint256 amount) internal {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != amount) revert TransferAmountMismatch(address(token), amount, received);
    }

    /// @dev 2 to 6 characters, A to Z only.
    function _validateTicker(string calldata ticker) internal pure returns (bytes32) {
        bytes calldata b = bytes(ticker);
        if (b.length < 2 || b.length > 6) revert InvalidTicker();
        for (uint256 i; i < b.length; ++i) {
            if (b[i] < 0x41 || b[i] > 0x5A) revert InvalidTicker();
        }
        return keccak256(b);
    }

    /// @dev Positions are non-transferable: mint and burn only.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
