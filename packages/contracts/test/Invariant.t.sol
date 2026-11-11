// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {BaseTest} from "./Base.t.sol";
import {RePayAccount} from "../src/RePayAccount.sol";
import {MockMezo, MockMUSD} from "./mocks/MockMezo.sol";

contract Handler is Test {
    RePayAccount internal account;
    MockMUSD internal token;
    MockMezo internal mezo;
    address internal owner;
    address internal payer;
    address internal stranger = makeAddr("stranger");

    // ghost accounting
    uint256 public ghostIncome;
    uint256 public ghostPaid;
    uint256 public ghostRepaid;
    uint256 public ghostWithdrawn;
    uint256 public ghostDirect;
    uint256 public ghostKeeperGain;
    uint256 public ghostBufferFunded;
    uint256 public ghostTopUp;
    uint256 public ghostBufferWithdrawn;

    constructor(RePayAccount a, MockMUSD t, MockMezo m, address o, address p) {
        account = a;
        token = t;
        mezo = m;
        owner = o;
        payer = p;
    }

    function pay(uint256 amount) external {
        amount = bound(amount, 1, token.balanceOf(payer) / 4 + 1);
        if (amount > token.balanceOf(payer)) return;
        vm.startPrank(payer);
        token.approve(address(account), amount);
        account.pay(amount, bytes32(0));
        vm.stopPrank();
        ghostIncome += amount;
        ghostPaid += amount;
    }

    function directTransfer(uint256 amount) external {
        amount = bound(amount, 1, token.balanceOf(payer) / 10 + 1);
        if (amount > token.balanceOf(payer)) return;
        vm.prank(payer);
        token.transfer(address(account), amount);
        ghostDirect += amount;
    }

    function keeperExecute(uint256 warp) external {
        vm.warp(block.timestamp + bound(warp, 0, 10 days));
        (, RePayAccount.Status st) = account.previewRepayment();
        if (st != RePayAccount.Status.Ready) return;
        uint256 before = token.balanceOf(stranger);
        vm.prank(stranger);
        ghostRepaid += account.executeRepayment(address(0), address(0));
        ghostKeeperGain += token.balanceOf(stranger) - before;
    }

    function withdrawOperating(uint256 amount) external {
        uint256 op = account.operatingCash();
        if (op == 0) return;
        amount = bound(amount, 1, op);
        vm.prank(owner);
        account.withdrawOperating(owner, amount);
        ghostWithdrawn += amount;
    }

    function releasePending(uint256 amount) external {
        uint256 p = account.pendingRepayment();
        if (p == 0) return;
        amount = bound(amount, 1, p);
        vm.prank(owner);
        account.releasePending(amount);
    }

    function classify(uint256 amount, bool asRevenue, bool toRepayment) external {
        uint256 u = account.unclassifiedBalance();
        if (u == 0) return;
        amount = bound(amount, 1, u);
        vm.prank(owner);
        account.classifyUnclassified(amount, asRevenue, toRepayment, bytes32(0));
        if (asRevenue) ghostIncome += amount;
    }

    function changePolicy(uint16 bps, uint256 reserve, uint256 minE, uint256 maxE, uint32 cooldown, bool paused)
        external
    {
        RePayAccount.Policy memory p;
        p.repaymentBps = uint16(bound(bps, 0, 10_000));
        p.operatingReserve = bound(reserve, 0, 5000e18);
        p.minExecution = bound(minE, 0, 500e18);
        p.maxExecution = maxE % 2 == 0 ? 0 : bound(maxE, p.minExecution, 2000e18);
        p.cooldown = uint32(bound(cooldown, 0, 1 days));
        p.paused = paused;
        vm.prank(owner);
        account.setPolicy(p);
    }

    function fundBuffer(uint256 amount) external {
        amount = bound(amount, 1, 0.05 ether);
        vm.deal(owner, owner.balance + amount);
        vm.prank(owner);
        account.fundBuffer{value: amount}();
        ghostBufferFunded += amount;
    }

    function withdrawBuffer(uint256 amount) external {
        uint256 b = account.collateralBuffer();
        if (b == 0) return;
        amount = bound(amount, 1, b);
        vm.prank(owner);
        account.withdrawBuffer(owner, amount);
        ghostBufferWithdrawn += amount;
    }

    function setGuard(uint64 trigger, uint64 target) external {
        trigger = uint64(bound(trigger, 1.11e18, 3e18));
        target = uint64(bound(target, trigger, 4e18));
        vm.prank(owner);
        account.setGuard(RePayAccount.Guard(trigger, target));
    }

    function movePrice(uint256 price) external {
        mezo.setPrice(bound(price, 40_000e18, 120_000e18));
    }

    function keeperProtect() external {
        (,,, RePayAccount.GuardStatus st) = account.guardPreview();
        if (st != RePayAccount.GuardStatus.Protectable) return;
        uint256 before = token.balanceOf(stranger);
        uint256 btcBefore = stranger.balance;
        vm.prank(stranger);
        (uint256 repaid, uint256 added) = account.protect(address(0), address(0));
        ghostRepaid += repaid;
        ghostTopUp += added;
        ghostKeeperGain += token.balanceOf(stranger) - before + (stranger.balance - btcBefore);
    }

    function attackerTriesOwnerActions(uint256 amount) external {
        vm.startPrank(stranger);
        try account.withdrawOperating(stranger, amount) {
            revert("stranger withdrew");
        } catch {}
        try account.releasePending(amount) {
            revert("stranger released");
        } catch {}
        try account.borrow(amount + 1, address(0), address(0)) {
            revert("stranger borrowed");
        } catch {}
        try account.withdrawBuffer(stranger, amount) {
            revert("stranger took buffer");
        } catch {}
        try account.setGuard(RePayAccount.Guard(0, 0)) {
            revert("stranger changed guard");
        } catch {}
        vm.stopPrank();
    }
}

contract InvariantTest is BaseTest {
    Handler internal handler;
    address internal payer = makeAddr("bigPayer");

    function setUp() public override {
        super.setUp();
        openLoan();
        fund(payer, 200_000e18);
        handler = new Handler(account, token, mezo, owner, payer);
        targetContract(address(handler));
    }

    /// balance == pending + operating + unclassified, and tracked buckets never exceed balance.
    function invariant_conservation() public view {
        assertConserved();
    }

    /// Every MUSD that entered as tracked income is either still pending, was repaid, became operating
    /// cash, or was released. Allocation never exceeds income.
    function invariant_allocationBoundedByIncome() public view {
        assertLe(account.totalAllocated(), account.totalIncome());
        assertEq(account.totalIncome(), handler.ghostIncome());
    }

    /// Automated repayments never exceed what was ever allocated to repayment.
    function invariant_repaidBoundedByAllocations() public view {
        assertLe(handler.ghostRepaid(), account.totalAllocated() + account.totalCapital());
        assertEq(account.totalRepaid(), handler.ghostRepaid());
    }

    /// Keepers never receive funds.
    function invariant_keeperNeverPaid() public view {
        assertEq(handler.ghostKeeperGain(), 0);
    }

    /// Net debt never drops below the protocol floor while the loan is active.
    function invariant_debtAboveFloor() public view {
        (,uint256 debt,,) = account.loanState();
        assertGe(debt, 2000e18);
    }

    /// The guard buffer is always backed by BTC held by the account and matches its flows.
    function invariant_bufferBacked() public view {
        assertLe(account.collateralBuffer(), address(account).balance);
        assertEq(
            account.collateralBuffer(), handler.ghostBufferFunded() - handler.ghostTopUp() - handler.ghostBufferWithdrawn()
        );
        assertEq(account.totalProtectTopUp(), handler.ghostTopUp());
    }

    /// Full MUSD flow: balance = borrowed + paid + direct - repaid - withdrawn.
    function invariant_flowBalance() public view {
        assertEq(
            token.balanceOf(address(account)),
            account.totalBorrowed() + handler.ghostPaid() + handler.ghostDirect() - handler.ghostRepaid()
                - handler.ghostWithdrawn()
        );
    }
}
