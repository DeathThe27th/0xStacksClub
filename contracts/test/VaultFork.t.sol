// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {StacksClubVault} from "../src/StacksClubVault.sol";

/// @notice Answers the key question for this product: can real bStocks and Ondo tokens sit in
///         the vault and come back out? Runs against BSC mainnet; skips if BSC_RPC_URL is unset.
///         Assets come from test/fork-assets.json, written by `pnpm seed:assets`.
contract VaultForkTest is Test {
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955;

    struct ForkAsset {
        address addr;
        string provider;
        string symbol;
    }

    StacksClubVault internal vault;
    ForkAsset[] internal forkAssets;
    address internal admin = makeAddr("admin");
    address internal user = makeAddr("forkUser");
    bool internal noRpc;

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            noRpc = true;
            return;
        }
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 56, "fork is not BSC mainnet");

        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fork-assets.json"));
        address[] memory addrs = vm.parseJsonAddressArray(json, ".addresses");
        string[] memory providers = vm.parseJsonStringArray(json, ".providers");
        string[] memory symbols = vm.parseJsonStringArray(json, ".symbols");
        require(addrs.length == providers.length && addrs.length == symbols.length, "fork-assets.json arrays differ");
        for (uint256 i; i < addrs.length; ++i) {
            forkAssets.push(ForkAsset({addr: addrs[i], provider: providers[i], symbol: symbols[i]}));
        }

        vault = new StacksClubVault(IERC20(USDT), makeAddr("platform"), admin, "https://0x-stacks-club.vercel.app");
    }

    function test_fork_providerTokensRoundTripThroughVault() public {
        if (noRpc) {
            vm.skip(true);
            return;
        }
        _requireBothProviders();

        // Pick up to 5 components, bStocks and Ondo both represented.
        uint256 n = forkAssets.length > 5 ? 5 : forkAssets.length;
        address[] memory list = new address[](n);
        uint16[] memory w = new uint16[](n);
        uint256[] memory amts = new uint256[](n);
        uint256 remaining = 10_000;
        for (uint256 i; i < n; ++i) {
            ForkAsset memory fa = _pick(i, n);
            list[i] = fa.addr;
            w[i] = i == n - 1 ? uint16(remaining) : uint16(10_000 / n);
            remaining -= w[i];

            amts[i] = _fund(fa);
            _checkDirectTransfers(fa, amts[i]);

            vm.prank(admin);
            try vault.addAsset(fa.addr, keccak256(bytes(fa.provider))) {}
            catch (bytes memory err) {
                _failWith("addAsset", fa, err);
            }
        }

        vm.prank(user);
        uint256 stackId = vault.createStack(list, w, "ipfs://fork", "FORK");

        deal(USDT, user, 100e18);
        vm.startPrank(user);
        IERC20(USDT).approve(address(vault), 1e18);
        uint256 receipt = vault.payBuyFee(stackId, 100e18);
        for (uint256 i; i < n; ++i) {
            IERC20(list[i]).approve(address(vault), amts[i]);
        }
        uint256 positionId;
        try vault.openPosition(stackId, receipt, amts) returns (uint256 pid) {
            positionId = pid;
        } catch (bytes memory err) {
            vm.stopPrank();
            _failWithList("openPosition (transfer INTO vault)", list, err);
        }
        vm.stopPrank();

        for (uint256 i; i < n; ++i) {
            assertEq(vault.positionBalance(positionId, list[i]), amts[i], "position balance != deposited");
        }

        uint256[] memory before = _balances(list);
        vm.prank(user);
        try vault.release(positionId, 5_000, 1) {}
        catch (bytes memory err) {
            _failWithList("release 50% (transfer OUT of vault)", list, err);
        }
        uint256[] memory mid = _balances(list);
        for (uint256 i; i < n; ++i) {
            assertEq(mid[i] - before[i], amts[i] / 2, "50% release amount mismatch");
        }

        vm.prank(user);
        try vault.release(positionId, 10_000, 0) {}
        catch (bytes memory err) {
            _failWithList("release 100% (transfer OUT of vault)", list, err);
        }
        uint256[] memory end_ = _balances(list);
        for (uint256 i; i < n; ++i) {
            assertEq(end_[i] - before[i], amts[i], "full release did not return every unit");
            assertEq(vault.totalHeld(list[i]), 0);
            console2.log("OK round trip:", _pick(i, n).symbol, list[i]);
        }
        assertEq(vault.balanceOf(user), 0, "position NFT not burned");
    }

    /// Every token in fork-assets.json, one at a time, each paired with a partner token in a
    /// 2-component Stack: fund, direct transfer in/out, addAsset, open, release 50%, release 100%.
    /// Collects every failure and reports them all at the end.
    function test_fork_everyTokenRoundTrip() public {
        if (noRpc) {
            vm.skip(true);
            return;
        }
        _requireBothProviders();
        uint256 n = forkAssets.length;

        // Fund and allowlist everything first so each token can act as a partner.
        bool[] memory ready = new bool[](n);
        uint256[] memory amounts = new uint256[](n);
        string memory failures;
        uint256 failed;
        for (uint256 i; i < n; ++i) {
            try this.prepare(i) returns (uint256 amt) {
                ready[i] = true;
                amounts[i] = amt;
            } catch (bytes memory err) {
                failed++;
                failures = string.concat(failures, "\n  ", _label(i), " prepare: ", _reason(err));
            }
        }

        uint256 ok;
        for (uint256 i; i < n; ++i) {
            if (!ready[i]) continue;
            uint256 j = _partner(i, ready);
            if (j == type(uint256).max) break;
            try this.roundTrip(i, j, amounts[i], amounts[j], i + 1) {
                ok++;
                console2.log("VAULT OK", forkAssets[i].provider, forkAssets[i].symbol, forkAssets[i].addr);
            } catch (bytes memory err) {
                failed++;
                failures = string.concat(failures, "\n  ", _label(i), " round trip: ", _reason(err));
            }
        }

        console2.log("tokens round-tripped:", ok, "failed:", failed);
        if (failed != 0) revert(string.concat("VAULT INCOMPATIBLE TOKENS:", failures));
    }

    /// @dev External so a revert is caught per token.
    function prepare(uint256 i) external returns (uint256 amount) {
        ForkAsset memory fa = forkAssets[i];
        // enough for several deposits
        amount = _fund(fa);
        _checkDirectTransfers(fa, amount);
        vm.prank(admin);
        vault.addAsset(fa.addr, keccak256(bytes(fa.provider)));
    }

    /// @dev External so a revert is caught per token.
    function roundTrip(uint256 i, uint256 j, uint256 amtI, uint256 amtJ, uint256 salt) external {
        address a = forkAssets[i].addr;
        address b = forkAssets[j].addr;
        address[] memory list = new address[](2);
        list[0] = a;
        list[1] = b;
        uint16[] memory w = new uint16[](2);
        w[0] = 5_000;
        w[1] = 5_000;
        uint256[] memory amts = new uint256[](2);
        amts[0] = amtI / 4;
        amts[1] = amtJ / 4;

        vm.prank(user);
        uint256 stackId = vault.createStack(list, w, "ipfs://fork", _ticker(salt));
        deal(USDT, user, 100e18);
        vm.startPrank(user);
        IERC20(USDT).approve(address(vault), 1e18);
        uint256 receipt = vault.payBuyFee(stackId, 100e18);
        IERC20(a).approve(address(vault), amts[0]);
        IERC20(b).approve(address(vault), amts[1]);
        uint256 pid = vault.openPosition(stackId, receipt, amts);
        uint256 beforeA = IERC20(a).balanceOf(user);
        vault.release(pid, 5_000, 1);
        vault.release(pid, 10_000, 0);
        vm.stopPrank();

        require(IERC20(a).balanceOf(user) - beforeA == amts[0], "did not get every unit back");
        require(vault.positionBalance(pid, a) == 0 && vault.positionBalance(pid, b) == 0, "balances not zero");
    }

    function _partner(uint256 i, bool[] memory ready) internal pure returns (uint256) {
        for (uint256 k = 1; k < ready.length; ++k) {
            uint256 j = (i + k) % ready.length;
            if (ready[j]) return j;
        }
        return type(uint256).max;
    }

    /// Unique A-Z ticker per salt: "F" + base-26 digits.
    function _ticker(uint256 salt) internal pure returns (string memory) {
        bytes memory out = new bytes(4);
        out[0] = "F";
        for (uint256 k = 3; k >= 1; --k) {
            out[k] = bytes1(uint8(65 + (salt % 26)));
            salt /= 26;
        }
        return string(out);
    }

    function _label(uint256 i) internal view returns (string memory) {
        return string.concat(forkAssets[i].symbol, " (", forkAssets[i].provider, ") ", vm.toString(forkAssets[i].addr));
    }

    /// Error(string) reverts become their message; anything else is shown as hex revert data.
    function _reason(bytes memory err) internal pure returns (string memory) {
        if (err.length >= 68 && bytes4(err) == 0x08c379a0) {
            bytes memory payload = new bytes(err.length - 4);
            for (uint256 k; k < payload.length; ++k) {
                payload[k] = err[k + 4];
            }
            return abi.decode(payload, (string));
        }
        return vm.toString(err);
    }

    // ------------------------------------------------------------------

    function _requireBothProviders() internal view {
        bool b;
        bool o;
        for (uint256 i; i < forkAssets.length; ++i) {
            bytes32 p = keccak256(bytes(forkAssets[i].provider));
            if (p == keccak256("bstock")) b = true;
            if (p == keccak256("ondo")) o = true;
        }
        require(b && o, "fork-assets.json needs at least one bstock and one ondo asset");
        require(forkAssets.length >= 2, "need at least 2 assets");
    }

    /// Spread picks across the list so both providers appear when the list is long.
    function _pick(uint256 i, uint256 n) internal view returns (ForkAsset memory) {
        if (forkAssets.length <= 5) return forkAssets[i];
        // first half from the front, second half from the back
        return i < n / 2 + 1 ? forkAssets[i] : forkAssets[forkAssets.length - (n - i)];
    }

    function dealExternal(address token, address to, uint256 amount) external {
        deal(token, to, amount);
    }

    /// Gives `user` one whole token (or a tenth of a holder's balance). Tries `deal` first, then
    /// a FORK_HOLDER_<SYMBOL> account.
    function _fund(ForkAsset memory fa) internal returns (uint256 amount) {
        uint8 dec = IERC20Metadata(fa.addr).decimals();
        amount = 10 ** dec;
        uint256 before = IERC20(fa.addr).balanceOf(user);
        try this.dealExternal(fa.addr, user, before + amount) {} catch {}
        if (IERC20(fa.addr).balanceOf(user) == before + amount) return amount;

        address holder = vm.envOr(string.concat("FORK_HOLDER_", fa.symbol), address(0));
        require(
            holder != address(0),
            string.concat("deal() failed for ", fa.symbol, "; set FORK_HOLDER_", fa.symbol, " to a current holder")
        );
        uint256 hb = IERC20(fa.addr).balanceOf(holder);
        require(hb > 0, string.concat("FORK_HOLDER_", fa.symbol, " holds none"));
        if (hb / 10 < amount) amount = hb / 10;
        vm.prank(holder);
        try IERC20(fa.addr).transfer(user, amount) {}
        catch (bytes memory err) {
            _failWith("holder transfer to test user", fa, err);
        }
    }

    /// Transfer straight to the vault address and back, to separate token-level transfer
    /// restrictions from vault logic.
    function _checkDirectTransfers(ForkAsset memory fa, uint256 amount) internal {
        uint256 probe = amount / 10 == 0 ? 1 : amount / 10;
        vm.prank(user);
        try IERC20(fa.addr).transfer(address(vault), probe) {}
        catch (bytes memory err) {
            _failWith("direct transfer INTO vault address", fa, err);
        }
        vm.prank(address(vault));
        try IERC20(fa.addr).transfer(user, probe) {}
        catch (bytes memory err) {
            _failWith("direct transfer OUT of vault address", fa, err);
        }
    }

    function _balances(address[] memory list) internal view returns (uint256[] memory b) {
        b = new uint256[](list.length);
        for (uint256 i; i < list.length; ++i) {
            b[i] = IERC20(list[i]).balanceOf(user);
        }
    }

    function _failWith(string memory step, ForkAsset memory fa, bytes memory err) internal pure {
        revert(
            string.concat(
                "VAULT INCOMPATIBLE: ", step, " reverted for ", fa.symbol, " (", fa.provider, ") ",
                vm.toString(fa.addr), " revert data: ", vm.toString(err)
            )
        );
    }

    function _failWithList(string memory step, address[] memory list, bytes memory err) internal pure {
        string memory tokens;
        for (uint256 i; i < list.length; ++i) {
            tokens = string.concat(tokens, i == 0 ? "" : ", ", vm.toString(list[i]));
        }
        revert(string.concat("VAULT INCOMPATIBLE: ", step, " reverted. tokens: ", tokens, " revert data: ", vm.toString(err)));
    }
}
