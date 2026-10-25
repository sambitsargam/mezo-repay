# Security

> This is a **self-review** by the authors plus automated tooling. It is not an independent audit.
> The contracts are deployed to Mezo testnet only. Do not use them with real funds.

## Authority model

| Actor | Can | Cannot |
| --- | --- | --- |
| **Owner** (fixed at creation) | change policy, pause/resume, open/close loan, borrow, add/withdraw collateral, repay, withdraw operating cash, release pending, classify transfers, claim surplus, withdraw BTC | change the owner (no transfer function exists) |
| **Anyone / keeper** | `executeRepayment(upperHint, lowerHint)` and `pay`/`payWithPermit` | everything else (all reverts with `NotOwner`) |
| **Factory** | create clones and call `initialize` once in the same transaction | anything after creation: no admin, no upgrade, no funds |
| **Mezo protocol** | liquidate or redeem the Trove under its rules | move the account's MUSD |

### Keeper bounds (enforced on-chain)

`executeRepayment`:

- spends only `pendingRepayment`, never operating cash or unclassified funds;
- repays only `address(this)`'s Trove via `BorrowerOperations.repayMUSD`, which acts on `msg.sender`;
- computes the amount itself; the caller supplies only sorted-list hints. Mezo validates hints, so a bad hint costs gas and cannot redirect funds;
- pays the caller nothing (zero keeper fee) and has no recipient parameter;
- respects pause, cooldown, reserve, min/max and Mezo's minimum debt;
- checks that exactly `amount` MUSD was burned (`UnexpectedBurn`), otherwise reverts.

There is no arbitrary call, no `delegatecall`, and no generic executor.

### Concurrency

Two keepers racing on the same account: the first succeeds. The second either hits `Cooldown`, or,
with cooldown 0, finds a smaller or zero pending amount and reverts with `NothingPending`. No double
spend is possible because state is decremented before the external call, inside `nonReentrant`.
Tested: `test_cooldownBlocksSecondExecution_concurrentKeepers`, `test_sameBlockRaceWithoutCooldown_secondFindsNothing`.

## Initialization

- The implementation constructor calls `_disableInitializers()`.
- `initialize` requires `msg.sender == factory`, and the factory calls it in the same transaction as
  `Clones.clone`, so nobody can front-run initialization.
- `initializer` prevents re-initialization.

Tests: `test_cannotReinitializeClone`, `test_implementationCannotBeInitialized`, `test_onlyFactoryCanInitialize`.

## Reentrancy

Every state-changing function is `nonReentrant` (OpenZeppelin `ReentrancyGuard`). External calls go
to MUSD (OpenZeppelin ERC20Permit, no hooks), Mezo BorrowerOperations, and plain BTC sends to the
owner-chosen destination. `receive()` accepts BTC with no logic. The mock protocol re-enters
`executeRepayment` during `repayMUSD`; the guard reverts (`test_reentrancyBlocked`).

## Permits

`payWithPermit` wraps `permit` in `try/catch`, so a front-run permit (already consumed) cannot block
payment while an allowance exists. Replay fails at the token nonce. Expired permits revert. The
payer signs for exactly the payment amount. Tests: `PermitTest` (4 cases). Live: step
`customer-pay-permit`. Domain verified on-chain via `eip712Domain()`: name "Mezo USD", version "1".

## Static analysis: Slither (via `uvx --from slither-analyzer`)

`slither . --filter-paths "lib/|test/|script/" --exclude-informational --exclude-optimization`.
15 results across 8 detectors, triaged:

| Detector | Finding | Assessment |
| --- | --- | --- |
| arbitrary-send-eth | `_sendBtc(to, amount)` | Only reachable from `onlyOwner` `withdrawBtc` / `withdrawCollateral`; the destination is the owner's choice. Accepted. |
| reentrancy-benign / -balance / -events | state written after Mezo calls in `_repay`, `borrow`, `openLoan`, `closeLoan`; factory event after `initialize` | All `nonReentrant`; callees are the trusted Mezo protocol or the fresh clone. Post-call writes are deliberate: they record the measured balance delta. Accepted. |
| missing-zero-check | factory constructor args | The RePayAccount constructor reverts on zero addresses, so deployment fails. Accepted. |
| timestamp | cooldown comparison | Intended; validator timestamp skew is negligible relative to cooldowns. Accepted. |
| unused-return | partial tuple from `getEntireDebtAndColl` | Intended. |
| events-maths | `setPaused` style setter | Events are emitted (`AutomationPaused`). Accepted. |

## Frontend and keeper

- The keeper key lives only in a gitignored `.env`; it is never a `NEXT_PUBLIC_*` variable, and keeper
  logs redact 32-byte hex strings outside hash fields.
- The keeper allowlists chain id 31611 and simulates before every send.
- After submitting, it never resubmits: a missing receipt is logged and state is re-read on the next scan.
- The web app simulates every write before the wallet prompt, locks against double submits, and
  reports slow receipts as "still confirming", never as failure.
- The payer page verifies `factory.isAccount(target)` before allowing payment, and marks the
  display name from the link as unverified.
- CSV export neutralizes formula injection (`=`, `+`, `-`, `@` prefixes).

## Known limitations and residual risk

- Not audited. Mezo contracts are upgradeable proxies controlled by Mezo governance; their behavior
  may change.
- The owner key is a single point of control. There is no recovery if it is lost.
- Liquidation risk is the owner's; RePay does not monitor or protect against it.
- If Mezo's price oracle is stale, all Trove operations revert; funds stay pending.
- The keeper is best-effort: one operator, no SLA.
