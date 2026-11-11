// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "./Base.t.sol";
import {RePayAccount} from "../src/RePayAccount.sol";

/// @notice Owner-approved auto-close: once pending repayment alone covers the payoff, a keeper can
///         close the Trove. Operating cash is never used; collateral returns to the account.
contract AutoCloseTest is BaseTest {
    function setUp() public override {
        super.setUp();
        openLoan(); // debt 2602.4
    }

    function _enable() internal {
        vm.prank(owner);
        account.setAutoClose(true);
    }

    function _status() internal view returns (RePayAccount.CloseStatus st) {
        (, st) = account.closePreview();
    }

    function test_disabledByDefault() public {
        payAs(customer, 10_000e18); // 3,000 pending: more than enough
        assertEq(uint8(_status()), uint8(RePayAccount.CloseStatus.Disabled));
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.AutoCloseNotReady.selector, RePayAccount.CloseStatus.Disabled));
        vm.prank(keeper);
        account.executeClose();
    }

    function test_waitsUntilPendingCoversPayoff() public {
        _enable();
        payAs(customer, 5000e18); // 1,500 pending, payoff 2,402.4
        (uint256 required, RePayAccount.CloseStatus st) = account.closePreview();
        assertEq(uint8(st), uint8(RePayAccount.CloseStatus.InsufficientPending));
        assertEq(required, 2402.4e18);
        assertGt(account.operatingCash(), required, "operating cash could cover it, but is never used");
        vm.expectRevert(
            abi.encodeWithSelector(RePayAccount.AutoCloseNotReady.selector, RePayAccount.CloseStatus.InsufficientPending)
        );
        vm.prank(keeper);
        account.executeClose();
    }

    function test_keeperClosesFromPendingOnly() public {
        _enable();
        payAs(customer, 9000e18); // 2,700 pending
        uint256 op = account.operatingCash();
        uint256 keeperMusd = token.balanceOf(keeper);
        (uint256 required,) = account.closePreview();

        vm.prank(keeper);
        uint256 repaid = account.executeClose();
        assertEq(repaid, required);
        assertEq(account.pendingRepayment(), 2700e18 - required, "excess stays pending");
        assertEq(account.operatingCash(), op, "operating cash untouched");
        assertEq(account.totalRepaid(), required);
        assertEq(address(account).balance, COLL, "collateral returned to the account, not the keeper");
        assertEq(token.balanceOf(keeper), keeperMusd);
        assertEq(keeper.balance, 0);
        (,,, uint256 max) = account.loanState();
        assertEq(max, 0);
        assertEq(uint8(_status()), uint8(RePayAccount.CloseStatus.NoActiveLoan));
        assertConserved();

        // Owner takes the BTC back and can reopen.
        vm.prank(owner);
        account.withdrawBtc(owner, COLL);
        openLoan();
    }

    function test_includesInterestAccruedToTheBlock() public {
        _enable();
        payAs(customer, 8100e18); // 2,430 pending
        vm.warp(block.timestamp + 365 days); // ~24 MUSD interest
        (uint256 required, RePayAccount.CloseStatus st) = account.closePreview();
        assertGt(required, 2402.4e18);
        assertEq(uint8(st), uint8(RePayAccount.CloseStatus.Ready));
        vm.prank(keeper);
        assertEq(account.executeClose(), required);
    }

    function test_pauseBlocksAutoCloseButNotOwnerClose() public {
        _enable();
        payAs(customer, 9000e18);
        vm.prank(owner);
        account.setPaused(true);
        assertEq(uint8(_status()), uint8(RePayAccount.CloseStatus.Paused));
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.AutoCloseNotReady.selector, RePayAccount.CloseStatus.Paused));
        account.executeClose();
        vm.prank(owner);
        account.closeLoan();
    }

    function test_recoveryModeReverts() public {
        _enable();
        payAs(customer, 9000e18);
        mezo.setRecoveryMode(true);
        vm.expectRevert();
        account.executeClose();
        assertEq(account.pendingRepayment(), 2700e18, "nothing spent on failure");
    }

    function test_ownerCanOptOut() public {
        _enable();
        payAs(customer, 9000e18);
        vm.prank(owner);
        account.setAutoClose(false);
        assertEq(uint8(_status()), uint8(RePayAccount.CloseStatus.Disabled));
    }

    function test_snapshotReportsAutoClose() public {
        _enable();
        payAs(customer, 1000e18);
        RePayAccount.Snapshot memory s = account.snapshot();
        assertTrue(s.autoClose);
        assertEq(s.closeRequired, 2402.4e18);
        assertEq(s.closeStatus, uint8(RePayAccount.CloseStatus.InsufficientPending));
    }

    function testFuzz_closeNeverTouchesOperatingCash(uint256 income, uint256 capital, uint32 warp) public {
        income = bound(income, 1e18, 20_000e18);
        capital = bound(capital, 0, 3000e18);
        _enable();
        payAs(customer, income);
        if (capital > 0) {
            fund(owner, capital);
            vm.startPrank(owner);
            token.approve(address(account), capital);
            account.depositCapital(capital, true);
            vm.stopPrank();
        }
        vm.warp(block.timestamp + bound(warp, 0, 400 days));
        uint256 op = account.operatingCash();
        uint256 pending = account.pendingRepayment();
        (uint256 required, RePayAccount.CloseStatus st) = account.closePreview();
        if (st != RePayAccount.CloseStatus.Ready) {
            assertLt(pending, required);
            return;
        }
        vm.prank(keeper);
        account.executeClose();
        assertEq(account.operatingCash(), op);
        assertEq(account.pendingRepayment(), pending - required);
        assertConserved();
    }
}
