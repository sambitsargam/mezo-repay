# Repayment accounting

All amounts are MUSD base units (18 decimals) held as `uint256` on-chain and `bigint` off-chain.
No floating point is used anywhere in token accounting. Source of truth: `packages/contracts/src/RePayAccount.sol`.

## Buckets

Every MUSD held by an account is in exactly one bucket:

| Bucket | Meaning | Who can move it |
| --- | --- | --- |
| `pendingRepayment` | Allocated to loan repayment, not yet repaid | Keeper (`executeRepayment`, policy-bounded), owner (`ownerRepay`, `releasePending`, `closeLoan`) |
| `operatingCash` | The owner's spendable MUSD: income remainder, borrow proceeds, capital | Owner only (`withdrawOperating`, `ownerRepay`, `closeLoan`) |
| unclassified | Derived: `balanceOf(account) − pendingRepayment − operatingCash` | Owner classifies it (`classifyUnclassified`) |

### Conservation equations (asserted by `test/Invariant.t.sol`)

```
balanceOf(account) = pendingRepayment + operatingCash + unclassified          (I1)
pendingRepayment + operatingCash ≤ balanceOf(account)                          (I2)
totalAllocated ≤ totalIncome                                                   (I3)
totalRepaid(automated) ≤ totalAllocated + totalCapital                         (I4)
balanceOf(account) = totalBorrowed + Σpaid + Σdirect − totalRepaid − totalWithdrawn   (I5)
keeper MUSD gain = 0                                                           (I6)
while the Trove is active: totalDebt ≥ minNetDebt + gasCompensation            (I7)
```

I2 holds because MUSD only leaves the account through functions that first debit a bucket
(`withdrawOperating`, `_repay`, `closeLoan`), and every repay/close checks the exact amount burned
(`UnexpectedBurn`). Liquidation and redemption touch collateral and debt, never the account's MUSD.

## Sources of MUSD and how each is classified

| Source | Function | Counted as income? | Bucket |
| --- | --- | --- | --- |
| Customer payment (approval) | `pay(amount, ref)` | Yes | split by policy |
| Customer payment (EIP-2612) | `payWithPermit(...)` | Yes | split by policy |
| Borrowing at open | `openLoan` | **No** (`totalBorrowed`) | operating |
| Additional borrowing | `borrow` | **No** (`totalBorrowed`) | operating |
| Owner capital | `depositCapital(amount, toRepayment)` | **No** (`totalCapital`) | operating or pending |
| Direct ERC-20 transfer | none (ERC-20 does not call the receiver) | **No**, until classified | unclassified |
| Classified as revenue | `classifyUnclassified(amt, true, _, ref)` | Yes | split by policy |
| Classified as capital | `classifyUnclassified(amt, false, toRepayment, _)` | No | operating or pending |

The amount credited is the measured balance increase, not the requested amount.

## Allocation rule

For each tracked income event of amount `P`, at the policy in force **at that moment**:

```
toRepayment = floor(P × repaymentBps / 10_000)
toOperating = P − toRepayment
```

Each payment is split exactly once, inside the transaction that receives it. Keeper runs never
re-apply the percentage to the account balance, so operating cash is never eroded by repeated runs.

Example: P = 500 MUSD at 3000 bps gives 150 pending and 350 operating (live:
`docs/EVIDENCE.md`, step `customer-pay`).

### Policy changes are prospective

`setPolicy` replaces the policy for future events only. Existing `pendingRepayment` and
`operatingCash` are unchanged. Tested in `test_policyChangeIsProspective`.

## Automated execution (`executeRepayment`)

Permissionless. The contract computes the amount from current state in the executing block:

```
if paused                                   → wait: Paused
if Trove not active                         → wait: NoActiveLoan
if pendingRepayment == 0                    → wait: NothingPending
if now < lastExecutionAt + cooldown         → wait: Cooldown
if operatingCash < operatingReserve         → wait: ReserveShortfall
headroom = totalDebt − (gasCompensation + minNetDebt)   (0 if negative)
if headroom == 0                            → wait: AtMinimumDebt
amount = min(pendingRepayment, maxExecution or ∞, headroom)
if amount < minExecution                    → wait: AtMinimumDebt if headroom was the limit, else BelowMinExecution
```

Effects: `pendingRepayment −= amount`, `lastExecutionAt = now`, `totalRepaid += amount`, then
`BorrowerOperations.repayMUSD(amount)`. Any revert rolls back all accounting. A blocked allocation
always stays pending.

`totalDebt` comes from `TroveManager.getEntireDebtAndColl`, which includes interest accrued up to
`block.timestamp`. Preview-to-execution interest drift is therefore resolved on-chain. Live evidence:
previewed 52.001111 MUSD, executed 52.001119 MUSD, debt landed exactly on 2,000 MUSD.

### Reserve semantics

The reserve is a liquidity guard, not a deduction: automated execution only spends pending funds,
but waits while operating cash is below the reserve. The business keeps working capital before
repayment proceeds.

## Owner actions

| Action | Accounting |
| --- | --- |
| `ownerRepay(amount, fromPending)` | debits the chosen bucket; ignores pause/cooldown/limits/reserve; still capped by protocol headroom |
| `releasePending(amount)` | pending → operating; emits `PendingReleased`; `totalReleased += amount` |
| `withdrawOperating(to, amount)` | operating → `to`; `totalWithdrawn += amount`; cannot touch pending |
| `closeLoan()` | required = `totalDebt − gasCompensation`; uses pending first, then operating; reverts if insufficient |
| `withdrawBtc`, `claimCollateralSurplus`, `withdrawCollateral` | BTC only; MUSD buckets unchanged |

## Close vs partial repayment

- **Partial** (`repayMUSD`): Mezo requires `netDebt − amount ≥ minNetDebt` (1,800 MUSD on testnet).
  The 200 MUSD gas compensation is not repayable this way.
- **Full close** (`closeTrove`): burns `totalDebt − gasCompensation` from the account. The gas
  compensation is burned from Mezo's GasPool. All collateral returns to the account.
- Full closure is owner-only in this version. When headroom is zero the UI shows
  "Waiting for enough MUSD to close the loan" and keeps funds pending.

## Terminal protocol events

| Event | Effect on RePay |
| --- | --- |
| Liquidation | Trove status 3; automation reports `NoActiveLoan`; MUSD buckets untouched; owner may `releasePending` and withdraw |
| Partial redemption | debt and collateral reduced by Mezo; next preview uses new debt |
| Full redemption | Trove status 4; surplus collateral claimable via `claimCollateralSurplus` |
| Recovery mode | repayments still allowed; close blocked by Mezo; RePay surfaces the revert |
