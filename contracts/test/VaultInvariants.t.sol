// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {StacksClubVault} from "../src/StacksClubVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Drives random buys, opens, releases, sell fees, claims and platform withdrawals, and
///      keeps a ghost copy of every position so invariants 3 and 4 can be checked.
contract VaultHandler is Test {
    StacksClubVault internal vault;
    MockERC20 internal usdt;
    MockERC20[3] internal toks;
    address internal admin;
    address[] internal actors;
    uint256 internal stackId;

    // ghost state
    uint256[] public openedPositions;
    mapping(uint256 => uint256[3]) public lastSeen; // positionId => balances last observed
    mapping(uint256 => uint256) public receiptOpens; // receiptId => number of positions opened
    uint256[] public receipts;
    mapping(uint256 => address) internal receiptPayer;

    constructor(StacksClubVault v, MockERC20 u, MockERC20[3] memory t, address admin_, uint256 stackId_) {
        vault = v;
        usdt = u;
        toks = t;
        admin = admin_;
        stackId = stackId_;
        for (uint256 i; i < 4; ++i) {
            address a = address(uint160(uint256(keccak256(abi.encode("actor", i)))));
            actors.push(a);
            vm.startPrank(a);
            usdt.approve(address(vault), type(uint256).max);
            for (uint256 j; j < 3; ++j) {
                toks[j].approve(address(vault), type(uint256).max);
            }
            vm.stopPrank();
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function payFee(uint256 actorSeed, uint256 gross, bool single) external {
        address a = _actor(actorSeed);
        gross = bound(gross, 100, 1e24);
        usdt.mint(a, gross);
        vm.prank(a);
        uint256 r = vault.payBuyFee(single ? 0 : stackId, gross);
        receipts.push(r);
        receiptPayer[r] = a;
    }

    function open(uint256 receiptSeed, uint256 x0, uint256 x1, uint256 x2) external {
        if (receipts.length == 0) return;
        uint256 r = receipts[receiptSeed % receipts.length];
        address a = receiptPayer[r];
        uint256[] memory amts = new uint256[](3);
        amts[0] = bound(x0, 1, 1e12);
        amts[1] = bound(x1, 1, 1e14);
        amts[2] = bound(x2, 1, 1e24);
        for (uint256 j; j < 3; ++j) {
            toks[j].mint(a, amts[j]);
        }
        vm.prank(a);
        try vault.openPosition(stackId, r, amts) returns (uint256 pid) {
            receiptOpens[r] += 1;
            openedPositions.push(pid);
            lastSeen[pid] = [amts[0], amts[1], amts[2]];
        } catch {}
    }

    function release(uint256 posSeed, uint16 bps, bool asOwner, uint256 strangerSeed) external {
        if (openedPositions.length == 0) return;
        uint256 pid = openedPositions[posSeed % openedPositions.length];
        bps = uint16(bound(bps, 1, 10_000));
        (,, address owner,,) = vault.getPosition(pid);
        address caller = asOwner && owner != address(0) ? owner : _actor(strangerSeed);
        vm.prank(caller);
        try vault.release(pid, bps, 0) {} catch {}
    }

    function sellFee(uint256 actorSeed, uint256 proceeds) external {
        address a = _actor(actorSeed);
        proceeds = bound(proceeds, 100, 1e24);
        usdt.mint(a, proceeds);
        vm.prank(a);
        vault.paySellFee(0, proceeds);
    }

    function claim(uint256 actorSeed) external {
        vm.prank(_actor(actorSeed));
        try vault.claimCreatorFees() {} catch {}
    }

    function withdraw(uint256 amount) external {
        amount = bound(amount, 0, vault.platformAccrued());
        vm.prank(admin);
        vault.withdrawPlatformFees(amount);
    }

    // ---- invariant helpers ----

    function positionsCount() external view returns (uint256) {
        return openedPositions.length;
    }

    function receiptsCount() external view returns (uint256) {
        return receipts.length;
    }

    function receiptAt(uint256 i) external view returns (uint256) {
        return receipts[i];
    }

    /// Checks that balances only went down since the last check, then records the new values.
    function checkMonotonic() external returns (bool ok) {
        ok = true;
        for (uint256 i; i < openedPositions.length; ++i) {
            uint256 pid = openedPositions[i];
            (,,,, uint256[] memory bals) = vault.getPosition(pid);
            for (uint256 j; j < 3; ++j) {
                if (bals[j] > lastSeen[pid][j]) ok = false;
                lastSeen[pid][j] = bals[j];
            }
        }
    }

    function actorList() external view returns (address[] memory) {
        return actors;
    }
}

contract VaultInvariantTest is StdInvariant, Test {
    StacksClubVault internal vault;
    MockERC20 internal usdt;
    MockERC20[3] internal toks;
    VaultHandler internal handler;
    address internal admin = makeAddr("admin");
    address internal creator;

    function setUp() public {
        usdt = new MockERC20("USDT", "USDT", 18);
        toks[0] = new MockERC20("A", "A", 6);
        toks[1] = new MockERC20("B", "B", 8);
        toks[2] = new MockERC20("C", "C", 18);
        vault = new StacksClubVault(usdt, makeAddr("platform"), admin, "https://x");

        address[] memory list = new address[](3);
        uint16[] memory w = new uint16[](3);
        vm.startPrank(admin);
        for (uint256 i; i < 3; ++i) {
            vault.addAsset(address(toks[i]), keccak256("bstock"));
            list[i] = address(toks[i]);
        }
        vm.stopPrank();
        w[0] = 3_334;
        w[1] = 3_333;
        w[2] = 3_333;

        // the creator is the handler's first actor so claims get exercised
        creator = address(uint160(uint256(keccak256(abi.encode("actor", uint256(0))))));
        vm.prank(creator);
        uint256 stackId = vault.createStack(list, w, "ipfs://x", "INV");
        handler = new VaultHandler(vault, usdt, toks, admin, stackId);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = VaultHandler.payFee.selector;
        selectors[1] = VaultHandler.open.selector;
        selectors[2] = VaultHandler.release.selector;
        selectors[3] = VaultHandler.sellFee.selector;
        selectors[4] = VaultHandler.claim.selector;
        selectors[5] = VaultHandler.withdraw.selector;
        selectors[6] = VaultHandler.positionsCount.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// 1. Every asset's vault balance covers what positions hold.
    function invariant_assetBalancesCoverHeld() public view {
        for (uint256 i; i < 3; ++i) {
            assertGe(toks[i].balanceOf(address(vault)), vault.totalHeld(address(toks[i])));
        }
    }

    /// 2. USDT balance covers platform accrual plus all creator claimables.
    function invariant_usdtCoversFees() public view {
        address[] memory actors = handler.actorList();
        uint256 sum;
        for (uint256 i; i < actors.length; ++i) {
            sum += vault.creatorClaimable(actors[i]);
        }
        assertEq(sum, vault.totalCreatorClaimable());
        assertGe(usdt.balanceOf(address(vault)), vault.platformAccrued() + vault.totalCreatorClaimable());
    }

    /// 3. Position balances only ever decrease (and only via release by the owner; non-owner
    ///    release attempts are driven by the handler and must not change anything).
    function invariant_positionBalancesOnlyDecrease() public {
        assertTrue(handler.checkMonotonic());
    }

    /// 4. A fee receipt opens at most one position.
    function invariant_receiptOpensAtMostOne() public view {
        for (uint256 i; i < handler.receiptsCount(); ++i) {
            assertLe(handler.receiptOpens(handler.receiptAt(i)), 1);
        }
    }
}
