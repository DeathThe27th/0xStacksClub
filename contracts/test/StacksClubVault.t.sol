// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {StacksClubVault} from "../src/StacksClubVault.sol";
import {MockERC20, FeeOnTransferERC20} from "./mocks/MockERC20.sol";
import {VaultBase} from "./Base.t.sol";

contract StacksClubVaultTest is VaultBase {
    // ------------------------------------------------------------------
    // Assets
    // ------------------------------------------------------------------

    function test_addAsset_storesDecimalsAndProvider() public view {
        (bool allowed, bool exists, uint8 dec, bytes32 provider) = vault.assets(address(a8));
        assertTrue(allowed);
        assertTrue(exists);
        assertEq(dec, 8);
        assertEq(provider, ONDO);
    }

    function test_addAsset_rejectsEOA() public {
        address eoa = makeAddr("eoa");
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.NotAContract.selector, eoa));
        vault.addAsset(eoa, BSTOCK);
    }

    function test_addAsset_rejectsDuplicateAndSettlementToken() public {
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.AssetAlreadyExists.selector, address(a6)));
        vault.addAsset(address(a6), BSTOCK);
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.AssetNotAllowed.selector, address(usdt)));
        vault.addAsset(address(usdt), BSTOCK);
        vm.stopPrank();
    }

    function test_addAsset_onlyAssetAdmin() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        bytes32 role = vault.ASSET_ADMIN_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        vault.addAsset(address(t), BSTOCK);
    }

    // ------------------------------------------------------------------
    // Stack creation validation
    // ------------------------------------------------------------------

    function test_createStack_happyPath() public {
        uint256 id = _createStack("AIK");
        assertEq(id, 1);
        (address c,, string memory uri, bytes32 th, address[] memory list, uint16[] memory w) = vault.getStack(id);
        assertEq(c, creator);
        assertEq(uri, "ipfs://meta");
        assertEq(th, keccak256("AIK"));
        assertEq(list.length, 3);
        assertEq(w[0], 5_000);
        assertTrue(vault.tickerTaken(keccak256("AIK")));
    }

    function test_createStack_componentCount() public {
        address[] memory one = new address[](1);
        one[0] = address(a6);
        uint16[] memory w1 = new uint16[](1);
        w1[0] = 10_000;
        vm.expectRevert(StacksClubVault.InvalidComponentCount.selector);
        vault.createStack(one, w1, "", "ONE");

        address[] memory six = new address[](6);
        uint16[] memory w6 = new uint16[](6);
        vm.expectRevert(StacksClubVault.InvalidComponentCount.selector);
        vault.createStack(six, w6, "", "SIX");
    }

    function test_createStack_lengthMismatch() public {
        (address[] memory list,) = _threeAssets();
        uint16[] memory w = new uint16[](2);
        w[0] = 5_000;
        w[1] = 5_000;
        vm.expectRevert(StacksClubVault.LengthMismatch.selector);
        vault.createStack(list, w, "", "LEN");
    }

    function test_createStack_duplicates() public {
        address[] memory list = new address[](2);
        list[0] = address(a6);
        list[1] = address(a6);
        uint16[] memory w = new uint16[](2);
        w[0] = 5_000;
        w[1] = 5_000;
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.DuplicateAsset.selector, address(a6)));
        vault.createStack(list, w, "", "DUP");
    }

    function test_createStack_weightSum() public {
        (address[] memory list, uint16[] memory w) = _threeAssets();
        w[2] = 2_499;
        vm.expectRevert(StacksClubVault.WeightsMustSumTo10000.selector);
        vault.createStack(list, w, "", "SUM");
    }

    function test_createStack_zeroWeight() public {
        (address[] memory list, uint16[] memory w) = _threeAssets();
        w[0] = 7_500;
        w[2] = 0;
        vm.expectRevert(StacksClubVault.ZeroWeight.selector);
        vault.createStack(list, w, "", "ZERO");
    }

    function test_createStack_disallowedAsset() public {
        vm.prank(admin);
        vault.setAssetAllowed(address(a8), false);
        (address[] memory list, uint16[] memory w) = _threeAssets();
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.AssetNotAllowed.selector, address(a8)));
        vault.createStack(list, w, "", "DIS");

        MockERC20 unknown = new MockERC20("U", "U", 18);
        list[1] = address(unknown);
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.AssetNotAllowed.selector, address(unknown)));
        vault.createStack(list, w, "", "UNK");
    }

    function test_createStack_tickerFormat() public {
        (address[] memory list, uint16[] memory w) = _threeAssets();
        string[5] memory bad = ["A", "ABCDEFG", "aik", "AI1", "A K"];
        for (uint256 i; i < bad.length; ++i) {
            vm.expectRevert(StacksClubVault.InvalidTicker.selector);
            vault.createStack(list, w, "", bad[i]);
        }
        vault.createStack(list, w, "", "AB");
        vault.createStack(list, w, "", "ABCDEF");
    }

    function test_createStack_tickerUnique() public {
        _createStack("AIK");
        (address[] memory list, uint16[] memory w) = _threeAssets();
        vm.expectRevert(StacksClubVault.TickerTaken.selector);
        vm.prank(alice);
        vault.createStack(list, w, "", "AIK");
    }

    // ------------------------------------------------------------------
    // Fee math
    // ------------------------------------------------------------------

    function test_payBuyFee_singleStock_allToPlatform() public {
        vm.prank(alice);
        uint256 r = vault.payBuyFee(0, 5e18);
        assertEq(r, 1);
        assertEq(vault.platformAccrued(), 0.05e18);
        assertEq(usdt.balanceOf(address(vault)), 0.05e18);
        (address payer, uint256 sid, uint256 gross, bool used) = vault.feeReceipts(r);
        assertEq(payer, alice);
        assertEq(sid, 0);
        assertEq(gross, 5e18);
        assertFalse(used);
    }

    function test_payBuyFee_stack_splits25to75() public {
        uint256 id = _createStack("AIK");
        vm.prank(alice);
        vault.payBuyFee(id, 100e18); // fee 1 USDT
        assertEq(vault.creatorClaimable(creator), 0.25e18);
        assertEq(vault.platformAccrued(), 0.75e18);
        assertEq(vault.totalCreatorClaimable(), 0.25e18);
    }

    function test_payBuyFee_roundingSmallAmounts() public {
        uint256 id = _createStack("AIK");
        // gross 399 wei -> fee 3 wei -> creator 0 (3 * 2500 / 10000 = 0.75), platform 3
        vm.prank(alice);
        vault.payBuyFee(id, 399);
        assertEq(vault.creatorClaimable(creator), 0);
        assertEq(vault.platformAccrued(), 3);
        // gross 400 wei -> fee 4 -> creator 1, platform 3
        vm.prank(alice);
        vault.payBuyFee(id, 400);
        assertEq(vault.creatorClaimable(creator), 1);
        assertEq(vault.platformAccrued(), 6);
    }

    function test_payBuyFee_zeroFeeReverts() public {
        vm.prank(alice);
        vm.expectRevert(StacksClubVault.ZeroFee.selector);
        vault.payBuyFee(0, 99);
    }

    function test_payBuyFee_unknownStack() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.UnknownStack.selector, 7));
        vault.payBuyFee(7, 100e18);
    }

    function testFuzz_payBuyFee_splitSumsToFee(uint128 gross) public {
        uint256 id = _createStack("AIK");
        uint256 fee = uint256(gross) * 100 / 10_000;
        usdt.mint(alice, fee);
        vm.prank(alice);
        if (fee == 0) {
            vm.expectRevert(StacksClubVault.ZeroFee.selector);
            vault.payBuyFee(id, gross);
            return;
        }
        vault.payBuyFee(id, gross);
        assertEq(vault.creatorClaimable(creator) + vault.platformAccrued(), fee);
        assertEq(vault.creatorClaimable(creator), fee * 2_500 / 10_000);
    }

    // ------------------------------------------------------------------
    // Receipt misuse
    // ------------------------------------------------------------------

    function test_openPosition_wrongPayer() public {
        uint256 id = _createStack("AIK");
        vm.prank(alice);
        uint256 r = vault.payBuyFee(id, 100e18);
        vm.prank(bob);
        vm.expectRevert(StacksClubVault.ReceiptPayerMismatch.selector);
        vault.openPosition(id, r, _amounts(1e6, 1e8, 1e18));
    }

    function test_openPosition_wrongStack() public {
        uint256 id = _createStack("AIK");
        uint256 id2 = _createStack("BIK");
        vm.startPrank(alice);
        uint256 r = vault.payBuyFee(id, 100e18);
        vm.expectRevert(StacksClubVault.ReceiptStackMismatch.selector);
        vault.openPosition(id2, r, _amounts(1e6, 1e8, 1e18));
        vm.stopPrank();
    }

    function test_openPosition_singleStockReceiptCannotOpenStack() public {
        uint256 id = _createStack("AIK");
        vm.startPrank(alice);
        uint256 r = vault.payBuyFee(0, 100e18);
        vm.expectRevert(StacksClubVault.ReceiptStackMismatch.selector);
        vault.openPosition(id, r, _amounts(1e6, 1e8, 1e18));
        vm.stopPrank();
    }

    function test_openPosition_reusedReceipt() public {
        uint256 id = _createStack("AIK");
        vm.startPrank(alice);
        uint256 r = vault.payBuyFee(id, 100e18);
        vault.openPosition(id, r, _amounts(1e6, 1e8, 1e18));
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.ReceiptAlreadyUsed.selector, r));
        vault.openPosition(id, r, _amounts(1e6, 1e8, 1e18));
        vm.stopPrank();
    }

    function test_openPosition_unknownReceipt() public {
        uint256 id = _createStack("AIK");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.UnknownReceipt.selector, 42));
        vault.openPosition(id, 42, _amounts(1e6, 1e8, 1e18));
    }

    // ------------------------------------------------------------------
    // Open position
    // ------------------------------------------------------------------

    function test_openPosition_exactAmounts() public {
        uint256 id = _createStack("AIK");
        uint256[] memory amts = _amounts(123_456, 98_765_432, 7e17 + 3);
        uint256 pid = _open(alice, id, amts);
        assertEq(pid, 1);
        assertEq(vault.ownerOf(pid), alice);
        assertEq(vault.positionBalance(pid, address(a6)), 123_456);
        assertEq(vault.positionBalance(pid, address(a8)), 98_765_432);
        assertEq(vault.positionBalance(pid, address(a18)), 7e17 + 3);
        assertEq(vault.totalHeld(address(a6)), 123_456);
        assertEq(a6.balanceOf(address(vault)), 123_456);

        (uint256 sid,, address owner, address[] memory list, uint256[] memory bals) = vault.getPosition(pid);
        assertEq(sid, id);
        assertEq(owner, alice);
        assertEq(list[1], address(a8));
        assertEq(bals[2], 7e17 + 3);

        uint256[] memory mine = vault.positionsOf(alice);
        assertEq(mine.length, 1);
        assertEq(mine[0], pid);
        (,, bool used) = _receipt(1);
        assertTrue(used);
    }

    function test_openPosition_zeroAmountAndLength() public {
        uint256 id = _createStack("AIK");
        vm.startPrank(alice);
        uint256 r = vault.payBuyFee(id, 100e18);
        vm.expectRevert(StacksClubVault.ZeroAmount.selector);
        vault.openPosition(id, r, _amounts(1, 0, 1));
        uint256[] memory two = new uint256[](2);
        vm.expectRevert(StacksClubVault.LengthMismatch.selector);
        vault.openPosition(id, r, two);
        vm.stopPrank();
    }

    function test_openPosition_rejectsFeeOnTransfer() public {
        FeeOnTransferERC20 tax = new FeeOnTransferERC20();
        vm.prank(admin);
        vault.addAsset(address(tax), BSTOCK);
        address[] memory list = new address[](2);
        list[0] = address(a6);
        list[1] = address(tax);
        uint16[] memory w = new uint16[](2);
        w[0] = 5_000;
        w[1] = 5_000;
        vm.prank(creator);
        uint256 id = vault.createStack(list, w, "", "TAX");

        tax.mint(alice, 100e18);
        vm.startPrank(alice);
        tax.approve(address(vault), type(uint256).max);
        uint256 r = vault.payBuyFee(id, 100e18);
        uint256[] memory amts = new uint256[](2);
        amts[0] = 1e6;
        amts[1] = 10e18;
        vm.expectRevert(
            abi.encodeWithSelector(StacksClubVault.TransferAmountMismatch.selector, address(tax), 10e18, 9.9e18)
        );
        vault.openPosition(id, r, amts);
        vm.stopPrank();
    }

    function test_openPosition_rejectsAssetDisallowedAfterCreation() public {
        uint256 id = _createStack("AIK");
        vm.prank(alice);
        uint256 r = vault.payBuyFee(id, 100e18);
        vm.prank(admin);
        vault.setAssetAllowed(address(a18), false);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StacksClubVault.AssetNotAllowed.selector, address(a18)));
        vault.openPosition(id, r, _amounts(1e6, 1e8, 1e18));
    }

    // ------------------------------------------------------------------
    // Release
    // ------------------------------------------------------------------

    function test_release_25pct() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(1_000_001, 400, 1e18));
        uint256 before6 = a6.balanceOf(alice);
        vm.prank(alice);
        vault.release(pid, 2_500, 0);
        assertEq(a6.balanceOf(alice) - before6, 250_000); // 1_000_001 * 0.25 rounded down
        assertEq(vault.positionBalance(pid, address(a6)), 750_001);
        assertEq(vault.positionBalance(pid, address(a8)), 300);
        assertEq(vault.positionBalance(pid, address(a18)), 0.75e18);
        assertEq(vault.totalHeld(address(a6)), 750_001);
    }

    function test_release_33_33pct() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(1e6, 1e8, 1e18));
        vm.prank(alice);
        vault.release(pid, 3_333, 1);
        assertEq(vault.positionBalance(pid, address(a6)), 1e6 - 333_300);
        assertEq(vault.positionBalance(pid, address(a8)), 1e8 - 33_330_000);
        assertEq(vault.positionBalance(pid, address(a18)), 1e18 - 0.3333e18);
    }

    function test_release_100pct_burns() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(1e6, 1e8, 1e18));
        vm.prank(alice);
        vault.release(pid, 10_000, 0);
        assertEq(vault.positionBalance(pid, address(a6)), 0);
        assertEq(vault.totalHeld(address(a18)), 0);
        assertEq(a6.balanceOf(address(vault)), 0);
        vm.expectRevert();
        vault.ownerOf(pid);
        assertEq(vault.positionsOf(alice).length, 0);
    }

    function test_release_repeatedPartialsDownToDust_thenFull() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(7, 3, 1e18));
        for (uint256 i; i < 10; ++i) {
            vm.prank(alice);
            vault.release(pid, 5_000, 0);
        }
        // 7 -> 4 -> 2 -> 1 -> 1 ... dust stays; 3 -> 2 -> 1 -> 1 ...
        assertEq(vault.positionBalance(pid, address(a6)), 1);
        assertEq(vault.positionBalance(pid, address(a8)), 1);
        assertEq(vault.ownerOf(pid), alice); // dust remains, not burned
        vm.prank(alice);
        vault.release(pid, 10_000, 0);
        assertEq(vault.positionBalance(pid, address(a6)), 0);
        assertEq(vault.positionBalance(pid, address(a8)), 0);
        assertEq(vault.positionBalance(pid, address(a18)), 0);
        assertEq(vault.balanceOf(alice), 0);
    }

    function test_release_nonOwnerReverts() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(1e6, 1e8, 1e18));
        vm.prank(bob);
        vm.expectRevert(StacksClubVault.NotPositionOwner.selector);
        vault.release(pid, 10_000, 0);
        vm.prank(admin);
        vm.expectRevert(StacksClubVault.NotPositionOwner.selector);
        vault.release(pid, 10_000, 0);
    }

    function test_release_invalidBpsAndPurpose() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(1e6, 1e8, 1e18));
        vm.startPrank(alice);
        vm.expectRevert(StacksClubVault.InvalidBps.selector);
        vault.release(pid, 0, 0);
        vm.expectRevert(StacksClubVault.InvalidBps.selector);
        vault.release(pid, 10_001, 0);
        vm.expectRevert(StacksClubVault.InvalidPurpose.selector);
        vault.release(pid, 5_000, 2);
        vm.stopPrank();
    }

    function test_release_worksForDisallowedAsset() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(1e6, 1e8, 1e18));
        vm.prank(admin);
        vault.setAssetAllowed(address(a8), false);
        vm.prank(alice);
        vault.release(pid, 10_000, 0);
        assertEq(a8.balanceOf(address(vault)), 0);
    }

    // ------------------------------------------------------------------
    // Soulbound
    // ------------------------------------------------------------------

    function test_soulbound_transferReverts() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(1e6, 1e8, 1e18));
        vm.startPrank(alice);
        vm.expectRevert(StacksClubVault.Soulbound.selector);
        vault.transferFrom(alice, bob, pid);
        vm.expectRevert(StacksClubVault.Soulbound.selector);
        vault.safeTransferFrom(alice, bob, pid);
        vm.expectRevert(StacksClubVault.Soulbound.selector);
        vault.safeTransferFrom(alice, bob, pid, "");
        vm.stopPrank();
    }

    function test_tokenURI() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(1e6, 1e8, 1e18));
        assertEq(vault.tokenURI(pid), "https://example.test/api/positions/1/metadata");
    }

    // ------------------------------------------------------------------
    // Pause
    // ------------------------------------------------------------------

    function test_pause_blocksNewActivity_allowsReleaseAndClaims() public {
        uint256 id = _createStack("AIK");
        uint256 pid = _open(alice, id, _amounts(1e6, 1e8, 1e18));
        vm.prank(alice);
        uint256 r = vault.payBuyFee(id, 100e18);

        vm.prank(admin);
        vault.pause();

        (address[] memory list, uint16[] memory w) = _threeAssets();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.createStack(list, w, "", "NEW");
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.payBuyFee(id, 100e18);
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.openPosition(id, r, _amounts(1e6, 1e8, 1e18));

        vm.prank(alice);
        vault.release(pid, 5_000, 0);
        vm.prank(alice);
        vault.paySellFee(pid, 10e18);
        vm.prank(creator);
        vault.claimCreatorFees();
        assertEq(vault.creatorClaimable(creator), 0);
    }

    function test_pause_onlyPauser() public {
        bytes32 role = vault.PAUSER_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        vault.pause();
    }

    // ------------------------------------------------------------------
    // Sell fee, claims and platform withdrawal
    // ------------------------------------------------------------------

    function test_paySellFee() public {
        vm.prank(alice);
        vault.paySellFee(0, 250e18);
        assertEq(vault.platformAccrued(), 2.5e18);
        vm.prank(alice);
        vm.expectRevert(StacksClubVault.ZeroFee.selector);
        vault.paySellFee(0, 99);
    }

    function test_claimCreatorFees() public {
        uint256 id = _createStack("AIK");
        vm.prank(alice);
        vault.payBuyFee(id, 1_000e18); // fee 10, creator 2.5
        uint256 before = usdt.balanceOf(creator);
        vm.prank(creator);
        vault.claimCreatorFees();
        assertEq(usdt.balanceOf(creator) - before, 2.5e18);
        assertEq(vault.totalCreatorClaimable(), 0);
        vm.prank(creator);
        vm.expectRevert(StacksClubVault.NothingToClaim.selector);
        vault.claimCreatorFees();
    }

    function test_withdrawPlatformFees_capped() public {
        uint256 id = _createStack("AIK");
        vm.prank(alice);
        vault.payBuyFee(id, 1_000e18); // platform 7.5
        vm.prank(admin);
        vm.expectRevert(StacksClubVault.ExceedsAccrued.selector);
        vault.withdrawPlatformFees(7.5e18 + 1);
        vm.prank(admin);
        vault.withdrawPlatformFees(7.5e18);
        assertEq(usdt.balanceOf(platform), 7.5e18);
        assertEq(vault.platformAccrued(), 0);
        // creator's share is untouched and still claimable
        assertEq(usdt.balanceOf(address(vault)), 2.5e18);
    }

    function test_withdrawPlatformFees_onlyAdmin() public {
        bytes32 role = vault.DEFAULT_ADMIN_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        vault.withdrawPlatformFees(0);
    }

    function test_setPlatformFeeRecipient() public {
        vm.prank(admin);
        vault.setPlatformFeeRecipient(bob);
        assertEq(vault.platformFeeRecipient(), bob);
        vm.prank(admin);
        vm.expectRevert(StacksClubVault.ZeroAddress.selector);
        vault.setPlatformFeeRecipient(address(0));
    }

    function _receipt(uint256 id) internal view returns (address payer, uint256 stackId, bool used) {
        (payer, stackId,, used) = vault.feeReceipts(id);
    }
}
