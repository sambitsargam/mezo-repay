// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RePayAccount} from "../src/RePayAccount.sol";
import {RePayAccountFactory} from "../src/RePayAccountFactory.sol";
import {IBorrowerOperations, ITroveManager} from "../src/interfaces/IMezo.sol";
import {MezoTestnet} from "../script/MezoTestnet.sol";

interface IHintHelpers {
    function getApproxHint(uint256 _CR, uint256 _numTrials, uint256 _inputRandomSeed)
        external
        view
        returns (address hintAddress, uint256 diff, uint256 latestRandomSeed);
}

interface ISortedTroves {
    function findInsertPosition(uint256 _NICR, address _prevId, address _nextId)
        external
        view
        returns (address, address);
}

/// @notice Runs the RePay flow against the REAL Mezo testnet contracts on a local fork.
///         Enable with: MEZO_FORK=1 forge test --match-contract MezoForkTest
///         This is a fork simulation, not live evidence; live evidence is in docs/EVIDENCE.md.
contract MezoForkTest is Test {
    RePayAccountFactory internal factory;
    RePayAccount internal account;
    IERC20 internal musd = IERC20(MezoTestnet.MUSD);
    ITroveManager internal tm = ITroveManager(MezoTestnet.TROVE_MANAGER);
    IBorrowerOperations internal bo = IBorrowerOperations(MezoTestnet.BORROWER_OPERATIONS);

    address internal owner = makeAddr("forkOwner");
    address internal customer = makeAddr("forkCustomer");
    bool internal enabled;

    function setUp() public {
        enabled = vm.envOr("MEZO_FORK", false);
        if (!enabled) return;
        vm.createSelectFork(vm.envOr("MEZO_RPC_URL", string("https://rpc.test.mezo.org")));
        assertEq(block.chainid, 31611, "not Mezo testnet");
        _mockOraclePrecompile();
        factory = new RePayAccountFactory(
            MezoTestnet.BORROWER_OPERATIONS, MezoTestnet.TROVE_MANAGER, MezoTestnet.COLL_SURPLUS_POOL
        );
        RePayAccount.Policy memory p;
        p.repaymentBps = 3000;
        vm.prank(owner);
        account = RePayAccount(payable(factory.createAccount(p)));
        vm.deal(owner, 1 ether);
        vm.deal(customer, 1 ether);
    }

    /// @dev SUBSTITUTED COMPONENT: Mezo's BTC price oracle is a chain precompile
    ///      (0x7b7c...0015) that a local fork cannot execute (EvmError: NotActivated). We mock only
    ///      its Chainlink-style interface with a fresh round at a realistic price (live value was
    ///      ~80,595 at research time; override with MEZO_FORK_BTC_PRICE). Everything else
    ///      (BorrowerOperations, TroveManager, SortedTroves, MUSD) is the real deployed bytecode.
    function _mockOraclePrecompile() internal {
        address oracle = 0x7b7c000000000000000000000000000000000015;
        int256 price = int256(vm.envOr("MEZO_FORK_BTC_PRICE", uint256(80_000e18)));
        vm.mockCall(oracle, abi.encodeWithSignature("decimals()"), abi.encode(uint8(18)));
        vm.mockCall(
            oracle,
            abi.encodeWithSignature("latestRoundData()"),
            abi.encode(uint80(1), price, block.timestamp, block.timestamp, uint80(1))
        );
    }

    function _hints(uint256 coll, uint256 debt) internal view returns (address upper, address lower) {
        uint256 nicr = (coll * 1e20) / debt;
        (address approx,,) = IHintHelpers(MezoTestnet.HINT_HELPERS).getApproxHint(nicr, 15, 42);
        (upper, lower) = ISortedTroves(MezoTestnet.SORTED_TROVES).findInsertPosition(nicr, approx, approx);
    }

    function test_fork_fullFlow() public {
        if (!enabled) {
            vm.skip(true);
            return;
        }
        assertEq(address(account.musd()), bo.musd());
        uint256 borrowAmt = 2400e18;
        uint256 coll = 0.08 ether;
        uint256 expectedDebt = borrowAmt + bo.getBorrowingFee(borrowAmt) + tm.MUSD_GAS_COMPENSATION();
        (address u, address l) = _hints(coll, expectedDebt);

        vm.prank(owner);
        account.openLoan{value: coll}(borrowAmt, u, l);
        (ITroveManager.Status st, uint256 debt, uint256 c, uint256 maxRepayable) = account.loanState();
        assertEq(uint8(st), 1);
        assertEq(c, coll);
        assertEq(account.operatingCash(), borrowAmt);
        console2.log("debt after open", debt);
        console2.log("max repayable", maxRepayable);

        // Customer gets MUSD by opening their own trove, then pays the account.
        vm.startPrank(customer);
        (u, l) = _hints(0.08 ether, expectedDebt);
        bo.openTrove{value: 0.08 ether}(2000e18, u, l);
        musd.approve(address(account), 500e18);
        account.pay(500e18, bytes32("INV-FORK"));
        vm.stopPrank();
        assertEq(account.pendingRepayment(), 150e18);

        vm.warp(block.timestamp + 60);
        _mockOraclePrecompile(); // keep the mocked round fresh after warping
        uint256 repaid = account.executeRepayment(address(0), address(0));
        assertEq(repaid, 150e18);
        (, uint256 debtAfter,,) = account.loanState();
        console2.log("debt after repay", debtAfter);
        assertLt(debtAfter, debt);

        vm.expectRevert(RePayAccount.NotOwner.selector);
        account.withdrawOperating(customer, 1);

        vm.prank(owner);
        account.closeLoan();
        assertEq(uint8(tm.getTroveStatus(address(account))), 2);
        assertEq(address(account).balance, coll);
    }
}
