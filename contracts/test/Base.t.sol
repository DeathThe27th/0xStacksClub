// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StacksClubVault} from "../src/StacksClubVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

abstract contract VaultBase is Test {
    StacksClubVault internal vault;
    MockERC20 internal usdt;
    MockERC20 internal a6; // 6 decimals
    MockERC20 internal a8; // 8 decimals
    MockERC20 internal a18; // 18 decimals

    address internal admin = makeAddr("admin");
    address internal platform = makeAddr("platform");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes32 internal constant BSTOCK = keccak256("bstock");
    bytes32 internal constant ONDO = keccak256("ondo");

    function setUp() public virtual {
        usdt = new MockERC20("Tether USD", "USDT", 18);
        a6 = new MockERC20("Six", "SIX", 6);
        a8 = new MockERC20("Eight", "EIGHT", 8);
        a18 = new MockERC20("Eighteen", "EIGHTEEN", 18);
        vault = new StacksClubVault(usdt, platform, admin, "https://example.test");

        vm.startPrank(admin);
        vault.addAsset(address(a6), BSTOCK);
        vault.addAsset(address(a8), ONDO);
        vault.addAsset(address(a18), BSTOCK);
        vm.stopPrank();

        address[3] memory users = [creator, alice, bob];
        for (uint256 i; i < users.length; ++i) {
            usdt.mint(users[i], 1_000_000e18);
            a6.mint(users[i], 1_000_000e6);
            a8.mint(users[i], 1_000_000e8);
            a18.mint(users[i], 1_000_000e18);
            vm.startPrank(users[i]);
            usdt.approve(address(vault), type(uint256).max);
            a6.approve(address(vault), type(uint256).max);
            a8.approve(address(vault), type(uint256).max);
            a18.approve(address(vault), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _threeAssets() internal view returns (address[] memory list, uint16[] memory w) {
        list = new address[](3);
        list[0] = address(a6);
        list[1] = address(a8);
        list[2] = address(a18);
        w = new uint16[](3);
        w[0] = 5_000;
        w[1] = 2_500;
        w[2] = 2_500;
    }

    function _createStack(string memory ticker) internal returns (uint256 id) {
        (address[] memory list, uint16[] memory w) = _threeAssets();
        vm.prank(creator);
        id = vault.createStack(list, w, "ipfs://meta", ticker);
    }

    function _amounts(uint256 x6, uint256 x8, uint256 x18) internal pure returns (uint256[] memory a) {
        a = new uint256[](3);
        a[0] = x6;
        a[1] = x8;
        a[2] = x18;
    }

    function _open(address who, uint256 stackId, uint256[] memory amounts) internal returns (uint256 positionId) {
        vm.startPrank(who);
        uint256 receipt = vault.payBuyFee(stackId, 100e18);
        positionId = vault.openPosition(stackId, receipt, amounts);
        vm.stopPrank();
    }
}
