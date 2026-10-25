// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Test-only MUSD: OpenZeppelin ERC20Permit (same base as Mezo MUSD) with a burn hook for
///         the mock BorrowerOperations.
contract MockMUSD is ERC20Permit {
    address public minter;

    constructor() ERC20("Mezo USD", "MUSD") ERC20Permit("Mezo USD") {
        minter = msg.sender;
    }

    function setMinter(address m) external {
        require(msg.sender == minter, "only minter");
        minter = m;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "only minter");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == minter, "only minter");
        _burn(from, amount);
    }
}

/// @notice Test-only stand-in for Mezo BorrowerOperations + TroveManager + CollSurplusPool.
/// @dev Mirrors the behaviors RePay depends on, as read from mezo-org/musd BorrowerOperations.sol:
///      minNetDebt, 200 MUSD gas compensation, 0.1% borrowing fee, simple interest on principal,
///      interest-first repayment, close burning (debt - gasComp), native BTC collateral, liquidation,
///      redemption, surplus claims, and recovery-mode close restriction. Used ONLY for controlled edge
///      cases; live compatibility is proven separately against Mezo testnet.
contract MockMezo {
    enum Status {
        nonExistent,
        active,
        closedByOwner,
        closedByLiquidation,
        closedByRedemption
    }

    struct Trove {
        Status status;
        uint256 coll;
        uint256 principal;
        uint256 interest;
        uint64 lastUpdate;
    }

    uint256 public constant MUSD_GAS_COMPENSATION = 200e18;
    uint256 public constant MCR = 1.1e18;
    uint16 public constant INTEREST_RATE_BPS = 100;

    MockMUSD public immutable token;
    uint256 public minNetDebt = 1800e18;
    uint256 public price = 80_000e18;
    bool public recoveryMode;
    bool public failRepay;
    uint256 public extraBurn;
    address public reenterTarget;
    bytes public reenterData;

    mapping(address => Trove) public troves;
    mapping(address => uint256) public surplus;

    constructor(MockMUSD _token) {
        token = _token;
    }

    receive() external payable {}

    // --- test controls ---
    function setPrice(uint256 p) external {
        price = p;
    }

    function setMinNetDebt(uint256 m) external {
        minNetDebt = m;
    }

    function setRecoveryMode(bool r) external {
        recoveryMode = r;
    }

    function setFailRepay(bool f) external {
        failRepay = f;
    }

    function setExtraBurn(uint256 e) external {
        extraBurn = e;
    }

    function setReenter(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterData = data;
    }

    // --- views (TroveManager / BorrowerOperations / CollSurplusPool) ---
    function musd() external view returns (address) {
        return address(token);
    }

    function getBorrowingFee(uint256 debt) public pure returns (uint256) {
        return debt / 1000;
    }

    function getTroveStatus(address b) external view returns (Status) {
        return troves[b].status;
    }

    function getEntireDebtAndColl(address b)
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        Trove storage t = troves[b];
        return (t.coll, t.principal, t.interest + _accrued(t), 0, 0, 0);
    }

    function getCollateral(address b) external view returns (uint256) {
        return surplus[b];
    }

    function totalDebt(address b) public view returns (uint256) {
        Trove storage t = troves[b];
        return t.principal + t.interest + _accrued(t);
    }

    function _accrued(Trove storage t) internal view returns (uint256) {
        if (t.status != Status.active) return 0;
        return (t.principal * INTEREST_RATE_BPS * (block.timestamp - t.lastUpdate)) / (10_000 * 365 days);
    }

    function _accrue(Trove storage t) internal {
        t.interest += _accrued(t);
        t.lastUpdate = uint64(block.timestamp);
    }

    function _icr(uint256 coll, uint256 debt) internal view returns (uint256) {
        return (coll * price) / debt;
    }

    // --- borrower operations ---
    function openTrove(uint256 debtAmount, address, address) external payable {
        Trove storage t = troves[msg.sender];
        require(t.status != Status.active, "BorrowerOps: Trove is active");
        uint256 fee = recoveryMode ? 0 : getBorrowingFee(debtAmount);
        uint256 net = debtAmount + fee;
        require(net >= minNetDebt, "BorrowerOps: Trove's net debt must be greater than minimum");
        uint256 composite = net + MUSD_GAS_COMPENSATION;
        require(_icr(msg.value, composite) >= MCR, "BorrowerOps: An operation that would result in ICR < MCR is not permitted");
        troves[msg.sender] = Trove(Status.active, msg.value, composite, 0, uint64(block.timestamp));
        token.mint(msg.sender, debtAmount);
        token.mint(address(this), MUSD_GAS_COMPENSATION);
    }

    function addColl(address, address) external payable {
        Trove storage t = troves[msg.sender];
        require(t.status == Status.active, "BorrowerOps: Trove does not exist or is closed");
        _accrue(t);
        t.coll += msg.value;
    }

    function withdrawColl(uint256 amount, address, address) external {
        Trove storage t = troves[msg.sender];
        require(t.status == Status.active, "BorrowerOps: Trove does not exist or is closed");
        require(!recoveryMode, "BorrowerOps: Collateral withdrawal not permitted Recovery Mode");
        _accrue(t);
        t.coll -= amount;
        require(_icr(t.coll, t.principal + t.interest) >= MCR, "BorrowerOps: ICR < MCR");
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "Sending BTC failed");
    }

    function withdrawMUSD(uint256 amount, address, address) external {
        Trove storage t = troves[msg.sender];
        require(t.status == Status.active, "BorrowerOps: Trove does not exist or is closed");
        _accrue(t);
        uint256 fee = recoveryMode ? 0 : getBorrowingFee(amount);
        t.principal += amount + fee;
        require(_icr(t.coll, t.principal + t.interest) >= MCR, "BorrowerOps: ICR < MCR");
        token.mint(msg.sender, amount);
    }

    function repayMUSD(uint256 amount, address, address) external {
        require(!failRepay, "MockMezo: forced failure");
        Trove storage t = troves[msg.sender];
        require(t.status == Status.active, "BorrowerOps: Trove does not exist or is closed");
        require(amount > 0, "BorrowerOps: There must be either a collateral change or a debt change");
        _accrue(t);
        uint256 debt = t.principal + t.interest;
        require(
            (debt - MUSD_GAS_COMPENSATION) - amount >= minNetDebt,
            "BorrowerOps: Trove's net debt must be greater than minimum"
        );
        require(amount <= debt - MUSD_GAS_COMPENSATION, "BorrowerOps: Amount repaid must not be larger than the Trove's debt");
        require(token.balanceOf(msg.sender) >= amount, "BorrowerOps: Caller doesnt have enough mUSD to make repayment");
        if (amount >= t.interest) {
            t.principal -= amount - t.interest;
            t.interest = 0;
        } else {
            t.interest -= amount;
        }
        token.burn(msg.sender, amount + extraBurn);
        if (reenterTarget != address(0)) {
            (bool ok, bytes memory ret) = reenterTarget.call(reenterData);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }

    function closeTrove() external {
        Trove storage t = troves[msg.sender];
        require(t.status == Status.active, "BorrowerOps: Trove does not exist or is closed");
        require(!recoveryMode, "BorrowerOps: Operation not permitted during Recovery Mode");
        _accrue(t);
        uint256 debt = t.principal + t.interest;
        require(
            token.balanceOf(msg.sender) >= debt - MUSD_GAS_COMPENSATION,
            "BorrowerOps: Caller doesnt have enough mUSD to make repayment"
        );
        uint256 coll = t.coll;
        delete troves[msg.sender];
        troves[msg.sender].status = Status.closedByOwner;
        token.burn(msg.sender, debt - MUSD_GAS_COMPENSATION);
        token.burn(address(this), MUSD_GAS_COMPENSATION);
        (bool ok,) = msg.sender.call{value: coll}("");
        require(ok, "Sending BTC failed");
    }

    function claimCollateral() external {
        uint256 amt = surplus[msg.sender];
        require(amt > 0, "CollSurplusPool: No collateral available to claim");
        surplus[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amt}("");
        require(ok, "Sending BTC failed");
    }

    // --- external protocol events (test helpers) ---
    function liquidate(address b) external {
        Trove storage t = troves[b];
        require(t.status == Status.active, "not active");
        delete troves[b];
        troves[b].status = Status.closedByLiquidation;
    }

    /// @dev Redeem `amount` of debt against `b` at current price. If remaining net debt hits zero the
    ///      trove is closed by redemption and leftover collateral becomes claimable surplus.
    function redeem(address b, uint256 amount) external {
        Trove storage t = troves[b];
        require(t.status == Status.active, "not active");
        _accrue(t);
        uint256 debt = t.principal + t.interest;
        uint256 net = debt - MUSD_GAS_COMPENSATION;
        require(amount <= net, "too much");
        uint256 collOut = (amount * 1e18) / price;
        t.coll -= collOut;
        if (amount >= t.interest) {
            t.principal -= amount - t.interest;
            t.interest = 0;
        } else {
            t.interest -= amount;
        }
        if (amount == net) {
            surplus[b] += t.coll;
            delete troves[b];
            troves[b].status = Status.closedByRedemption;
        }
    }
}
