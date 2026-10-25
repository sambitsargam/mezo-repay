// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "./Base.t.sol";
import {RePayAccount} from "../src/RePayAccount.sol";
import {RePayAccountFactory} from "../src/RePayAccountFactory.sol";
import {MockMezo} from "./mocks/MockMezo.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FactoryTest is BaseTest {
    function test_createAccount_setsOwnerAndRegisters() public view {
        assertEq(account.owner(), owner);
        assertTrue(factory.isAccount(address(account)));
        assertEq(factory.accountCount(), 1);
        assertEq(factory.accountsOf(owner)[0], address(account));
        assertEq(address(account.musd()), address(token));
        assertEq(account.policy().repaymentBps, 3000);
    }

    function test_cannotReinitializeClone() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        vm.prank(address(factory));
        account.initialize(attacker, defaultPolicy());
    }

    function test_implementationCannotBeInitialized() public {
        RePayAccount impl = RePayAccount(payable(factory.implementation()));
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        vm.prank(address(factory));
        impl.initialize(attacker, defaultPolicy());
    }

    function test_onlyFactoryCanInitialize() public {
        // A fresh clone of the implementation cannot be initialized by anyone but the factory.
        address clone = _clone(factory.implementation());
        vm.expectRevert(RePayAccount.NotFactory.selector);
        vm.prank(attacker);
        RePayAccount(payable(clone)).initialize(attacker, defaultPolicy());
    }

    function test_createAccount_rejectsInvalidPolicy() public {
        RePayAccount.Policy memory p = defaultPolicy();
        p.repaymentBps = 10_001;
        vm.expectRevert(RePayAccount.InvalidPolicy.selector);
        factory.createAccount(p);
    }

    function test_accountsSlice() public {
        vm.prank(customer);
        factory.createAccount(defaultPolicy());
        address[] memory page = factory.accountsSlice(0, 10);
        assertEq(page.length, 2);
        assertEq(factory.accountsSlice(5, 10).length, 0);
        assertEq(factory.accountsSlice(1, 1).length, 1);
    }

    function _clone(address impl) internal returns (address instance) {
        assembly {
            mstore(0x00, or(shr(0xe8, shl(0x60, impl)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            mstore(0x20, or(shl(0x78, impl), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(0, 0x09, 0x37)
        }
    }
}

contract AuthorityTest is BaseTest {
    function setUp() public override {
        super.setUp();
        openLoan();
    }

    function test_nonOwnerCannotChangePolicy() public {
        vm.expectRevert(RePayAccount.NotOwner.selector);
        vm.prank(attacker);
        account.setPolicy(defaultPolicy());
        vm.expectRevert(RePayAccount.NotOwner.selector);
        vm.prank(attacker);
        account.setPaused(true);
    }

    function test_nonOwnerCannotBorrowOrWithdrawCollateral() public {
        vm.startPrank(attacker);
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.borrow(100e18, address(0), address(0));
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.withdrawCollateral(0.01 ether, attacker, address(0), address(0));
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.closeLoan();
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.openLoan(BORROW, address(0), address(0));
        vm.stopPrank();
    }

    function test_nonOwnerCannotMoveFunds() public {
        vm.startPrank(attacker);
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.withdrawOperating(attacker, 1);
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.releasePending(1);
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.withdrawBtc(attacker, 1);
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.classifyUnclassified(1, true, false, 0);
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.ownerRepay(1, true, address(0), address(0));
        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.claimCollateralSurplus();
        vm.stopPrank();
    }

    function test_keeperExecutionPaysNoOneAndOnlyReducesOwnDebt() public {
        payAs(customer, 500e18);
        uint256 keeperBefore = token.balanceOf(keeper);
        uint256 debtBefore = mezo.totalDebt(address(account));
        uint256 opBefore = account.operatingCash();
        vm.prank(keeper);
        uint256 amount = account.executeRepayment(address(0), address(0));
        assertEq(amount, 150e18);
        assertEq(token.balanceOf(keeper), keeperBefore, "keeper received funds");
        assertEq(mezo.totalDebt(address(account)), debtBefore - 150e18);
        assertEq(account.operatingCash(), opBefore, "operating cash touched");
        assertEq(account.pendingRepayment(), 0);
    }

    function test_noCrossAccountLeakage() public {
        vm.prank(customer);
        RePayAccount other = RePayAccount(payable(factory.createAccount(defaultPolicy())));
        vm.deal(customer, 1 ether);
        vm.prank(customer);
        other.openLoan{value: COLL}(BORROW, address(0), address(0));

        payAs(makeAddr("payer2"), 1000e18); // pays `account`
        uint256 otherDebt = mezo.totalDebt(address(other));
        uint256 otherBal = token.balanceOf(address(other));
        account.executeRepayment(address(0), address(0));
        // executing `other` has nothing pending: it must not be able to use account's funds
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.RepaymentNotReady.selector, RePayAccount.Status.NothingPending));
        other.executeRepayment(address(0), address(0));
        assertEq(mezo.totalDebt(address(other)), otherDebt);
        assertEq(token.balanceOf(address(other)), otherBal);
    }
}

contract IncomeAccountingTest is BaseTest {
    function setUp() public override {
        super.setUp();
        openLoan();
    }

    function test_examplePayment_500_at_30pct() public {
        uint256 id = payAs(customer, 500e18);
        assertEq(id, 1);
        assertEq(account.pendingRepayment(), 150e18);
        assertEq(account.operatingCash(), BORROW + 350e18);
        assertEq(account.totalIncome(), 500e18);
        assertEq(account.totalAllocated(), 150e18);
        assertConserved();
    }

    function test_borrowedFundsAreNotIncome() public view {
        assertEq(account.totalIncome(), 0);
        assertEq(account.pendingRepayment(), 0);
        assertEq(account.operatingCash(), BORROW);
        assertEq(account.totalBorrowed(), BORROW);
    }

    function test_additionalBorrowIsNotIncome() public {
        vm.prank(owner);
        account.borrow(100e18, address(0), address(0));
        assertEq(account.totalIncome(), 0);
        assertEq(account.pendingRepayment(), 0);
        assertEq(account.totalBorrowed(), BORROW + 100e18);
    }

    function testFuzz_allocationRounding(uint256 amount, uint16 bps) public {
        amount = bound(amount, 1, 1_000_000e18);
        bps = uint16(bound(bps, 0, 10_000));
        RePayAccount.Policy memory p = defaultPolicy();
        p.repaymentBps = bps;
        setPolicy(p);
        uint256 opBefore = account.operatingCash();
        payAs(customer, amount);
        uint256 expected = (amount * bps) / 10_000;
        assertEq(account.pendingRepayment(), expected, "floor allocation");
        assertEq(account.operatingCash() - opBefore, amount - expected, "remainder to operating");
        assertConserved();
    }

    function test_directTransferIsUnclassified() public {
        fund(customer, 300e18);
        vm.prank(customer);
        token.transfer(address(account), 300e18);
        assertEq(account.unclassifiedBalance(), 300e18);
        assertEq(account.totalIncome(), 0);
        assertEq(account.pendingRepayment(), 0);
        (, RePayAccount.Status st) = account.previewRepayment();
        assertEq(uint8(st), uint8(RePayAccount.Status.NothingPending));
        assertConserved();
    }

    function test_classifyUnclassifiedAsRevenue() public {
        fund(customer, 300e18);
        vm.prank(customer);
        token.transfer(address(account), 300e18);
        vm.prank(owner);
        account.classifyUnclassified(300e18, true, false, bytes32("wire"));
        assertEq(account.unclassifiedBalance(), 0);
        assertEq(account.totalIncome(), 300e18);
        assertEq(account.pendingRepayment(), 90e18);
        assertEq(account.paymentCount(), 1);
        assertConserved();
    }

    function test_classifyUnclassifiedAsCapital() public {
        fund(customer, 300e18);
        vm.prank(customer);
        token.transfer(address(account), 300e18);
        vm.prank(owner);
        account.classifyUnclassified(100e18, false, true, 0);
        assertEq(account.pendingRepayment(), 100e18);
        assertEq(account.totalCapital(), 100e18);
        assertEq(account.totalIncome(), 0);
        assertEq(account.unclassifiedBalance(), 200e18);
    }

    function test_cannotClassifyMoreThanUnclassified() public {
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.InsufficientUnclassified.selector, 0, 1));
        vm.prank(owner);
        account.classifyUnclassified(1, true, false, 0);
    }

    function test_depositCapital() public {
        fund(owner, 200e18);
        vm.startPrank(owner);
        token.approve(address(account), 200e18);
        account.depositCapital(200e18, true);
        vm.stopPrank();
        assertEq(account.pendingRepayment(), 200e18);
        assertEq(account.totalCapital(), 200e18);
        assertEq(account.totalIncome(), 0);
    }

    function test_payRequiresApproval() public {
        fund(customer, 100e18);
        vm.prank(customer);
        vm.expectRevert();
        account.pay(100e18, 0);
    }

    function test_payZeroReverts() public {
        vm.expectRevert(RePayAccount.ZeroAmount.selector);
        account.pay(0, 0);
    }

    function test_policyChangeIsProspective() public {
        payAs(customer, 1000e18); // 300 pending at 30%
        RePayAccount.Policy memory p = defaultPolicy();
        p.repaymentBps = 5000;
        setPolicy(p);
        assertEq(account.pendingRepayment(), 300e18, "existing allocation unchanged");
        payAs(makeAddr("c2"), 1000e18);
        assertEq(account.pendingRepayment(), 800e18);
    }

    function test_releasePendingReducesAllocation() public {
        payAs(customer, 1000e18);
        vm.prank(owner);
        account.releasePending(100e18);
        assertEq(account.pendingRepayment(), 200e18);
        assertEq(account.totalReleased(), 100e18);
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.InsufficientPending.selector, 200e18, 201e18));
        vm.prank(owner);
        account.releasePending(201e18);
        assertConserved();
    }

    function test_withdrawOperatingCannotTouchPending() public {
        payAs(customer, 1000e18);
        uint256 op = account.operatingCash();
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.InsufficientOperatingCash.selector, op, op + 1));
        vm.prank(owner);
        account.withdrawOperating(owner, op + 1);
        vm.prank(owner);
        account.withdrawOperating(owner, op);
        assertEq(token.balanceOf(owner), op);
        assertEq(account.pendingRepayment(), 300e18);
        assertEq(account.totalWithdrawn(), op);
        assertConserved();
    }
}

contract PermitTest is BaseTest {
    uint256 internal payerKey = 0xA11CE;
    address internal payer;

    function setUp() public override {
        super.setUp();
        openLoan();
        payer = vm.addr(payerKey);
        fund(payer, 1000e18);
    }

    function _sign(uint256 amount, uint256 deadline, uint256 nonce) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 typehash =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(typehash, payer, address(account), amount, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(payerKey, digest);
    }

    function test_payWithPermit() public {
        (uint8 v, bytes32 r, bytes32 s) = _sign(400e18, block.timestamp + 1 hours, 0);
        vm.prank(payer);
        account.payWithPermit(400e18, bytes32("INV-9"), block.timestamp + 1 hours, v, r, s);
        assertEq(account.totalIncome(), 400e18);
        assertEq(token.allowance(payer, address(account)), 0, "exact-amount permit consumed");
    }

    function test_permitReplayDoesNotDoublePay() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(400e18, deadline, 0);
        vm.startPrank(payer);
        account.payWithPermit(400e18, 0, deadline, v, r, s);
        vm.expectRevert(); // permit already used and no allowance left
        account.payWithPermit(400e18, 0, deadline, v, r, s);
        vm.stopPrank();
        assertEq(account.totalIncome(), 400e18);
    }

    function test_expiredPermitReverts() public {
        uint256 deadline = block.timestamp + 1;
        (uint8 v, bytes32 r, bytes32 s) = _sign(400e18, deadline, 0);
        vm.warp(deadline + 1);
        vm.prank(payer);
        vm.expectRevert();
        account.payWithPermit(400e18, 0, deadline, v, r, s);
    }

    function test_frontrunPermitStillPays() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(400e18, deadline, 0);
        token.permit(payer, address(account), 400e18, deadline, v, r, s); // griefer submits first
        vm.prank(payer);
        account.payWithPermit(400e18, 0, deadline, v, r, s);
        assertEq(account.totalIncome(), 400e18);
    }
}

contract RepaymentTest is BaseTest {
    function setUp() public override {
        super.setUp();
        openLoan();
    }

    function _expectStatus(RePayAccount.Status st) internal {
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.RepaymentNotReady.selector, st));
    }

    function test_noActiveLoan() public {
        vm.prank(owner);
        RePayAccount fresh = RePayAccount(payable(factory.createAccount(defaultPolicy())));
        (, RePayAccount.Status st) = fresh.previewRepayment();
        assertEq(uint8(st), uint8(RePayAccount.Status.NoActiveLoan));
    }

    function test_repeatedExecutionDoesNotDoubleCount() public {
        payAs(customer, 500e18);
        account.executeRepayment(address(0), address(0));
        _expectStatus(RePayAccount.Status.NothingPending);
        account.executeRepayment(address(0), address(0));
        assertEq(account.totalRepaid(), 150e18);
    }

    function test_pausedBlocksAutomationButNotOwner() public {
        payAs(customer, 500e18);
        vm.prank(owner);
        account.setPaused(true);
        _expectStatus(RePayAccount.Status.Paused);
        account.executeRepayment(address(0), address(0));
        vm.prank(owner);
        account.ownerRepay(150e18, true, address(0), address(0));
        assertEq(account.pendingRepayment(), 0);
        vm.prank(owner);
        account.setPaused(false);
        assertFalse(account.policy().paused);
    }

    function test_cooldownBlocksSecondExecution_concurrentKeepers() public {
        RePayAccount.Policy memory p = defaultPolicy();
        p.cooldown = 1 hours;
        setPolicy(p);
        payAs(customer, 500e18);
        vm.prank(keeper);
        account.executeRepayment(address(0), address(0));
        payAs(makeAddr("c2"), 500e18);
        // second keeper in same window
        _expectStatus(RePayAccount.Status.Cooldown);
        vm.prank(makeAddr("keeper2"));
        account.executeRepayment(address(0), address(0));
        vm.warp(block.timestamp + 1 hours);
        vm.prank(makeAddr("keeper2"));
        assertEq(account.executeRepayment(address(0), address(0)), 150e18);
    }

    function test_sameBlockRaceWithoutCooldown_secondFindsNothing() public {
        payAs(customer, 500e18);
        vm.prank(keeper);
        account.executeRepayment(address(0), address(0));
        _expectStatus(RePayAccount.Status.NothingPending);
        vm.prank(makeAddr("keeper2"));
        account.executeRepayment(address(0), address(0));
    }

    function test_reserveBlocksExecution() public {
        RePayAccount.Policy memory p = defaultPolicy();
        p.operatingReserve = 3000e18;
        setPolicy(p);
        payAs(customer, 500e18); // operating = 2400 + 350 = 2750 < 3000
        _expectStatus(RePayAccount.Status.ReserveShortfall);
        account.executeRepayment(address(0), address(0));
        assertEq(account.pendingRepayment(), 150e18, "blocked allocation stays pending");
        payAs(makeAddr("c2"), 500e18); // operating 3100
        assertEq(account.executeRepayment(address(0), address(0)), 300e18);
    }

    function test_minAndMaxExecution() public {
        RePayAccount.Policy memory p = defaultPolicy();
        p.minExecution = 200e18;
        p.maxExecution = 250e18;
        setPolicy(p);
        payAs(customer, 500e18); // 150 pending
        _expectStatus(RePayAccount.Status.BelowMinExecution);
        account.executeRepayment(address(0), address(0));
        payAs(makeAddr("c2"), 1000e18); // 450 pending
        assertEq(account.executeRepayment(address(0), address(0)), 250e18);
        assertEq(account.pendingRepayment(), 200e18);
    }

    function test_invalidPolicyMaxBelowMin() public {
        RePayAccount.Policy memory p = defaultPolicy();
        p.minExecution = 200e18;
        p.maxExecution = 100e18;
        vm.expectRevert(RePayAccount.InvalidPolicy.selector);
        vm.prank(owner);
        account.setPolicy(p);
        p.maxExecution = 0;
        p.cooldown = 31 days;
        vm.expectRevert(RePayAccount.InvalidPolicy.selector);
        vm.prank(owner);
        account.setPolicy(p);
    }

    function test_minimumDebtBoundaryCapsRepayment() public {
        // total debt 2602.4, floor = 200 + 1800 -> max repayable 602.4
        (,,, uint256 maxRepayable) = account.loanState();
        assertEq(maxRepayable, 602.4e18);
        RePayAccount.Policy memory p = defaultPolicy();
        p.repaymentBps = 10_000;
        setPolicy(p);
        payAs(customer, 1000e18);
        uint256 repaid = account.executeRepayment(address(0), address(0));
        assertEq(repaid, 602.4e18, "capped at protocol headroom");
        assertEq(account.pendingRepayment(), 1000e18 - 602.4e18, "remainder preserved");
        _expectStatus(RePayAccount.Status.AtMinimumDebt);
        account.executeRepayment(address(0), address(0));
        // net debt now exactly minNetDebt
        assertEq(mezo.totalDebt(address(account)), 2000e18);
    }

    function test_headroomBelowMinExecutionReportsMinimumDebt() public {
        RePayAccount.Policy memory p = defaultPolicy();
        p.repaymentBps = 10_000;
        p.minExecution = 700e18;
        setPolicy(p);
        payAs(customer, 1000e18);
        (, RePayAccount.Status st) = account.previewRepayment();
        assertEq(uint8(st), uint8(RePayAccount.Status.AtMinimumDebt));
    }

    function test_interestAccruesBetweenPreviewAndExecution() public {
        RePayAccount.Policy memory p = defaultPolicy();
        p.repaymentBps = 10_000;
        setPolicy(p);
        payAs(customer, 2000e18);
        (uint256 previewAmount,) = account.previewRepayment();
        vm.warp(block.timestamp + 180 days); // interest raises debt -> more headroom
        uint256 repaid = account.executeRepayment(address(0), address(0));
        assertGt(repaid, previewAmount, "execution uses current debt");
        assertEq(mezo.totalDebt(address(account)), 2000e18, "lands exactly on floor");
    }

    function test_ownerRepayRespectsProtocolFloor() public {
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.ExceedsRepayableDebt.selector, 602.4e18, 700e18));
        vm.prank(owner);
        account.ownerRepay(700e18, false, address(0), address(0));
        vm.prank(owner);
        account.ownerRepay(600e18, false, address(0), address(0));
        assertEq(account.operatingCash(), BORROW - 600e18);
        assertEq(account.totalRepaid(), 600e18);
    }

    function test_failedRepayRollsBackAccounting() public {
        payAs(customer, 500e18);
        mezo.setFailRepay(true);
        vm.expectRevert("MockMezo: forced failure");
        account.executeRepayment(address(0), address(0));
        assertEq(account.pendingRepayment(), 150e18);
        assertEq(account.totalRepaid(), 0);
        assertEq(account.lastExecutionAt(), 0);
    }

    function test_unexpectedBurnReverts() public {
        payAs(customer, 500e18);
        mezo.setExtraBurn(1);
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.UnexpectedBurn.selector, 150e18, 150e18 + 1));
        account.executeRepayment(address(0), address(0));
    }

    function test_reentrancyBlocked() public {
        payAs(customer, 1000e18);
        mezo.setReenter(address(account), abi.encodeCall(RePayAccount.executeRepayment, (address(0), address(0))));
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        account.executeRepayment(address(0), address(0));
    }

    function test_ownerWithdrawBetweenPreviewAndExecution() public {
        RePayAccount.Policy memory p = defaultPolicy();
        p.operatingReserve = 1000e18;
        setPolicy(p);
        payAs(customer, 500e18);
        (, RePayAccount.Status st) = account.previewRepayment();
        assertEq(uint8(st), uint8(RePayAccount.Status.Ready));
        vm.prank(owner);
        account.withdrawOperating(owner, 2000e18); // operating drops to 750
        _expectStatus(RePayAccount.Status.ReserveShortfall);
        account.executeRepayment(address(0), address(0));
    }
}

contract LoanLifecycleTest is BaseTest {
    function setUp() public override {
        super.setUp();
        openLoan();
    }

    function test_openLoanTwiceReverts() public {
        vm.expectRevert(RePayAccount.LoanActive.selector);
        vm.prank(owner);
        account.openLoan{value: COLL}(BORROW, address(0), address(0));
    }

    function test_fullCloseUsesPendingThenOperating() public {
        payAs(customer, 1000e18); // pending 300, operating 2400 + 700
        (, uint256 debt,,) = account.loanState();
        uint256 required = debt - 200e18; // 2402.4
        uint256 ownerBtc = owner.balance;
        vm.prank(owner);
        account.closeLoan();
        assertEq(account.pendingRepayment(), 0);
        assertEq(account.operatingCash(), 300e18 + 2400e18 + 700e18 - required);
        assertEq(account.totalRepaid(), required);
        assertEq(address(account).balance, COLL, "collateral returned to account");
        (uint8 status) = uint8(mezo.getTroveStatus(address(account)));
        assertEq(status, uint8(MockMezo.Status.closedByOwner));
        vm.prank(owner);
        account.withdrawBtc(owner, COLL);
        assertEq(owner.balance, ownerBtc + COLL);
        assertConserved();
    }

    function test_closeInsufficientFunds() public {
        vm.prank(owner);
        account.withdrawOperating(owner, 1000e18);
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.InsufficientFundsToClose.selector, 1400e18, 2402.4e18));
        vm.prank(owner);
        account.closeLoan();
    }

    function test_closeBlockedInRecoveryMode() public {
        payAs(customer, 1000e18);
        mezo.setRecoveryMode(true);
        vm.expectRevert("BorrowerOps: Operation not permitted during Recovery Mode");
        vm.prank(owner);
        account.closeLoan();
        assertEq(account.pendingRepayment(), 300e18, "rolled back");
    }

    function test_closedLoanStopsAutomation() public {
        payAs(customer, 1000e18);
        vm.prank(owner);
        account.closeLoan();
        payAs(makeAddr("c2"), 500e18);
        vm.expectRevert(abi.encodeWithSelector(RePayAccount.RepaymentNotReady.selector, RePayAccount.Status.NoActiveLoan));
        account.executeRepayment(address(0), address(0));
        vm.expectRevert(RePayAccount.LoanNotActive.selector);
        vm.prank(owner);
        account.closeLoan();
    }

    function test_reopenAfterClose() public {
        payAs(customer, 1000e18);
        vm.prank(owner);
        account.closeLoan();
        vm.prank(owner);
        account.openLoan{value: COLL}(BORROW, address(0), address(0));
        (uint8 st) = uint8(mezo.getTroveStatus(address(account)));
        assertEq(st, uint8(MockMezo.Status.active));
    }

    function test_liquidationPreservesPendingAndStopsAutomation() public {
        payAs(customer, 1000e18);
        mezo.liquidate(address(account));
        (, RePayAccount.Status st) = account.previewRepayment();
        assertEq(uint8(st), uint8(RePayAccount.Status.NoActiveLoan));
        assertEq(account.pendingRepayment(), 300e18);
        vm.prank(owner);
        account.releasePending(300e18);
        uint256 op = account.operatingCash();
        vm.prank(owner);
        account.withdrawOperating(owner, op);
        assertEq(token.balanceOf(address(account)), 0);
        assertConserved();
    }

    function test_partialRedemptionReducesDebt() public {
        (, uint256 debtBefore, uint256 collBefore,) = account.loanState();
        mezo.redeem(address(account), 300e18);
        (, uint256 debtAfter, uint256 collAfter,) = account.loanState();
        assertEq(debtAfter, debtBefore - 300e18);
        assertLt(collAfter, collBefore);
    }

    function test_fullRedemptionThenClaimSurplus() public {
        (, uint256 debt,,) = account.loanState();
        mezo.redeem(address(account), debt - 200e18);
        assertEq(uint8(mezo.getTroveStatus(address(account))), uint8(MockMezo.Status.closedByRedemption));
        uint256 surplus = mezo.getCollateral(address(account));
        assertGt(surplus, 0);
        vm.prank(owner);
        account.claimCollateralSurplus();
        assertEq(address(account).balance, surplus);
    }

    function test_addAndWithdrawCollateral() public {
        vm.prank(owner);
        account.addCollateral{value: 0.01 ether}(address(0), address(0));
        (,, uint256 coll,) = account.loanState();
        assertEq(coll, COLL + 0.01 ether);
        address dest = makeAddr("dest");
        vm.prank(owner);
        account.withdrawCollateral(0.01 ether, dest, address(0), address(0));
        assertEq(dest.balance, 0.01 ether);
    }
}
