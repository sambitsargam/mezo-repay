// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IBorrowerOperations, ITroveManager, ICollSurplusPool, IPriceFeed} from "./interfaces/IMezo.sol";

/// @title RePayAccount
/// @notice Owner-controlled account that owns a Mezo MUSD Trove and routes a configured share of
///         tracked customer income toward repaying it.
///
/// Accounting (all MUSD, integer base units):
///   balanceOf(this) = pendingRepayment + operatingCash + unclassified
///   - pendingRepayment: income allocated to repayment, not yet repaid.
///   - operatingCash:    the owner's spendable MUSD (income remainder, borrow proceeds, capital).
///   - unclassified:     direct ERC-20 transfers nobody has classified yet. Never counted as income.
///
/// Authority:
///   - Owner (fixed at creation): every policy, loan, and withdrawal action.
///   - Anyone (keeper): `executeRepayment` and `protect`. They can only burn this account's own
///     pending allocation against this account's own Trove (and, for `protect`, move the owner's
///     BTC collateral buffer into the same Trove), within the owner's settings, and pay no fee.
///
/// Collateral guard (v2):
///   When the Trove's collateral ratio falls below the owner's trigger, `protect` first steers pending
///   MUSD into repayment (ignoring cadence limits, never operating cash), then tops up collateral from
///   the owner-funded BTC buffer, aiming for the owner's target ratio.
contract RePayAccount is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint32 public constant MAX_COOLDOWN = 30 days;
    string public constant VERSION = "2";
    /// @dev Mezo's minimum collateral ratio (110%). A guard trigger must sit above it.
    uint256 public constant MEZO_MCR = 1.1e18;
    uint256 public constant MAX_GUARD_RATIO = 10e18;

    struct Policy {
        uint16 repaymentBps; // share of each tracked payment allocated to repayment
        uint32 cooldown; // minimum seconds between automated executions
        bool paused; // pauses automated execution only; owner actions still work
        uint256 operatingReserve; // automated execution waits while operatingCash < reserve
        uint256 minExecution; // smallest automated repayment worth sending (0 = any)
        uint256 maxExecution; // largest automated repayment per execution (0 = no cap)
    }

    /// @dev Why an automated repayment cannot run right now. Ordered by check priority.
    enum Status {
        Ready,
        Paused,
        NoActiveLoan,
        NothingPending,
        Cooldown,
        ReserveShortfall,
        AtMinimumDebt,
        BelowMinExecution
    }

    /// @notice Collateral guard settings. Ratios use 1e18 = 100%. trigger == 0 disables the guard.
    struct Guard {
        uint64 triggerRatio; // protect when collateral ratio is below this
        uint64 targetRatio; // aim for this ratio after protecting
    }

    enum GuardStatus {
        Disabled,
        NoActiveLoan,
        PriceUnavailable,
        Healthy,
        Protectable,
        NoResources
    }

    // --- Immutable protocol wiring (shared by every clone via the implementation bytecode) ---
    address public immutable factory;
    IBorrowerOperations public immutable borrowerOperations;
    ITroveManager public immutable troveManager;
    ICollSurplusPool public immutable collSurplusPool;
    IERC20 public immutable musd;
    IPriceFeed public immutable priceFeed;

    // --- Account state ---
    address public owner;
    Policy internal _policy;

    uint256 public pendingRepayment;
    uint256 public operatingCash;

    uint256 public totalIncome; // tracked customer payments + revenue classifications
    uint256 public totalAllocated; // portion of totalIncome sent to pendingRepayment
    uint256 public totalRepaid; // MUSD burned against the Trove (automated + owner + close)
    uint256 public totalBorrowed; // MUSD minted to this account by the Trove
    uint256 public totalCapital; // owner capital contributions
    uint256 public totalWithdrawn; // MUSD sent out by the owner
    uint256 public totalReleased; // pending allocation moved back to operating cash by the owner
    uint64 public paymentCount;
    uint64 public lastExecutionAt;

    Guard internal _guard;
    uint256 public collateralBuffer; // owner BTC reserved for guard top-ups; <= address(this).balance
    uint256 public totalProtectRepaid; // portion of totalRepaid done by the guard
    uint256 public totalProtectTopUp; // BTC moved from the buffer into the Trove by the guard

    // --- Events ---
    event Initialized(address indexed owner, Policy policy);
    event PaymentReceived(
        uint256 indexed paymentId,
        address indexed payer,
        uint256 amount,
        uint256 toRepayment,
        uint256 toOperating,
        bytes32 indexed ref
    );
    event UnclassifiedClassified(uint256 amount, bool asRevenue, bool toRepayment, bytes32 ref);
    event CapitalDeposited(address indexed from, uint256 amount, bool toRepayment);
    event PolicyUpdated(Policy policy);
    event AutomationPaused(bool paused);
    event RepaymentExecuted(
        address indexed executor,
        uint256 amount,
        uint256 debtBefore,
        uint256 debtAfter,
        bool automated,
        bool fromPending
    );
    event LoanOpened(uint256 collateral, uint256 borrowed, uint256 totalDebt);
    event LoanBorrowed(uint256 amount);
    event CollateralAdded(uint256 amount);
    event CollateralWithdrawn(address indexed to, uint256 amount);
    event LoanClosed(uint256 debtRepaid, uint256 fromPending, uint256 fromOperating, uint256 collateralReturned);
    event CollateralSurplusClaimed(uint256 amount);
    event PendingReleased(uint256 amount);
    event OperatingWithdrawn(address indexed to, uint256 amount);
    event BtcWithdrawn(address indexed to, uint256 amount);
    event GuardUpdated(Guard guard);
    event BufferFunded(uint256 amount, uint256 buffer);
    event BufferWithdrawn(address indexed to, uint256 amount, uint256 buffer);
    event CollateralProtected(
        address indexed executor, uint256 ratioBefore, uint256 ratioAfter, uint256 repaid, uint256 collateralAdded
    );

    // --- Errors ---
    error NotOwner();
    error NotFactory();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidPolicy();
    error InsufficientOperatingCash(uint256 available, uint256 requested);
    error InsufficientPending(uint256 available, uint256 requested);
    error InsufficientUnclassified(uint256 available, uint256 requested);
    error RepaymentNotReady(Status status);
    error ExceedsRepayableDebt(uint256 maxRepayable, uint256 requested);
    error LoanNotActive();
    error LoanActive();
    error InsufficientFundsToClose(uint256 available, uint256 required);
    error UnexpectedBurn(uint256 expected, uint256 actual);
    error BtcTransferFailed();
    error InvalidGuard();
    error GuardNotActionable(GuardStatus status);
    error InsufficientBuffer(uint256 available, uint256 requested);
    error InsufficientFreeBtc(uint256 available, uint256 requested);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _factory, address _borrowerOperations, address _troveManager, address _collSurplusPool) {
        if (
            _factory == address(0) || _borrowerOperations == address(0) || _troveManager == address(0)
                || _collSurplusPool == address(0)
        ) revert ZeroAddress();
        factory = _factory;
        borrowerOperations = IBorrowerOperations(_borrowerOperations);
        troveManager = ITroveManager(_troveManager);
        collSurplusPool = ICollSurplusPool(_collSurplusPool);
        address token = IBorrowerOperations(_borrowerOperations).musd();
        if (token == address(0)) revert ZeroAddress();
        musd = IERC20(token);
        address feed = IBorrowerOperations(_borrowerOperations).priceFeed();
        if (feed == address(0)) revert ZeroAddress();
        priceFeed = IPriceFeed(feed);
        _disableInitializers();
    }

    /// @notice Called once by the factory in the same transaction that creates the clone.
    function initialize(address _owner, Policy calldata policy_) external initializer {
        if (msg.sender != factory) revert NotFactory();
        if (_owner == address(0)) revert ZeroAddress();
        _validatePolicy(policy_);
        owner = _owner;
        _policy = policy_;
        emit Initialized(_owner, policy_);
    }

    /// @dev Accepts BTC returned by ActivePool (withdrawals, close) and CollSurplusPool (surplus).
    receive() external payable {}

    // =====================================================================================
    // Income
    // =====================================================================================

    /// @notice Pay this account `amount` MUSD as tracked income. Requires prior approval.
    function pay(uint256 amount, bytes32 ref) external nonReentrant returns (uint256 paymentId) {
        return _pay(msg.sender, amount, ref);
    }

    /// @notice Pay with an EIP-2612 permit signed for exactly `amount`.
    /// @dev If the permit was already consumed (e.g. front-run), payment still succeeds as long as the
    ///      allowance exists; otherwise transferFrom reverts.
    function payWithPermit(uint256 amount, bytes32 ref, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
        returns (uint256 paymentId)
    {
        try IERC20Permit(address(musd)).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        return _pay(msg.sender, amount, ref);
    }

    function _pay(address payer, uint256 amount, bytes32 ref) internal returns (uint256 paymentId) {
        if (amount == 0) revert ZeroAmount();
        uint256 received = _pull(payer, amount);
        paymentId = _recordIncome(payer, received, ref);
    }

    function _recordIncome(address payer, uint256 amount, bytes32 ref) internal returns (uint256 paymentId) {
        uint256 toRepayment = (amount * _policy.repaymentBps) / BPS;
        uint256 toOperating = amount - toRepayment;
        pendingRepayment += toRepayment;
        operatingCash += toOperating;
        totalIncome += amount;
        totalAllocated += toRepayment;
        paymentId = ++paymentCount;
        emit PaymentReceived(paymentId, payer, amount, toRepayment, toOperating, ref);
    }

    /// @notice MUSD held by the account that is neither pending repayment nor operating cash.
    function unclassifiedBalance() public view returns (uint256) {
        uint256 bal = musd.balanceOf(address(this));
        uint256 tracked = pendingRepayment + operatingCash;
        return bal > tracked ? bal - tracked : 0;
    }

    /// @notice Owner classifies a direct transfer. As revenue it follows the current allocation;
    ///         otherwise it is treated as owner capital to the chosen bucket.
    function classifyUnclassified(uint256 amount, bool asRevenue, bool toRepayment, bytes32 ref)
        external
        onlyOwner
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        uint256 available = unclassifiedBalance();
        if (amount > available) revert InsufficientUnclassified(available, amount);
        if (asRevenue) {
            _recordIncome(address(0), amount, ref);
        } else {
            _addCapital(amount, toRepayment);
        }
        emit UnclassifiedClassified(amount, asRevenue, toRepayment, ref);
    }

    /// @notice Owner contributes MUSD capital (not income) to operating cash or pending repayment.
    function depositCapital(uint256 amount, bool toRepayment) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 received = _pull(msg.sender, amount);
        _addCapital(received, toRepayment);
        emit CapitalDeposited(msg.sender, received, toRepayment);
    }

    function _addCapital(uint256 amount, bool toRepayment) internal {
        if (toRepayment) pendingRepayment += amount;
        else operatingCash += amount;
        totalCapital += amount;
    }

    function _pull(address from, uint256 amount) internal returns (uint256 received) {
        uint256 before = musd.balanceOf(address(this));
        musd.safeTransferFrom(from, address(this), amount);
        received = musd.balanceOf(address(this)) - before;
    }

    // =====================================================================================
    // Policy
    // =====================================================================================

    function policy() external view returns (Policy memory) {
        return _policy;
    }

    /// @notice Replace the policy. Applies prospectively: existing allocations are unchanged.
    function setPolicy(Policy calldata policy_) external onlyOwner {
        _validatePolicy(policy_);
        bool pauseChanged = policy_.paused != _policy.paused;
        _policy = policy_;
        emit PolicyUpdated(policy_);
        if (pauseChanged) emit AutomationPaused(policy_.paused);
    }

    function setPaused(bool paused_) external onlyOwner {
        _policy.paused = paused_;
        emit AutomationPaused(paused_);
    }

    function _validatePolicy(Policy calldata p) internal pure {
        if (p.repaymentBps > BPS) revert InvalidPolicy();
        if (p.cooldown > MAX_COOLDOWN) revert InvalidPolicy();
        if (p.maxExecution != 0 && p.maxExecution < p.minExecution) revert InvalidPolicy();
    }

    // =====================================================================================
    // Loan views
    // =====================================================================================

    /// @notice Current Trove debt including interest accrued to this block, and collateral.
    function loanState()
        public
        view
        returns (ITroveManager.Status status, uint256 totalDebt, uint256 collateral, uint256 maxRepayable)
    {
        status = troveManager.getTroveStatus(address(this));
        if (status != ITroveManager.Status.active) return (status, 0, 0, 0);
        (uint256 coll, uint256 principal, uint256 interest,,,) = troveManager.getEntireDebtAndColl(address(this));
        totalDebt = principal + interest;
        collateral = coll;
        maxRepayable = _maxRepayable(totalDebt);
    }

    /// @dev Largest partial repayment the protocol accepts: net debt must stay >= minNetDebt.
    function _maxRepayable(uint256 totalDebt) internal view returns (uint256) {
        uint256 floor = troveManager.MUSD_GAS_COMPENSATION() + borrowerOperations.minNetDebt();
        return totalDebt > floor ? totalDebt - floor : 0;
    }

    /// @notice What an automated execution would repay now, or why it is waiting.
    function previewRepayment() public view returns (uint256 amount, Status status) {
        Policy memory p = _policy;
        if (p.paused) return (0, Status.Paused);
        (ITroveManager.Status loan,, , uint256 maxRepayable) = loanState();
        if (loan != ITroveManager.Status.active) return (0, Status.NoActiveLoan);
        if (pendingRepayment == 0) return (0, Status.NothingPending);
        if (lastExecutionAt != 0 && block.timestamp < uint256(lastExecutionAt) + p.cooldown) {
            return (0, Status.Cooldown);
        }
        if (operatingCash < p.operatingReserve) return (0, Status.ReserveShortfall);
        if (maxRepayable == 0) return (0, Status.AtMinimumDebt);

        amount = pendingRepayment;
        if (p.maxExecution != 0 && amount > p.maxExecution) amount = p.maxExecution;
        bool limitedByDebt = amount > maxRepayable;
        if (limitedByDebt) amount = maxRepayable;
        if (amount < p.minExecution) {
            return (0, limitedByDebt ? Status.AtMinimumDebt : Status.BelowMinExecution);
        }
        return (amount, Status.Ready);
    }

    // =====================================================================================
    // Repayment
    // =====================================================================================

    /// @notice Permissionless: repay this account's Trove from its pending allocation, within policy.
    /// @dev Amount is computed on-chain from current state, so preview/execution drift and keeper races
    ///      are resolved here: a second caller in the same cooldown window reverts with Cooldown.
    function executeRepayment(address upperHint, address lowerHint)
        external
        nonReentrant
        returns (uint256 amount)
    {
        Status status;
        (amount, status) = previewRepayment();
        if (status != Status.Ready) revert RepaymentNotReady(status);
        pendingRepayment -= amount;
        lastExecutionAt = uint64(block.timestamp);
        _repay(amount, upperHint, lowerHint, true, true);
    }

    /// @notice Owner repays from pending or operating cash, bypassing automation limits but not the
    ///         protocol's minimum debt.
    function ownerRepay(uint256 amount, bool fromPending, address upperHint, address lowerHint)
        external
        onlyOwner
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        (ITroveManager.Status loan,,, uint256 maxRepayable) = loanState();
        if (loan != ITroveManager.Status.active) revert LoanNotActive();
        if (amount > maxRepayable) revert ExceedsRepayableDebt(maxRepayable, amount);
        if (fromPending) {
            if (amount > pendingRepayment) revert InsufficientPending(pendingRepayment, amount);
            pendingRepayment -= amount;
        } else {
            if (amount > operatingCash) revert InsufficientOperatingCash(operatingCash, amount);
            operatingCash -= amount;
        }
        _repay(amount, upperHint, lowerHint, false, fromPending);
    }

    function _repay(uint256 amount, address upperHint, address lowerHint, bool automated, bool fromPending)
        internal
    {
        (, uint256 debtBefore,,) = loanState();
        uint256 balBefore = musd.balanceOf(address(this));
        borrowerOperations.repayMUSD(amount, upperHint, lowerHint);
        uint256 burned = balBefore - musd.balanceOf(address(this));
        if (burned != amount) revert UnexpectedBurn(amount, burned);
        totalRepaid += amount;
        (, uint256 debtAfter,,) = loanState();
        emit RepaymentExecuted(msg.sender, amount, debtBefore, debtAfter, automated, fromPending);
    }

    // =====================================================================================
    // Owner loan management
    // =====================================================================================

    /// @notice Open a Trove owned by this account with `msg.value` BTC collateral.
    ///         Borrowed MUSD is operating cash, never income.
    function openLoan(uint256 debtAmount, address upperHint, address lowerHint)
        external
        payable
        onlyOwner
        nonReentrant
    {
        if (troveManager.getTroveStatus(address(this)) == ITroveManager.Status.active) revert LoanActive();
        uint256 balBefore = musd.balanceOf(address(this));
        borrowerOperations.openTrove{value: msg.value}(debtAmount, upperHint, lowerHint);
        uint256 received = musd.balanceOf(address(this)) - balBefore;
        operatingCash += received;
        totalBorrowed += received;
        (, uint256 totalDebt,,) = loanState();
        emit LoanOpened(msg.value, received, totalDebt);
    }

    function addCollateral(address upperHint, address lowerHint) external payable onlyOwner nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        borrowerOperations.addColl{value: msg.value}(upperHint, lowerHint);
        emit CollateralAdded(msg.value);
    }

    function borrow(uint256 amount, address upperHint, address lowerHint) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 balBefore = musd.balanceOf(address(this));
        borrowerOperations.withdrawMUSD(amount, upperHint, lowerHint);
        uint256 received = musd.balanceOf(address(this)) - balBefore;
        operatingCash += received;
        totalBorrowed += received;
        emit LoanBorrowed(received);
    }

    function withdrawCollateral(uint256 amount, address to, address upperHint, address lowerHint)
        external
        onlyOwner
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        borrowerOperations.withdrawColl(amount, upperHint, lowerHint);
        _sendBtc(to, amount);
        emit CollateralWithdrawn(to, amount);
    }

    /// @notice Close the Trove. Uses pending repayment first, then operating cash. Collateral returns
    ///         to this account and can be withdrawn with `withdrawBtc`.
    function closeLoan() external onlyOwner nonReentrant {
        (ITroveManager.Status loan, uint256 totalDebt,,) = loanState();
        if (loan != ITroveManager.Status.active) revert LoanNotActive();
        uint256 required = totalDebt - troveManager.MUSD_GAS_COMPENSATION();
        uint256 available = pendingRepayment + operatingCash;
        if (available < required) revert InsufficientFundsToClose(available, required);

        uint256 fromPending = required < pendingRepayment ? required : pendingRepayment;
        uint256 fromOperating = required - fromPending;
        pendingRepayment -= fromPending;
        operatingCash -= fromOperating;

        uint256 btcBefore = address(this).balance;
        uint256 balBefore = musd.balanceOf(address(this));
        borrowerOperations.closeTrove();
        uint256 burned = balBefore - musd.balanceOf(address(this));
        if (burned != required) revert UnexpectedBurn(required, burned);
        totalRepaid += required;
        emit LoanClosed(required, fromPending, fromOperating, address(this).balance - btcBefore);
    }

    /// @notice After liquidation or redemption, claim surplus collateral into this account.
    function claimCollateralSurplus() external onlyOwner nonReentrant {
        uint256 btcBefore = address(this).balance;
        borrowerOperations.claimCollateral();
        emit CollateralSurplusClaimed(address(this).balance - btcBefore);
    }

    // =====================================================================================
    // Owner funds
    // =====================================================================================

    function withdrawOperating(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > operatingCash) revert InsufficientOperatingCash(operatingCash, amount);
        operatingCash -= amount;
        totalWithdrawn += amount;
        musd.safeTransfer(to, amount);
        emit OperatingWithdrawn(to, amount);
    }

    /// @notice Move pending allocation back to operating cash (explicit, reduces pending).
    function releasePending(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > pendingRepayment) revert InsufficientPending(pendingRepayment, amount);
        pendingRepayment -= amount;
        operatingCash += amount;
        totalReleased += amount;
        emit PendingReleased(amount);
    }

    /// @notice Withdraw BTC held by the account outside the guard buffer (e.g. collateral returned
    ///         by close, withdrawals, or surplus claims).
    function withdrawBtc(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 free = freeBtc();
        if (amount > free) revert InsufficientFreeBtc(free, amount);
        _sendBtc(to, amount);
        emit BtcWithdrawn(to, amount);
    }

    function _sendBtc(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert BtcTransferFailed();
    }

    // =====================================================================================
    // Collateral guard
    // =====================================================================================

    function guard() external view returns (Guard memory) {
        return _guard;
    }

    /// @notice BTC held by the account that is not reserved for the guard.
    function freeBtc() public view returns (uint256) {
        return address(this).balance - collateralBuffer;
    }

    /// @notice Set the guard. (0, 0) disables it. Otherwise MCR < trigger <= target <= 1000%.
    function setGuard(Guard calldata g) external onlyOwner {
        if (g.triggerRatio == 0) {
            if (g.targetRatio != 0) revert InvalidGuard();
        } else if (g.triggerRatio <= MEZO_MCR || g.targetRatio < g.triggerRatio || g.targetRatio > MAX_GUARD_RATIO) {
            revert InvalidGuard();
        }
        _guard = g;
        emit GuardUpdated(g);
    }

    /// @notice Reserve BTC for collateral top-ups.
    function fundBuffer() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();
        collateralBuffer += msg.value;
        emit BufferFunded(msg.value, collateralBuffer);
    }

    function withdrawBuffer(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > collateralBuffer) revert InsufficientBuffer(collateralBuffer, amount);
        collateralBuffer -= amount;
        _sendBtc(to, amount);
        emit BufferWithdrawn(to, amount, collateralBuffer);
    }

    /// @dev Price from Mezo's feed; 0 if the feed reverts (e.g. stale oracle), so views never break.
    function _price() internal view returns (uint256) {
        try priceFeed.fetchPrice() returns (uint256 p) {
            return p;
        } catch {
            return 0;
        }
    }

    /// @notice What `protect` would do now.
    /// @return ratio   current collateral ratio (1e18 = 100%), 0 if unknown
    /// @return repay   pending MUSD that would be repaid
    /// @return topUp   buffer BTC that would be added as collateral
    /// @return status  whether protecting is possible
    function guardPreview() public view returns (uint256 ratio, uint256 repay, uint256 topUp, GuardStatus status) {
        Guard memory g = _guard;
        if (g.triggerRatio == 0) return (0, 0, 0, GuardStatus.Disabled);
        (ITroveManager.Status loan, uint256 debt, uint256 coll, uint256 maxRepayable) = loanState();
        if (loan != ITroveManager.Status.active) return (0, 0, 0, GuardStatus.NoActiveLoan);
        uint256 price = _price();
        if (price == 0) return (0, 0, 0, GuardStatus.PriceUnavailable);
        ratio = (coll * price) / debt;
        if (ratio >= g.triggerRatio) return (ratio, 0, 0, GuardStatus.Healthy);

        // 1. Steer pending MUSD into repayment, toward the debt at which coll alone meets the target.
        uint256 targetDebt = (coll * price) / g.targetRatio;
        uint256 needed = debt > targetDebt ? debt - targetDebt : 0;
        repay = _min(_min(needed, pendingRepayment), maxRepayable);

        // 2. Top up collateral from the buffer for whatever gap remains (rounded up).
        uint256 debtAfter = debt - repay;
        uint256 requiredColl = (uint256(g.targetRatio) * debtAfter + price - 1) / price;
        if (requiredColl > coll) topUp = _min(requiredColl - coll, collateralBuffer);

        status = (repay == 0 && topUp == 0) ? GuardStatus.NoResources : GuardStatus.Protectable;
    }

    /// @notice Permissionless: if the collateral ratio is below the owner's trigger, repay from
    ///         pending (bypassing cadence limits, never operating cash) and add buffer BTC as
    ///         collateral, aiming for the owner's target ratio.
    function protect(address upperHint, address lowerHint)
        external
        nonReentrant
        returns (uint256 repaid, uint256 collateralAdded)
    {
        uint256 ratioBefore;
        GuardStatus status;
        (ratioBefore, repaid, collateralAdded, status) = guardPreview();
        if (status != GuardStatus.Protectable) revert GuardNotActionable(status);
        if (repaid > 0) {
            pendingRepayment -= repaid;
            totalProtectRepaid += repaid;
            _repay(repaid, upperHint, lowerHint, true, true);
        }
        if (collateralAdded > 0) {
            collateralBuffer -= collateralAdded;
            totalProtectTopUp += collateralAdded;
            borrowerOperations.addColl{value: collateralAdded}(upperHint, lowerHint);
            emit CollateralAdded(collateralAdded);
        }
        (, uint256 debt, uint256 coll,) = loanState();
        emit CollateralProtected(msg.sender, ratioBefore, (coll * _price()) / debt, repaid, collateralAdded);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /// @notice Single-call snapshot for frontends and the keeper.
    struct Snapshot {
        address owner;
        Policy policy;
        uint256 musdBalance;
        uint256 pendingRepayment;
        uint256 operatingCash;
        uint256 unclassified;
        uint256 totalIncome;
        uint256 totalAllocated;
        uint256 totalRepaid;
        uint256 totalBorrowed;
        uint256 totalCapital;
        uint256 totalWithdrawn;
        uint256 totalReleased;
        uint64 paymentCount;
        uint64 lastExecutionAt;
        uint8 loanStatus;
        uint256 debt;
        uint256 collateral;
        uint256 maxRepayable;
        uint256 btcBalance;
        uint256 collateralSurplus;
        uint256 previewAmount;
        uint8 previewStatus;
        Guard guard;
        uint256 collateralBuffer;
        uint256 price;
        uint256 ratio;
        uint256 guardRepay;
        uint256 guardTopUp;
        uint8 guardStatus;
        uint256 totalProtectRepaid;
        uint256 totalProtectTopUp;
    }

    function snapshot() external view returns (Snapshot memory s) {
        s.owner = owner;
        s.policy = _policy;
        s.musdBalance = musd.balanceOf(address(this));
        s.pendingRepayment = pendingRepayment;
        s.operatingCash = operatingCash;
        s.unclassified = unclassifiedBalance();
        s.totalIncome = totalIncome;
        s.totalAllocated = totalAllocated;
        s.totalRepaid = totalRepaid;
        s.totalBorrowed = totalBorrowed;
        s.totalCapital = totalCapital;
        s.totalWithdrawn = totalWithdrawn;
        s.totalReleased = totalReleased;
        s.paymentCount = paymentCount;
        s.lastExecutionAt = lastExecutionAt;
        ITroveManager.Status st;
        (st, s.debt, s.collateral, s.maxRepayable) = loanState();
        s.loanStatus = uint8(st);
        s.btcBalance = address(this).balance;
        s.collateralSurplus = collSurplusPool.getCollateral(address(this));
        Status ps;
        (s.previewAmount, ps) = previewRepayment();
        s.previewStatus = uint8(ps);
        s.guard = _guard;
        s.collateralBuffer = collateralBuffer;
        s.price = _price();
        if (s.loanStatus == uint8(ITroveManager.Status.active) && s.debt > 0) s.ratio = (s.collateral * s.price) / s.debt;
        GuardStatus gs;
        (, s.guardRepay, s.guardTopUp, gs) = guardPreview();
        s.guardStatus = uint8(gs);
        s.totalProtectRepaid = totalProtectRepaid;
        s.totalProtectTopUp = totalProtectTopUp;
    }
}
