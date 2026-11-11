// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "./Base.t.sol";
import {RePayAccount} from "../src/RePayAccount.sol";

/// @notice Every owner-only entry point rejects every non-owner caller (a stranger, a keeper, the
///         factory, and a payer), and the two permissionless entry points cannot move value anywhere
///         except into this account's own Trove.
contract PermissionsTest is BaseTest {
    function _ownerCalls() internal view returns (bytes[] memory c) {
        RePayAccount.Policy memory p = defaultPolicy();
        c = new bytes[](19);
        c[0] = abi.encodeCall(RePayAccount.setPolicy, (p));
        c[1] = abi.encodeCall(RePayAccount.setPaused, (true));
        c[2] = abi.encodeCall(RePayAccount.classifyUnclassified, (1, true, false, bytes32(0)));
        c[3] = abi.encodeCall(RePayAccount.depositCapital, (1, false));
        c[4] = abi.encodeCall(RePayAccount.ownerRepay, (1, false, address(0), address(0)));
        c[5] = abi.encodeCall(RePayAccount.openLoan, (2000e18, address(0), address(0)));
        c[6] = abi.encodeCall(RePayAccount.addCollateral, (address(0), address(0)));
        c[7] = abi.encodeCall(RePayAccount.borrow, (1e18, address(0), address(0)));
        c[8] = abi.encodeCall(RePayAccount.withdrawCollateral, (1, attacker, address(0), address(0)));
        c[9] = abi.encodeCall(RePayAccount.closeLoan, ());
        c[10] = abi.encodeCall(RePayAccount.claimCollateralSurplus, ());
        c[11] = abi.encodeCall(RePayAccount.withdrawOperating, (attacker, 1));
        c[12] = abi.encodeCall(RePayAccount.releasePending, (1));
        c[13] = abi.encodeCall(RePayAccount.withdrawBtc, (attacker, 1));
        c[14] = abi.encodeCall(RePayAccount.setGuard, (RePayAccount.Guard(0, 0)));
        c[15] = abi.encodeCall(RePayAccount.fundBuffer, ());
        c[16] = abi.encodeCall(RePayAccount.withdrawBuffer, (attacker, 1));
        c[17] = abi.encodeCall(RePayAccount.setAutoClose, (true));
        c[18] = abi.encodeCall(RePayAccount.initialize, (attacker, p));
    }

    function test_everyOwnerFunctionRejectsNonOwners() public {
        openLoan();
        payAs(customer, 1000e18);
        vm.deal(address(account), address(account).balance + 1 ether);
        address[4] memory callers = [attacker, keeper, address(factory), customer];
        bytes[] memory calls = _ownerCalls();
        for (uint256 i; i < callers.length; i++) {
            vm.deal(callers[i], 1 ether);
            for (uint256 j; j < calls.length; j++) {
                uint256 value = (j == 5 || j == 6 || j == 15) ? 0.1 ether : 0;
                vm.prank(callers[i]);
                (bool ok, bytes memory ret) = address(account).call{value: value}(calls[j]);
                assertFalse(ok, string.concat("non-owner call succeeded: #", vm.toString(j)));
                bytes4 sel = bytes4(ret);
                // initialize is guarded by the initializer (already initialized), the rest by onlyOwner
                bytes4 want = j == 18 ? bytes4(keccak256("InvalidInitialization()")) : RePayAccount.NotOwner.selector;
                assertEq(sel, want, string.concat("wrong revert for call #", vm.toString(j)));
            }
        }
    }

    function test_permissionlessCallsOnlyBenefitTheAccountsOwnTrove() public {
        openLoan();
        payAs(customer, 1000e18);
        vm.prank(owner);
        account.setGuard(RePayAccount.Guard(1.6e18, 1.8e18));
        vm.prank(owner);
        account.fundBuffer{value: 0.01 ether}();

        uint256 keeperMusd = token.balanceOf(keeper);
        uint256 keeperBtc = keeper.balance;
        uint256 op = account.operatingCash();

        vm.prank(keeper);
        account.executeRepayment(address(0), address(0));
        payAs(makeAddr("secondPayer"), 1000e18);
        op = account.operatingCash();
        mezo.setPrice(55_000e18);
        vm.prank(keeper);
        account.protect(address(0), address(0));

        assertEq(token.balanceOf(keeper), keeperMusd, "keeper gained no MUSD");
        assertEq(keeper.balance, keeperBtc, "keeper gained no BTC");
        assertEq(account.operatingCash(), op, "operating cash untouched by permissionless calls");
        assertEq(account.owner(), owner);
    }
}
