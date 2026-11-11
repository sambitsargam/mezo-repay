// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "./Base.t.sol";
import {RePayAccount} from "../src/RePayAccount.sol";

/// @notice Collateral guard: steer pending MUSD into repayment and top up collateral from the owner's
///         BTC buffer when the Trove's collateral ratio falls below the owner's trigger.
contract GuardTest is BaseTest {
    uint64 internal constant TRIGGER = 1.6e18;
    uint64 internal constant TARGET = 1.8e18;

    function setUp() public override {
        super.setUp();
        openLoan(); // 0.065 BTC, debt 2602.4 → ~199.8% at 80,000
    }

    function _setGuard(uint64 t, uint64 g) internal {
        vm.prank(owner);
        account.setGuard(RePayAccount.Guard(t, g));
    }

    function _fundBuffer(uint256 amt) internal {
        vm.prank(owner);
        account.fundBuffer{value: amt}();
    }

    function _ratio() internal view returns (uint256) {
        (, uint256 debt, uint256 coll,) = account.loanState();
        return (coll * mezo.price()) / debt;
    }

    // --- configuration -------------------------------------------------------------------

    function test_guardDisabledByDefault() public view {
        (,,, RePayAccount.GuardStatus st) = account.guardPreview();
        assertEq(uint8(st), uint8(RePayAccount.GuardStatus.Disabled));
    }

    function test_setGuardValidation() public {
        vm.startPrank(owner);
        vm.expectRevert(RePayAccount.InvalidGuard.selector);
        account.setGuard(RePayAccount.Guard(0, 1.5e18)); // target without trigger
        vm.expectRevert(RePayAccount.InvalidGuard.selector);
        account.setGuard(RePayAccount.Guard(1.1e18, 1.5e18)); // trigger at Mezo MCR
        vm.expectRevert(RePayAccount.InvalidGuard.selector);
        account.setGuard(RePayAccount.Guard(1.6e18, 1.5e18)); // target below trigger
        vm.expectRevert(RePayAccount.InvalidGuard.selector);
        account.setGuard(RePayAccount.Guard(1.6e18, 10.1e18)); // target above cap
        account.setGuard(RePayAccount.Guard(TRIGGER, TARGET));
        assertEq(account.guard().triggerRatio, TRIGGER);
        account.setGuard(RePayAccount.Guard(0, 0)); // disable
        assertEq(account.guard().triggerRatio, 0);
        vm.stopPrank();
    }

    function test_healthyTroveCannotBeProtected() public {
        _setGuard(TRIGGER, TARGET);
        payAs(customer, 1000e18);
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.GuardNotActionable.selector, RePayAccount.GuardStatus.Healthy));
        vm.prank(keeper);
        account.protect(address(0), address(0));
    }

    function test_noActiveLoan() public {
        _setGuard(TRIGGER, TARGET);
        payAs(customer, 3000e18);
        vm.prank(owner);
        account.closeLoan();
        (,,, RePayAccount.GuardStatus st) = account.guardPreview();
        assertEq(uint8(st), uint8(RePayAccount.GuardStatus.NoActiveLoan));
    }

    // --- steering pending MUSD -------------------------------------------------------------

    function test_protectSteersPendingIntoRepaymentAndIgnoresCadence() public {
        _setGuard(TRIGGER, TARGET);
        payAs(customer, 1000e18); // 300 pending, 700 operating
        // Policy that would block normal automation: paused, cooldown, huge minExecution, reserve.
        setPolicy(RePayAccount.Policy(3000, 1 days, true, 10_000e18, 1000e18, 0));
        mezo.setPrice(62_000e18); // ratio ≈ 154.9%
        assertLt(_ratio(), TRIGGER);

        uint256 opBefore = account.operatingCash();
        (, uint256 debtBefore,,) = account.loanState();
        (uint256 ratio, uint256 repay, uint256 topUp, RePayAccount.GuardStatus st) = account.guardPreview();
        assertEq(uint8(st), uint8(RePayAccount.GuardStatus.Protectable));
        assertGt(ratio, 0);
        assertEq(topUp, 0); // no buffer funded

        vm.prank(keeper);
        (uint256 repaid, uint256 added) = account.protect(address(0), address(0));
        assertEq(repaid, repay);
        assertEq(added, 0);
        assertEq(account.operatingCash(), opBefore, "operating cash untouched");
        assertEq(account.pendingRepayment(), 300e18 - repaid);
        assertEq(account.totalProtectRepaid(), repaid);
        (, uint256 debtAfter,,) = account.loanState();
        assertEq(debtBefore - debtAfter, repaid);
        assertGt(_ratio(), ratio);
        assertConserved();
    }

    function test_protectRepaysOnlyWhatTargetNeeds() public {
        _setGuard(TRIGGER, TARGET);
        payAs(customer, 2000e18); // 600 pending
        mezo.setPrice(70_000e18); // ratio ≈ 174.8%, needs a little
        _setGuard(1.75e18, 1.76e18);
        (, uint256 repay,,) = account.guardPreview();
        assertGt(repay, 0);
        assertLt(repay, 600e18, "repays only enough for the target");
        vm.prank(keeper);
        account.protect(address(0), address(0));
        assertGe(_ratio(), 1.76e18);
        assertEq(account.pendingRepayment(), 600e18 - repay);
    }

    function test_protectRespectsMinimumDebtFloor() public {
        _setGuard(TRIGGER, 3e18);
        payAs(customer, 4000e18); // 1200 pending, more than repayable headroom (~600)
        mezo.setPrice(60_000e18);
        (, , , uint256 maxRepayable) = account.loanState();
        vm.prank(keeper);
        (uint256 repaid,) = account.protect(address(0), address(0));
        assertEq(repaid, maxRepayable);
        (, uint256 debt,,) = account.loanState();
        assertEq(debt, 2000e18, "stops at Mezo's 1,800 + 200 floor");
    }

    // --- buffer top-up ---------------------------------------------------------------------

    function test_protectTopsUpFromBufferWhenNothingPending() public {
        _setGuard(TRIGGER, TARGET);
        _fundBuffer(0.02 ether);
        mezo.setPrice(60_000e18); // ratio ≈ 149.9%
        (, uint256 repay, uint256 topUp, RePayAccount.GuardStatus st) = account.guardPreview();
        assertEq(uint8(st), uint8(RePayAccount.GuardStatus.Protectable));
        assertEq(repay, 0);
        assertGt(topUp, 0);
        uint256 balBefore = address(account).balance;

        vm.prank(keeper);
        (, uint256 added) = account.protect(address(0), address(0));
        assertEq(added, topUp);
        assertEq(account.collateralBuffer(), 0.02 ether - topUp);
        assertEq(address(account).balance, balBefore - topUp);
        assertGe(_ratio(), TARGET, "reaches target");
        assertLt(_ratio(), TARGET + 1e15, "does not overshoot");
    }

    function test_protectUsesPendingFirstThenBuffer() public {
        _setGuard(TRIGGER, 2.2e18);
        payAs(customer, 500e18); // 150 pending
        _fundBuffer(0.05 ether);
        mezo.setPrice(60_000e18);
        vm.prank(keeper);
        (uint256 repaid, uint256 added) = account.protect(address(0), address(0));
        assertEq(repaid, 150e18, "all pending used first");
        assertGt(added, 0);
        assertGe(_ratio(), 2.2e18);
    }

    function test_partialBufferStillImproves() public {
        _setGuard(TRIGGER, TARGET);
        _fundBuffer(0.001 ether);
        mezo.setPrice(55_000e18);
        uint256 before = _ratio();
        vm.prank(keeper);
        (, uint256 added) = account.protect(address(0), address(0));
        assertEq(added, 0.001 ether);
        assertEq(account.collateralBuffer(), 0);
        assertGt(_ratio(), before);
        assertLt(_ratio(), TARGET);
    }

    function test_noResourcesReverts() public {
        _setGuard(TRIGGER, TARGET);
        mezo.setPrice(60_000e18);
        (,,, RePayAccount.GuardStatus st) = account.guardPreview();
        assertEq(uint8(st), uint8(RePayAccount.GuardStatus.NoResources));
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.GuardNotActionable.selector, RePayAccount.GuardStatus.NoResources));
        account.protect(address(0), address(0));
    }

    function test_priceFeedFailureKeepsViewsWorking() public {
        _setGuard(TRIGGER, TARGET);
        mezo.setPriceFails(true);
        RePayAccount.Snapshot memory s = account.snapshot();
        assertEq(s.price, 0);
        assertEq(s.guardStatus, uint8(RePayAccount.GuardStatus.PriceUnavailable));
        assertGt(s.debt, 0, "loan data still readable");
        vm.expectRevert(
            abi.encodeWithSelector(RePayAccount.GuardNotActionable.selector, RePayAccount.GuardStatus.PriceUnavailable)
        );
        account.protect(address(0), address(0));
    }

    // --- buffer accounting -------------------------------------------------------------------

    function test_bufferIsSeparateFromFreeBtc() public {
        _fundBuffer(0.01 ether);
        vm.deal(address(account), address(account).balance + 0.003 ether); // e.g. returned collateral
        assertEq(account.freeBtc(), 0.003 ether);
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.InsufficientFreeBtc.selector, 0.003 ether, 0.004 ether));
        account.withdrawBtc(owner, 0.004 ether);
        account.withdrawBtc(owner, 0.003 ether);
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.InsufficientBuffer.selector, 0.01 ether, 0.02 ether));
        account.withdrawBuffer(owner, 0.02 ether);
        account.withdrawBuffer(owner, 0.01 ether);
        vm.stopPrank();
        assertEq(account.collateralBuffer(), 0);
        assertEq(address(account).balance, 0);
    }

    function test_snapshotReportsGuard() public {
        _setGuard(TRIGGER, TARGET);
        _fundBuffer(0.01 ether);
        mezo.setPrice(60_000e18);
        RePayAccount.Snapshot memory s = account.snapshot();
        assertEq(s.guard.triggerRatio, TRIGGER);
        assertEq(s.collateralBuffer, 0.01 ether);
        assertEq(s.price, 60_000e18);
        assertEq(s.ratio, _ratio());
        assertEq(s.guardStatus, uint8(RePayAccount.GuardStatus.Protectable));
        assertGt(s.guardTopUp, 0);
    }

    // --- fuzz ----------------------------------------------------------------------------------

    function testFuzz_protectNeverTouchesOperatingCashAndImprovesRatio(
        uint256 price,
        uint256 income,
        uint256 buffer,
        uint64 target
    ) public {
        price = bound(price, 36_000e18, 79_000e18); // stays above 110% with no help
        income = bound(income, 0, 5000e18);
        buffer = bound(buffer, 0, 0.2 ether);
        target = uint64(bound(target, 2.0e18, 4e18));
        _setGuard(2.0e18, target);
        if (income > 0) payAs(customer, income);
        if (buffer > 0) _fundBuffer(buffer);
        mezo.setPrice(price);

        uint256 op = account.operatingCash();
        uint256 pending = account.pendingRepayment();
        uint256 before = _ratio();
        (, uint256 repay, uint256 topUp, RePayAccount.GuardStatus st) = account.guardPreview();
        if (st != RePayAccount.GuardStatus.Protectable) return;

        vm.prank(keeper);
        account.protect(address(0), address(0));
        assertEq(account.operatingCash(), op, "operating cash untouched");
        assertEq(account.pendingRepayment(), pending - repay);
        assertEq(account.collateralBuffer(), buffer - topUp);
        assertGe(_ratio(), before, "ratio never gets worse");
        // Buffer not exhausted means the remaining gap was fully covered: target reached.
        if (topUp < buffer) assertGe(_ratio(), target, "target reached when buffer suffices");
        assertConserved();
    }
}
