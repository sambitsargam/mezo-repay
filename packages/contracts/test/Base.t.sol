// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {RePayAccount} from "../src/RePayAccount.sol";
import {RePayAccountFactory} from "../src/RePayAccountFactory.sol";
import {MockMezo, MockMUSD} from "./mocks/MockMezo.sol";

abstract contract BaseTest is Test {
    MockMUSD internal token;
    MockMezo internal mezo;
    RePayAccountFactory internal factory;
    RePayAccount internal account;

    address internal owner = makeAddr("owner");
    address internal customer = makeAddr("customer");
    address internal keeper = makeAddr("keeper");
    address internal attacker = makeAddr("attacker");

    uint256 internal constant BORROW = 2400e18; // net debt 2402.4, total 2602.4
    uint256 internal constant COLL = 0.065 ether;

    function setUp() public virtual {
        token = new MockMUSD();
        mezo = new MockMezo(token);
        token.setMinter(address(mezo));
        factory = new RePayAccountFactory(address(mezo), address(mezo), address(mezo));
        vm.prank(owner);
        account = RePayAccount(payable(factory.createAccount(defaultPolicy())));
        vm.deal(owner, 10 ether);
    }

    function defaultPolicy() internal pure returns (RePayAccount.Policy memory p) {
        p.repaymentBps = 3000;
        p.cooldown = 0;
        p.paused = false;
        p.operatingReserve = 0;
        p.minExecution = 0;
        p.maxExecution = 0;
    }

    function openLoan() internal {
        vm.prank(owner);
        account.openLoan{value: COLL}(BORROW, address(0), address(0));
    }

    /// @dev Give `who` MUSD from outside the account (a separate trove opened by a funder).
    function fund(address who, uint256 amount) internal {
        address funder = makeAddr(string.concat("funder", vm.toString(who)));
        uint256 coll = (amount * 3 * 1e18) / mezo.price() + 1 ether;
        vm.deal(funder, coll);
        vm.startPrank(funder);
        uint256 debt = amount < 2000e18 ? 2000e18 : amount;
        mezo.openTrove{value: coll}(debt, address(0), address(0));
        token.transfer(who, amount);
        vm.stopPrank();
    }

    function payAs(address payer, uint256 amount) internal returns (uint256 id) {
        fund(payer, amount);
        vm.startPrank(payer);
        token.approve(address(account), amount);
        id = account.pay(amount, bytes32("INV-1"));
        vm.stopPrank();
    }

    function setPolicy(RePayAccount.Policy memory p) internal {
        vm.prank(owner);
        account.setPolicy(p);
    }

    function assertConserved() internal view {
        assertGe(
            token.balanceOf(address(account)),
            account.pendingRepayment() + account.operatingCash(),
            "tracked buckets exceed balance"
        );
        assertEq(
            token.balanceOf(address(account)),
            account.pendingRepayment() + account.operatingCash() + account.unclassifiedBalance(),
            "balance decomposition"
        );
    }
}
