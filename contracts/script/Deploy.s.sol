// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StacksClubVault} from "../src/StacksClubVault.sol";

/// Deploys StacksClubVault and allowlists every asset in deploy/assets.json.
/// Reads DEPLOYER_PRIVATE_KEY, PLATFORM_FEE_RECIPIENT, USDT_ADDRESS and APP_BASE_URL from the
/// environment at run time only.
///
///   forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --broadcast --verify
///   pnpm export-abi
contract Deploy is Script {
    function run() external returns (StacksClubVault vault) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feeRecipient = vm.envAddress("PLATFORM_FEE_RECIPIENT");
        address usdt = vm.envAddress("USDT_ADDRESS");
        string memory baseURI = vm.envOr("APP_BASE_URL", string("https://0x-stacks-club.vercel.app"));
        address deployer = vm.addr(pk);

        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deploy/assets.json"));
        address[] memory tokens = vm.parseJsonAddressArray(json, ".addresses");
        string[] memory providers = vm.parseJsonStringArray(json, ".providers");
        require(tokens.length == providers.length, "assets.json arrays differ");
        uint256 n = tokens.length;

        vm.startBroadcast(pk);
        vault = new StacksClubVault(IERC20(usdt), feeRecipient, deployer, baseURI);
        for (uint256 i; i < n; ++i) {
            vault.addAsset(tokens[i], keccak256(bytes(providers[i])));
        }
        vm.stopBroadcast();

        console2.log("StacksClubVault:", address(vault));
        console2.log("assets added:", n);
    }
}
