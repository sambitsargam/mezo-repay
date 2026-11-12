# Evidence

Everything below is generated from the JSON records in `docs/evidence/`, which the demo runner
(`services/keeper/src/demo.ts`) appends to as each step runs on **Mezo testnet (chain 31611)**.
Regenerate with `node scripts/render-evidence.mjs`.

Each row is labeled with its type:

- **On-chain transaction**: mined on Mezo testnet; follow the explorer link.
- **Read-only call**: state read with `eth_call` at the stated block; no transaction.
- **Simulation**: `eth_call` of a write, showing what the contract would do; no transaction.

Local tests (Foundry, Vitest, Playwright) are listed at the end and are **not** live evidence.

## Summary

| Path | Live on testnet | Where |
| --- | --- | --- |
| Create account (factory clone) | Yes (v1, v2, v3) | v3 `create-account` |
| Open a Mezo Trove owned by the account | Yes (v1, v2, v3) | v3 `open-loan` (and reopened after the auto-close) |
| Tracked payment, approve + `pay` | Yes | v3 `customer-pay`; v2 `customer-pay` (×2) |
| Tracked payment, EIP-2612 `payWithPermit` | Yes | v3 and v2 `customer-pay-permit` |
| **Auto-close: keeper `executeClose` from pending only** | **Yes** | v3 `keeper-auto-close` |
| Split into pending repayment / operating cash | Yes | `PaymentReceived` data on each payment |
| Keeper `executeRepayment` (permissionless) | Yes | v2 `keeper-execute`; v1 two runs |
| Repayment capped at Mezo's minimum debt | Yes | v1 `keeper-execute-capped`; v2 `keeper-protect` |
| Collateral guard `protect`: pending → repay, buffer → `addColl` | Yes | v2 `keeper-protect` |
| Owner `addCollateral` / `withdrawCollateral` | Yes | v2 `owner-add-collateral`, `owner-withdraw-collateral` |
| Owner `closeLoan` (`closeTrove`) and BTC withdrawal | Yes | v1 and v2 `owner-close-loan`, `owner-withdraw-btc` |
| Direct transfer stays unclassified, then classified | Yes | v1 `direct-transfer`, `classify-revenue` |
| Non-owner rejected | Yes (simulation + mined revert) | v1 and v2 `unauthorized-*` |
| `claimCollateralSurplus` | **No.** Surplus exists only after a liquidation or redemption of this Trove, which we cannot cause honestly on a shared testnet. Covered by unit tests against the mock (`test_fullRedemptionThenClaimSurplus`). | — |

## Run 3: current deployment (v3, auto-close)

| Role | Address |
| --- | --- |
| RePay factory v3 | [`0x2AF4eB61EFdF3942B71B3f288FB58Cf719087eeb`](https://explorer.test.mezo.org/address/0x2AF4eB61EFdF3942B71B3f288FB58Cf719087eeb) · deployed in [`0x30bfbfb2e482c88b…`](https://explorer.test.mezo.org/tx/0x30bfbfb2e482c88b779bf99b652c3f03c87b777e7840d2dc240d1817609c6859) (block 16723420) |
| RePay account (demo) | [`0x3B89a07a950c71c3f6978EDf17270384E2184aAe`](https://explorer.test.mezo.org/address/0x3B89a07a950c71c3f6978EDf17270384E2184aAe) |
| Owner / deployer wallet | [`0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB`](https://explorer.test.mezo.org/address/0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB) |
| Customer wallet (separate key) | [`0xED7a26AD75c224728EBA1059BE7E1864c2Fab1ed`](https://explorer.test.mezo.org/address/0xED7a26AD75c224728EBA1059BE7E1864c2Fab1ed) |
| Keeper wallet (separate key, no authority) | [`0x2f7b81940281d513b0DbfebE78005030391e1c02`](https://explorer.test.mezo.org/address/0x2f7b81940281d513b0DbfebE78005030391e1c02) |

### What run 3 demonstrates

Partial repayment always stops at Mezo's minimum net debt, so before v3 the last ~1,800 MUSD needed a
manual close. Auto-close lets income finish the job.

1. **Opt-in.** The account opened a Trove at the minimum size (0.045 BTC, borrow 1,800, debt 2,001.80 MUSD) and the owner called `setAutoClose(true)`. Status: *saving toward payoff* (payoff = debt − 200 MUSD gas compensation = 1,801.8000 MUSD).
2. **Income accumulates instead of stalling.** The customer paid 1,000 MUSD (approve + `pay`) and 100 MUSD (permit); 30% of each went to pending repayment. Routine repayment reported `AtMinimumDebt`, but pending kept growing toward the payoff (330.00 MUSD of 1,801.8000 MUSD).
3. **Top-up, labeled.** To reach the payoff in one sitting, the owner deposited 1,480 MUSD of their own capital straight into pending repayment (`depositCapital`, recorded as capital, never income). In normal use income alone fills it over time.
4. **Keeper closes the loan.** The keeper wallet, which has no authority over the account, called `executeClose`. Mezo's `closeTrove` burned 1,801.8000 MUSD: **1,801.8000 MUSD from pending, 0.0000 MUSD from operating cash**, and 0.045000 BTC came back to the account.
5. **Back to work.** The owner withdrew the BTC, reopened a loan on the same account (auto-close still on), and set the guard to 150% → 170%. The read-only demo view shows this account.

### Steps

| # | Step | Type | Result | What happened |
| --- | --- | --- | --- | --- |
| 1 | `create-account` | On-chain transaction | [success · block 16723439](https://explorer.test.mezo.org/tx/0xb4d7074b6ff3720dd633f1cbbadbc5fe007f268f21c73a3190726b143fff56b5) | Owner created a RePay account (30% repayment, 5 min cooldown, 10 MUSD minimum) |
| 2 | `open-loan` | On-chain transaction | [success · block 16723442](https://explorer.test.mezo.org/tx/0x8dc775c2922bdc227bdfd9159397762b7a67f853d216cde30abc440c92bf339f) | Account opened a Mezo Trove: 0.045000 BTC collateral, borrowed 1,800.00 MUSD |
| 3 | `read-after-open` | Read-only call | block 16723442 | Account state after opening |
| 4 | `owner-set-auto-close` | On-chain transaction | [success · block 16723446](https://explorer.test.mezo.org/tx/0x2c35dc0193e4b9c7163c62440ca0be5381bf7647b2c5052e5b88ebc968c9d5ae) | Owner turned auto-close on: a keeper may close the loan once pending covers the payoff |
| 5 | `read-after-auto-close` | Read-only call | block 16723446 | Auto-close status after the change |
| 6 | `customer-approve` | On-chain transaction | [success · block 16723450](https://explorer.test.mezo.org/tx/0x7d0be24a176f2412104cd495c64f9a733d2f53629c7ce774d18ec451b3c1a474) | Customer approved exactly 1,000.00 MUSD for the account |
| 7 | `customer-pay` | On-chain transaction | [success · block 16723452](https://explorer.test.mezo.org/tx/0xd50a8944c2f249edc6345bfcf1db5c2c1cd8124020ddb0077307066567f754dd) | Customer paid 1,000.00 MUSD with reference INV-2026-101 |
| 8 | `read-after-pay` | Read-only call | block 16723453 | Account state after payment |
| 9 | `customer-pay-permit` | On-chain transaction | [success · block 16723454](https://explorer.test.mezo.org/tx/0xebeaabcebfd21f9089cc6e20836d52fca87020dafb17a71977987fec45dc420e) | Customer paid 100.00 MUSD in one transaction using an EIP-2612 permit (ref INV-2026-102) |
| 10 | `read-saving-toward-payoff` | Read-only call | block 16723455 | Account state read |
| 11 | `owner-approve-capital` | On-chain transaction | [success · block 16723459](https://explorer.test.mezo.org/tx/0xac53fbb094e1cd484e976bfcff6cafc801450227c22838037e7ed7cc31660176) | Owner approved 1,480.00 MUSD capital |
| 12 | `owner-capital-to-repayment` | On-chain transaction | [success · block 16723461](https://explorer.test.mezo.org/tx/0x71b70ff70665a2b1a9aa28d2bc8f01e785116d74daea3b7fcf0892107cf0910b) | Owner deposited 1,480.00 MUSD of capital (not income) directly into pending repayment |
| 13 | `read-after-capital` | Read-only call | block 16723461 | Owner capital plus customer income in pending now covers the full payoff; auto-close status Ready |
| 14 | `keeper-auto-close` | On-chain transaction | [success · block 16723465](https://explorer.test.mezo.org/tx/0xd08bd6b1eda4afc21a88bd5ba2be01a0cd2b5762b7b30278a0ac383873eccba4) | Keeper auto-closed the Trove: repaid 1,801.80 MUSD from pending only and 0.045000 BTC returned to the account |
| 15 | `read-after-keeper-auto-close` | Read-only call | block 16723465 | Account state after the keeper's auto-close: loan closed, operating cash unchanged, collateral back in the account |
| 16 | `owner-withdraw-btc` | On-chain transaction | [success · block 16723469](https://explorer.test.mezo.org/tx/0x5d3be0c184ec8e55b01275bf1f304d8ff11c5cb32c846f11dff7eadb20369468) | Owner withdrew 0.045000 BTC (collateral returned by the auto-close) from the account to the owner wallet |
| 17 | `open-loan` | On-chain transaction | [success · block 16723472](https://explorer.test.mezo.org/tx/0xdc72a6f80fc4739d5671cc6108adb2b8bd29793b7b8963db68d849acb099aedb) | Account reopened a Mezo Trove: 0.045000 BTC collateral, borrowed 1,800.00 MUSD |
| 18 | `read-after-open` | Read-only call | block 16723472 | Account state after opening |
| 19 | `owner-set-guard` | On-chain transaction | [success · block 16723477](https://explorer.test.mezo.org/tx/0x68ee3f0565a3fd80fc584bb7eccb369e336236d250edb6ba5ccc91aeb2aac931) | Owner set the collateral guard: protect below 150%, aim for 170% |
| 20 | `read-after-guard` | Read-only call | block 16723477 | Guard status after setting it |

### Recorded state

<details><summary><code>create-account</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| account | 0x3B89a07a950c71c3f6978EDf17270384E2184aAe |
| owner | 0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB |

</details>

<details><summary><code>open-loan</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| borrowingFee | 1.8000 MUSD |
| projectedTotalDebt | 2,001.8000 MUSD |
| projectedCR | 166.42% |

</details>

<details><summary><code>read-after-open</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16723442 |
| loanStatus | active |
| debt | 2,001.8000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 166.36% |
| btcPrice | 74,004.75 MUSD |
| pendingRepayment | 0.00 MUSD |
| operatingCash | 1,800.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 0.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 1.80 MUSD |
| previewStatus | NothingPending |
| previewAmount | 0.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |
| autoClose | false |
| closeRequired | 1,801.8000 MUSD |
| closeStatus | Disabled |

</details>

<details><summary><code>read-after-auto-close</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16723446 |
| loanStatus | active |
| debt | 2,001.8000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 166.39% |
| btcPrice | 74,021.25 MUSD |
| pendingRepayment | 0.00 MUSD |
| operatingCash | 1,800.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 0.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 1.80 MUSD |
| previewStatus | NothingPending |
| previewAmount | 0.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |
| autoClose | true |
| closeRequired | 1,801.8000 MUSD |
| closeStatus | InsufficientPending |

</details>

<details><summary><code>customer-pay</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| paymentId | 1 |
| toRepayment | 300.00 MUSD |
| toOperating | 700.00 MUSD |

</details>

<details><summary><code>read-after-pay</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16723453 |
| loanStatus | active |
| debt | 2,001.8000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 166.40% |
| btcPrice | 74,022.80 MUSD |
| pendingRepayment | 300.00 MUSD |
| operatingCash | 2,500.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 1,000.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 1.80 MUSD |
| previewStatus | AtMinimumDebt |
| previewAmount | 0.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |
| autoClose | true |
| closeRequired | 1,801.8000 MUSD |
| closeStatus | InsufficientPending |

</details>

<details><summary><code>customer-pay-permit</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| paymentId | 2 |
| toRepayment | 30.00 MUSD |
| toOperating | 70.00 MUSD |

</details>

<details><summary><code>read-saving-toward-payoff</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16723455 |
| loanStatus | active |
| debt | 2,001.8000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 166.37% |
| btcPrice | 74,010.23 MUSD |
| pendingRepayment | 330.00 MUSD |
| operatingCash | 2,570.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 1,100.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 1.80 MUSD |
| previewStatus | AtMinimumDebt |
| previewAmount | 0.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |
| autoClose | true |
| closeRequired | 1,801.8000 MUSD |
| closeStatus | InsufficientPending |

</details>

<details><summary><code>read-after-capital</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16723461 |
| loanStatus | active |
| debt | 2,001.8000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 166.25% |
| btcPrice | 73,958.70 MUSD |
| pendingRepayment | 1,810.00 MUSD |
| operatingCash | 2,570.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 1,100.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 1.80 MUSD |
| previewStatus | AtMinimumDebt |
| previewAmount | 0.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |
| autoClose | true |
| closeRequired | 1,801.8000 MUSD |
| closeStatus | Ready |

</details>

<details><summary><code>keeper-auto-close</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| debtRepaid | 1,801.8000 MUSD |
| fromPending | 1,801.8000 MUSD |
| fromOperating | 0.0000 MUSD |
| collateralReturned | 0.045000 BTC |

</details>

<details><summary><code>read-after-keeper-auto-close</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16723465 |
| loanStatus | closedByOwner |
| debt | 0.0000 MUSD |
| collateral | 0.000000 BTC |
| collateralRatio | — |
| btcPrice | 73,959.15 MUSD |
| pendingRepayment | 8.19 MUSD |
| operatingCash | 2,570.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 1,100.00 MUSD |
| totalRepaid | 1,801.80 MUSD |
| maxRepayable | 0.00 MUSD |
| previewStatus | NoActiveLoan |
| previewAmount | 0.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.045000 BTC |
| autoClose | true |
| closeRequired | 0.0000 MUSD |
| closeStatus | NoActiveLoan |

</details>

<details><summary><code>open-loan</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| borrowingFee | 1.8000 MUSD |
| projectedTotalDebt | 2,001.8000 MUSD |
| projectedCR | 166.23% |

</details>

<details><summary><code>read-after-open</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16723472 |
| loanStatus | active |
| debt | 2,001.8000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 166.20% |
| btcPrice | 73,934.78 MUSD |
| pendingRepayment | 8.19 MUSD |
| operatingCash | 4,370.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 1,100.00 MUSD |
| totalRepaid | 1,801.80 MUSD |
| maxRepayable | 1.80 MUSD |
| previewStatus | Cooldown |
| previewAmount | 0.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |
| autoClose | true |
| closeRequired | 1,801.8000 MUSD |
| closeStatus | InsufficientPending |

</details>

<details><summary><code>read-after-guard</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16723477 |
| loanStatus | active |
| debt | 2,001.8000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 166.17% |
| btcPrice | 73,923.07 MUSD |
| pendingRepayment | 8.19 MUSD |
| operatingCash | 4,370.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 1,100.00 MUSD |
| totalRepaid | 1,801.80 MUSD |
| maxRepayable | 1.80 MUSD |
| previewStatus | Cooldown |
| previewAmount | 0.00 MUSD |
| guardStatus | Healthy |
| guard | 150% → 170% |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |
| autoClose | true |
| closeRequired | 1,801.8000 MUSD |
| closeStatus | InsufficientPending |

</details>

## Run 2: previous deployment (v2, collateral guard)

| Role | Address |
| --- | --- |
| RePay factory v2 | [`0xceb2223F6F81991E671781A77f8f3469d6FDe56b`](https://explorer.test.mezo.org/address/0xceb2223F6F81991E671781A77f8f3469d6FDe56b) · deployed in [`0x11fac633b46ef7a5…`](https://explorer.test.mezo.org/tx/0x11fac633b46ef7a53d6a6e8410981a34bbec57e54953ccb13764c9a704a81bea) (block 16722537) |
| RePay account (demo, now closed) | [`0x97D60Fb479B5E88B2C02A6d97C0d3da9b4A899D7`](https://explorer.test.mezo.org/address/0x97D60Fb479B5E88B2C02A6d97C0d3da9b4A899D7) |
| Owner / deployer wallet | [`0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB`](https://explorer.test.mezo.org/address/0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB) |
| Customer wallet (separate key, borrowed its own MUSD) | [`0xED7a26AD75c224728EBA1059BE7E1864c2Fab1ed`](https://explorer.test.mezo.org/address/0xED7a26AD75c224728EBA1059BE7E1864c2Fab1ed) |
| Keeper wallet (separate key, no authority) | [`0x2f7b81940281d513b0DbfebE78005030391e1c02`](https://explorer.test.mezo.org/address/0x2f7b81940281d513b0DbfebE78005030391e1c02) |

### What run 2 demonstrates

1. **Account and real Trove.** The factory created the account; `openLoan` sent 0.045 BTC through `BorrowerOperations.openTrove` and the account became the borrower (debt 2,202 MUSD, ratio 150.9%).
2. **Tracked income split once.** A separate customer wallet paid 500 MUSD (approve + `pay`), 100 MUSD (one-transaction permit) and 100 MUSD again. Each payment split 30% to pending repayment and 70% to operating cash. Borrowed MUSD was never counted as income.
3. **Policy limits respected.** The owner capped automated repayment at 100 MUSD; the keeper's `executeRepayment` repaid exactly 100 (debt 2,202.0000 MUSD → 2,102.0000 MUSD) and left the rest pending under cooldown.
4. **Collateral guard, live.** The owner set the guard to protect below 170% and aim for 180%, and reserved 0.003 BTC as a buffer. The trigger was set **above** the current ratio so the path runs at today's price (testnet prices cannot be moved by us). The keeper called `protect`: it repaid 102.0001 MUSD from pending (capped exactly at Mezo's 2,000 MUSD floor, ignoring the cooldown), then added 0.003000 BTC from the buffer through `addColl`. Ratio **158.20% → 177.35%**. Operating cash was not touched.
5. **Collateral management.** The owner added and withdrew 0.0005 BTC of collateral (`addColl`, `withdrawColl`).
6. **Authority.** The customer's `withdrawOperating` simulation reverted with `NotOwner()`, and its mined `setPolicy` transaction reverted.
7. **Closed before v3.** The owner closed the Trove with `closeLoan` (1,800.0021 MUSD: 7.9998 MUSD from pending, 1,792.0022 MUSD from operating cash), withdrew the BTC and the remaining operating cash, and reused them for run 3.

### Steps

| # | Step | Type | Result | What happened |
| --- | --- | --- | --- | --- |
| 1 | `create-account` | On-chain transaction | [success · block 16722558](https://explorer.test.mezo.org/tx/0xdcbba1361dfb6d6b3a53b98fa0009db0bde8eab8087c3923f84afa41230503b3) | Owner created a RePay account (30% repayment, 5 min cooldown, 10 MUSD minimum) |
| 2 | `open-loan` | On-chain transaction | [success · block 16722566](https://explorer.test.mezo.org/tx/0x73834a842ad156a75129d94832579d7bfd4de05cb21fdb582e387638e6bab27c) | Account opened a Mezo Trove: 0.045000 BTC collateral, borrowed 2,000.00 MUSD |
| 3 | `read-after-open` | Read-only call | block 16722566 | Account state after opening |
| 4 | `customer-musd` | On-chain transaction | [success · block 16722571](https://explorer.test.mezo.org/tx/0xd8309a858dc28e950c0a13a1446dd13a747e0af1f6c8c8bc8ba9a692ff8b8a3b) | Customer wallet opened its own Trove to obtain 1,800.00 MUSD (independent of the RePay account) |
| 5 | `customer-approve` | On-chain transaction | [success · block 16722573](https://explorer.test.mezo.org/tx/0x2e6cb8daf1fd4d664dd08c4aa85dd0892f6d4efaef4ab1fdfe05f08d40b8fa52) | Customer approved exactly 500.00 MUSD for the account |
| 6 | `customer-pay` | On-chain transaction | [success · block 16722575](https://explorer.test.mezo.org/tx/0x57c1e0a27a8f56c7f48a5ada8540d13103b564063547e7fa267c418c082fe25c) | Customer paid 500.00 MUSD with reference INV-2026-101 |
| 7 | `read-after-pay` | Read-only call | block 16722575 | Account state after payment |
| 8 | `customer-pay-permit` | On-chain transaction | [success · block 16722579](https://explorer.test.mezo.org/tx/0xfab5349a16b8238094c48a2a1e37465fe2ebdd03ff0cc2b706257989743dd6da) | Customer paid 100.00 MUSD in one transaction using an EIP-2612 permit (ref INV-2026-102) |
| 9 | `customer-approve` | On-chain transaction | [success · block 16722585](https://explorer.test.mezo.org/tx/0x69d0bf2b8f1f1256a046d9d097a764b9d71cd759633613508f296043b003ba54) | Customer approved exactly 100.00 MUSD for the account |
| 10 | `customer-pay` | On-chain transaction | [success · block 16722586](https://explorer.test.mezo.org/tx/0x70d30159b2554e63c0f9f9a5b110f2b0a2858be087c9c3dc91fe766a8e9e8ee6) | Customer paid 100.00 MUSD with reference INV-2026-103 |
| 11 | `read-after-pay` | Read-only call | block 16722586 | Account state after payment |
| 12 | `owner-set-policy` | On-chain transaction | [success · block 16722593](https://explorer.test.mezo.org/tx/0xd2be3af670846234548077468b897e9a341bae7420283e37da8eff84f2099982) | Owner updated the policy: 30% to repayment, at most 100.00 MUSD per automated repayment, 5 min cooldown |
| 13 | `keeper-execute` | On-chain transaction | [success · block 16722597](https://explorer.test.mezo.org/tx/0xf941c705e65cc69a98cf852a9330b61223a8a238c1f9acea52f2d9ffc6838428) | Keeper repaid 100.00 MUSD from pending (permissionless, no fee) |
| 14 | `read-after-keeper-execute` | Read-only call | block 16722603 | Account state read |
| 15 | `owner-set-guard` | On-chain transaction | [success · block 16722608](https://explorer.test.mezo.org/tx/0xb667b9cbce8c5f70324d0dfb75c0bc2bc66543c40b55bb468a5fad73d149df94) | Owner set the collateral guard: protect below 170%, aim for 180% |
| 16 | `read-after-guard` | Read-only call | block 16722608 | Guard status after setting it |
| 17 | `owner-fund-buffer` | On-chain transaction | [success · block 16722611](https://explorer.test.mezo.org/tx/0x1a37221057b1f7639195bfde8c279789e3e92fe638408bdedec79eda82650dbb) | Owner reserved 0.003000 BTC in the account as the guard's collateral buffer |
| 18 | `read-before-protect` | Read-only call | block 16722612 | Account state read |
| 19 | `keeper-protect` | On-chain transaction | [success · block 16722614](https://explorer.test.mezo.org/tx/0x1701f39adca27596085f00bc483e9aa45a6bfd021bc372a5cfbfd15724c44aa9) | Keeper called protect: repaid 102.00 MUSD from pending and added 0.003000 BTC from the buffer |
| 20 | `read-after-keeper-protect` | Read-only call | block 16722614 | Account state after the keeper call |
| 21 | `owner-add-collateral` | On-chain transaction | [success · block 16722619](https://explorer.test.mezo.org/tx/0x736fcc565b05db96996a43edb7288b8dc7436f24d0a84b674a057c1e5975d8fc) | Owner added 0.000500 BTC collateral to the account's Trove (BorrowerOperations.addColl) |
| 22 | `owner-withdraw-collateral` | On-chain transaction | [success · block 16722621](https://explorer.test.mezo.org/tx/0x809d93a933a56c975780d9ca52e7f680425696356c9c3c273b57bc50c05475fb) | Owner withdrew 0.000500 BTC collateral from the Trove to the owner wallet (BorrowerOperations.withdrawColl) |
| 23 | `unauthorized-simulation` | Simulation (eth_call) | — | Customer attempted withdrawOperating; contract rejected it |
| 24 | `unauthorized-transaction` | On-chain transaction | [reverted · block 16722624](https://explorer.test.mezo.org/tx/0xac6b64d885588bc34e6ba168ab12eb67ebfc95e1759e00c3ecded911cceeee2c) | Customer sent setPolicy on-chain; it reverted with NotOwner (policy unchanged) |
| 25 | `read-final` | Read-only call | block 16722625 | Account state read |
| 26 | `owner-close-loan` | On-chain transaction | [success · block 16723404](https://explorer.test.mezo.org/tx/0xcac256f1e89cbe86e779a7bf5613aa6c70f1857cb3b43b7fed702dd40e6f6285) | Owner closed the account's Trove (BorrowerOperations.closeTrove); pending repayment used first, then operating cash |
| 27 | `read-after-close` | Read-only call | — | Account state after closing the loan |
| 28 | `owner-withdraw-btc` | On-chain transaction | [success · block 16723407](https://explorer.test.mezo.org/tx/0x1a0ca762807a9213e5af42355bdaee2e2ae6a042c6651241417b9b0421d5911e) | Owner withdrew 0.048000 BTC (returned collateral) from the account to the owner wallet |
| 29 | `owner-withdraw-operating` | On-chain transaction | [success · block 16723414](https://explorer.test.mezo.org/tx/0x8042b8d4ca7e32e8c315333c84fb714a7a47f262a1478a137942e0c5e8e05222) | Owner withdrew the remaining 697.99 MUSD operating cash to the owner wallet after closing the v2 Trove |

### Recorded state

<details><summary><code>create-account</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| account | 0x97D60Fb479B5E88B2C02A6d97C0d3da9b4A899D7 |
| owner | 0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB |

</details>

<details><summary><code>open-loan</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| borrowingFee | 2.0000 MUSD |
| projectedTotalDebt | 2,202.0000 MUSD |
| projectedCR | 150.93% |

</details>

<details><summary><code>read-after-open</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16722566 |
| loanStatus | active |
| debt | 2,202.0000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 150.91% |
| btcPrice | 73,849.01 MUSD |
| pendingRepayment | 0.00 MUSD |
| operatingCash | 2,000.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 0.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 202.00 MUSD |
| previewStatus | NothingPending |
| previewAmount | 0.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |

</details>

<details><summary><code>customer-pay</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| paymentId | 1 |
| toRepayment | 150.00 MUSD |
| toOperating | 350.00 MUSD |

</details>

<details><summary><code>read-after-pay</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16722575 |
| loanStatus | active |
| debt | 2,202.0000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 150.96% |
| btcPrice | 73,873.97 MUSD |
| pendingRepayment | 150.00 MUSD |
| operatingCash | 2,350.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 500.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 202.00 MUSD |
| previewStatus | Ready |
| previewAmount | 150.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |

</details>

<details><summary><code>customer-pay-permit</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| paymentId | 2 |
| toRepayment | 30.00 MUSD |
| toOperating | 70.00 MUSD |

</details>

<details><summary><code>customer-pay</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| paymentId | 3 |
| toRepayment | 30.00 MUSD |
| toOperating | 70.00 MUSD |

</details>

<details><summary><code>read-after-pay</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16722586 |
| loanStatus | active |
| debt | 2,202.0000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 151.15% |
| btcPrice | 73,965.71 MUSD |
| pendingRepayment | 210.00 MUSD |
| operatingCash | 2,490.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 700.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 202.00 MUSD |
| previewStatus | Ready |
| previewAmount | 202.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |

</details>

<details><summary><code>keeper-execute</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| debtBefore | 2,202.0000 MUSD |
| debtAfter | 2,102.0000 MUSD |

</details>

<details><summary><code>read-after-keeper-execute</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16722603 |
| loanStatus | active |
| debt | 2,102.0001 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 158.20% |
| btcPrice | 73,900.99 MUSD |
| pendingRepayment | 110.00 MUSD |
| operatingCash | 2,490.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 700.00 MUSD |
| totalRepaid | 100.00 MUSD |
| maxRepayable | 102.00 MUSD |
| previewStatus | Cooldown |
| previewAmount | 0.00 MUSD |
| guardStatus | Disabled |
| guard | off |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |

</details>

<details><summary><code>read-after-guard</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16722608 |
| loanStatus | active |
| debt | 2,102.0001 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 158.22% |
| btcPrice | 73,906.94 MUSD |
| pendingRepayment | 110.00 MUSD |
| operatingCash | 2,490.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 700.00 MUSD |
| totalRepaid | 100.00 MUSD |
| maxRepayable | 102.00 MUSD |
| previewStatus | Cooldown |
| previewAmount | 0.00 MUSD |
| guardStatus | Protectable |
| guard | 170% → 180% |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |

</details>

<details><summary><code>read-before-protect</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16722612 |
| loanStatus | active |
| debt | 2,102.0001 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 158.20% |
| btcPrice | 73,900.37 MUSD |
| pendingRepayment | 110.00 MUSD |
| operatingCash | 2,490.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 700.00 MUSD |
| totalRepaid | 100.00 MUSD |
| maxRepayable | 102.00 MUSD |
| previewStatus | Cooldown |
| previewAmount | 0.00 MUSD |
| guardStatus | Protectable |
| guard | 170% → 180% |
| collateralBuffer | 0.003000 BTC |
| btcHeldByAccount | 0.003000 BTC |

</details>

<details><summary><code>keeper-protect</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| ratioBefore | 158.20% |
| ratioAfter | 177.35% |
| repaid | 102.0001 MUSD |
| collateralAdded | 0.003000 BTC |

</details>

<details><summary><code>read-after-keeper-protect</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16722614 |
| loanStatus | active |
| debt | 2,000.0000 MUSD |
| collateral | 0.048000 BTC |
| collateralRatio | 177.35% |
| btcPrice | 73,899.51 MUSD |
| pendingRepayment | 7.99 MUSD |
| operatingCash | 2,490.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 700.00 MUSD |
| totalRepaid | 202.00 MUSD |
| maxRepayable | 0.00 MUSD |
| previewStatus | Cooldown |
| previewAmount | 0.00 MUSD |
| guardStatus | Healthy |
| guard | 170% → 180% |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |

</details>

<details><summary><code>unauthorized-simulation</code> (simulation (eth_call))</summary>

| Field | Value |
| --- | --- |
| error | NotOwner() |

</details>

<details><summary><code>read-final</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16722625 |
| loanStatus | active |
| debt | 2,000.0000 MUSD |
| collateral | 0.048000 BTC |
| collateralRatio | 177.32% |
| btcPrice | 73,885.77 MUSD |
| pendingRepayment | 7.99 MUSD |
| operatingCash | 2,490.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 700.00 MUSD |
| totalRepaid | 202.00 MUSD |
| maxRepayable | 0.00 MUSD |
| previewStatus | Cooldown |
| previewAmount | 0.00 MUSD |
| guardStatus | Healthy |
| guard | 170% → 180% |
| collateralBuffer | 0.000000 BTC |
| btcHeldByAccount | 0.000000 BTC |

</details>

<details><summary><code>owner-close-loan</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| debtRepaid | 1,800.0021 MUSD |
| fromPending | 7.9998 MUSD |
| fromOperating | 1,792.0022 MUSD |
| collateralReturned | 0.048000 BTC |

</details>

<details><summary><code>read-after-close</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| loanStatus | closedByOwner |
| debt | 0.0000 MUSD |
| collateral | 0.000000 BTC |
| pendingRepayment | 0.00 MUSD |
| operatingCash | 697.99 MUSD |
| btcHeldByAccount | 0.048000 BTC |

</details>

## Run 1: first deployment (v1), including the loan close

| Role | Address |
| --- | --- |
| RePay factory v1 | [`0xDA44d73B02627CDD3a0D597CdE4E354493c3f61c`](https://explorer.test.mezo.org/address/0xDA44d73B02627CDD3a0D597CdE4E354493c3f61c) · deployed in [`0x78dc084e1060fe0a…`](https://explorer.test.mezo.org/tx/0x78dc084e1060fe0a60342052847f116790ea76817083c935f197e8f1aaf380c4) (block 16356360) |
| RePay account (demo, now closed) | [`0x76D5a6E6D0D494299A281006Bb5471d50acA388C`](https://explorer.test.mezo.org/address/0x76D5a6E6D0D494299A281006Bb5471d50acA388C) |

### What run 1 demonstrates

1. Account creation, Trove opening (0.045 BTC, debt 2,202 MUSD), and a 500 MUSD customer payment split 150 / 350.
2. Keeper repayment: debt 2,202.00 → 2,052.00 MUSD.
3. One-transaction permit payment; a direct transfer that stayed unclassified until the owner classified it.
4. Owner capital deposited straight to pending repayment (not income).
5. **Minimum-debt boundary.** With 76.50 MUSD pending but ~52 MUSD protocol-valid headroom, the keeper repaid exactly the headroom; debt landed on 2,000.0000 MUSD and the rest stayed pending ("waiting for enough MUSD to close").
6. **Loan closed.** `closeLoan` burned 1,800.9636 MUSD (24.4988 MUSD from pending first, 1,776.4647 MUSD from operating cash) through `closeTrove`, and 0.045000 BTC of collateral came back to the account; the owner then withdrew it.

### Steps

| # | Step | Type | Result | What happened |
| --- | --- | --- | --- | --- |
| 1 | `fund-gas` | On-chain transaction | [success · block 16356444](https://explorer.test.mezo.org/tx/0x0afa801557deb64e44d8b543e16176b34b64f765cf95bb9fc7bd770dfbd181aa) | Owner sent 0.000500 BTC gas to 0x2f7b81940281d513b0DbfebE78005030391e1c02 |
| 2 | `create-account` | On-chain transaction | [success · block 16356447](https://explorer.test.mezo.org/tx/0x257daf885eee262a2b0d8607bc56d478b61543d98c65002a4d406c08ca5d9228) | Owner created a RePay account (30% repayment, 5 min cooldown, 10 MUSD minimum) |
| 3 | `open-loan` | On-chain transaction | [success · block 16356451](https://explorer.test.mezo.org/tx/0x04c2d4b121dab9b89042288d085be9bcf10a242c1bd9446cbe8e2ff6b36f1b42) | Account opened a Mezo Trove: 0.045000 BTC collateral, borrowed 2,000.00 MUSD |
| 4 | `read-after-open` | Read-only call | block 16356452 | Account state after opening |
| 5 | `fund-customer-gas` | On-chain transaction | [success · block 16356458](https://explorer.test.mezo.org/tx/0x85815fb7887320f445a9d0fc5f26093d912cf6364d9a90fbd0b88fab34140943) | Deployer EOA sent 0.000500 BTC gas to the customer wallet |
| 6 | `fund-customer-musd` | On-chain transaction | [success · block 16356460](https://explorer.test.mezo.org/tx/0xd32b8aa9ded897e5b22c3ab24e175c4ca024153a8ef698936a3a5e99b4ac880a) | Deployer EOA sent 600.00 MUSD of faucet-origin MUSD to the customer wallet (not the RePay account's borrowed funds) |
| 7 | `customer-approve` | On-chain transaction | [success · block 16356464](https://explorer.test.mezo.org/tx/0x1af966c17792ce12c3aa2edd7be7da3c28f58ccd959252b7a6e67ce9b70eca46) | Customer approved exactly 500.00 MUSD for the account |
| 8 | `customer-pay` | On-chain transaction | [success · block 16356465](https://explorer.test.mezo.org/tx/0xde77b62ab0cb943c4fb327394ba977d3593c694540dafd4aa6a7e0e9cf2b24f9) | Customer paid 500.00 MUSD with reference INV-2026-001 |
| 9 | `read-after-pay` | Read-only call | block 16356467 | Account state after payment |
| 10 | `keeper-execute` | On-chain transaction | [success · block 16356472](https://explorer.test.mezo.org/tx/0xa7262c8ff8e28c303fdddf89b588b9bb5e1f07980297b51f6be34f426f5c9842) | Separate keeper wallet called executeRepayment (simulated first); 150 MUSD of pending allocation repaid against the account's Trove |
| 11 | `unauthorized-simulation` | Simulation (eth_call) | — | Customer attempted withdrawOperating; contract rejected it |
| 12 | `unauthorized-transaction` | On-chain transaction | [reverted · block 16356477](https://explorer.test.mezo.org/tx/0x21b086fbefd571019cbdbaa0a967997e423a44e60cc799323b1c06804646e58a) | Customer sent setPolicy on-chain; it reverted with NotOwner (policy unchanged) |
| 13 | `read-after-repay` | Read-only call | block 16356478 | Account state read |
| 14 | `customer-pay-permit` | On-chain transaction | [success · block 16356848](https://explorer.test.mezo.org/tx/0xf0b49d80c2b0b4e02b4970e9d91fb778a6b1fe6c7bcdcf6c056319b5285dff3b) | Customer paid 50.00 MUSD in one transaction using an EIP-2612 permit (ref INV-2026-002) |
| 15 | `direct-transfer` | On-chain transaction | [success · block 16356850](https://explorer.test.mezo.org/tx/0x1756b435bfcf1bbfdf7b6aebc08c9e0941a0e1e13627d02fa84ca16282bec6a5) | Plain ERC-20 transfer of 5.00 MUSD to the account (arrives as unclassified, not income) |
| 16 | `read-after-direct-transfer` | Read-only call | block 16356850 | Direct transfer shows as unclassified; income unchanged |
| 17 | `classify-revenue` | On-chain transaction | [success · block 16356855](https://explorer.test.mezo.org/tx/0x4944e7b491cd465132aa4c90078f9f56563154d97573aeb61b479eca63c4551b) | Owner classified 5.00 MUSD of the direct transfer as customer revenue (split by policy) |
| 18 | `owner-approve-capital` | On-chain transaction | [success · block 16356857](https://explorer.test.mezo.org/tx/0xf0dc863d7a0d495d6045f2483eacd347ab31d8fda6a6b93034cb83291b06bc29) | Owner approved 60.00 MUSD capital |
| 19 | `owner-capital-to-repayment` | On-chain transaction | [success · block 16356858](https://explorer.test.mezo.org/tx/0x783533636b7bbf086309a812f1087a9c73284506e1d85ef0efa46cc887cac7f7) | Owner deposited 60.00 MUSD of capital (not income) directly into pending repayment |
| 20 | `read-after-capital` | Read-only call | block 16356859 | Pending repayment now exceeds the protocol's repayable headroom |
| 21 | `keeper-execute-capped` | On-chain transaction | [success · block 16356863](https://explorer.test.mezo.org/tx/0x72905efeb0fe65e21f4ac3b1928c9f2c4ccd50d1f683020c16f02686968be9a1) | Keeper repayment capped by Mezo's minimum net debt: 76.50 MUSD pending, only the protocol-valid 52.0011 MUSD repaid (amount computed in-block incl. accrued interest); remainder stays pending |
| 22 | `read-at-minimum-debt` | Read-only call | block 16356866 | Account state read |
| 23 | `read-at-minimum-debt-after-cooldown` | Read-only call | block 16356911 | Account state read |
| 24 | `read-waiting-to-close` | Read-only call | block 16357065 | Account state read |
| 25 | `owner-close-loan` | On-chain transaction | [success · block 16722518](https://explorer.test.mezo.org/tx/0xc7a450e0148976cffc356e8f7b54af3bfc4ef571265dfd6593624d2fa511493f) | Owner closed the account's Trove (BorrowerOperations.closeTrove); pending repayment used first, then operating cash |
| 26 | `read-after-close` | Read-only call | — | Account state after closing the loan |
| 27 | `owner-withdraw-btc` | On-chain transaction | [success · block 16722523](https://explorer.test.mezo.org/tx/0x5d6e09182836dc457f3b6d0d677f9a18b05dd2d80b1b088ce0975b8ae28d228a) | Owner withdrew 0.045000 BTC (returned collateral) from the account to the owner wallet |

### Recorded state

<details><summary><code>create-account</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| account | 0x76D5a6E6D0D494299A281006Bb5471d50acA388C |
| owner | 0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB |

</details>

<details><summary><code>open-loan</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| borrowingFee | 2.0000 MUSD |
| projectedTotalDebt | 2,202.0000 MUSD |
| projectedCR | 164.54% |

</details>

<details><summary><code>read-after-open</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16356452 |
| loanStatus | active |
| debt | 2,202.0000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 164.53% |
| btcPrice | 80,512.00 MUSD |
| pendingRepayment | 0.00 MUSD |
| operatingCash | 2,000.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 0.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 202.00 MUSD |
| previewStatus | NothingPending |
| previewAmount | 0.00 MUSD |

</details>

<details><summary><code>customer-pay</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| paymentId | 1 |
| toRepayment | 150.00 MUSD |
| toOperating | 350.00 MUSD |

</details>

<details><summary><code>read-after-pay</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16356467 |
| loanStatus | active |
| debt | 2,202.0000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 164.52% |
| btcPrice | 80,505.77 MUSD |
| pendingRepayment | 150.00 MUSD |
| operatingCash | 2,350.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 500.00 MUSD |
| totalRepaid | 0.00 MUSD |
| maxRepayable | 202.00 MUSD |
| previewStatus | Ready |
| previewAmount | 150.00 MUSD |

</details>

<details><summary><code>keeper-execute</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| executor | 0x2f7b81940281d513b0DbfebE78005030391e1c02 |
| amount | 150.00 MUSD |
| debtBefore | 2,202.0000 MUSD (2202000060009597885118 wei) |
| debtAfter | 2,052.0000 MUSD (2052000060009597885118 wei) |

</details>

<details><summary><code>unauthorized-simulation</code> (simulation (eth_call))</summary>

| Field | Value |
| --- | --- |
| error | NotOwner() |

</details>

<details><summary><code>unauthorized-transaction</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| gasUsed | 60000 of 120000 limit (not out-of-gas) |
| revertData | 0x30cd7471 = NotOwner() (eth_call replay at block 16356476 from the customer) |

</details>

<details><summary><code>read-after-repay</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16356478 |
| loanStatus | active |
| debt | 2,052.0000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 176.55% |
| btcPrice | 80,507.46 MUSD |
| pendingRepayment | 0.00 MUSD |
| operatingCash | 2,350.00 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 500.00 MUSD |
| totalRepaid | 150.00 MUSD |
| maxRepayable | 52.00 MUSD |
| previewStatus | NothingPending |
| previewAmount | 0.00 MUSD |

</details>

<details><summary><code>customer-pay-permit</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| paymentId | 2 |
| toRepayment | 15.00 MUSD |
| toOperating | 35.00 MUSD |

</details>

<details><summary><code>read-after-direct-transfer</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16356850 |
| loanStatus | active |
| debt | 2,052.0010 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 176.24% |
| btcPrice | 80,365.87 MUSD |
| pendingRepayment | 15.00 MUSD |
| operatingCash | 2,385.00 MUSD |
| unclassified | 5.00 MUSD |
| totalIncome | 550.00 MUSD |
| totalRepaid | 150.00 MUSD |
| maxRepayable | 52.00 MUSD |
| previewStatus | Ready |
| previewAmount | 15.00 MUSD |

</details>

<details><summary><code>read-after-capital</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16356859 |
| loanStatus | active |
| debt | 2,052.0011 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 176.30% |
| btcPrice | 80,396.82 MUSD |
| pendingRepayment | 76.50 MUSD |
| operatingCash | 2,388.50 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 555.00 MUSD |
| totalRepaid | 150.00 MUSD |
| maxRepayable | 52.00 MUSD |
| previewStatus | Ready |
| previewAmount | 52.00 MUSD |

</details>

<details><summary><code>keeper-execute-capped</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| previewedAmount | 52001111468590830799 wei |
| simulatedAmount | 52001114069602563503 wei |
| executedAmount | 52001118621373095735 wei |
| debtBefore | 2052001118621373095735 wei |
| debtAfter | 2000000000000000000000 wei (= minNetDebt 1800 + gas compensation 200) |

</details>

<details><summary><code>read-at-minimum-debt</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16356866 |
| loanStatus | active |
| debt | 2,000.0000 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 180.87% |
| btcPrice | 80,388.33 MUSD |
| pendingRepayment | 24.49 MUSD |
| operatingCash | 2,388.50 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 555.00 MUSD |
| totalRepaid | 202.00 MUSD |
| maxRepayable | 0.00 MUSD |
| previewStatus | Cooldown |
| previewAmount | 0.00 MUSD |

</details>

<details><summary><code>read-at-minimum-debt-after-cooldown</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16356911 |
| loanStatus | active |
| debt | 2,000.0001 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 180.84% |
| btcPrice | 80,375.55 MUSD |
| pendingRepayment | 24.49 MUSD |
| operatingCash | 2,388.50 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 555.00 MUSD |
| totalRepaid | 202.00 MUSD |
| maxRepayable | 0.00 MUSD |
| previewStatus | Cooldown |
| previewAmount | 0.00 MUSD |

</details>

<details><summary><code>read-waiting-to-close</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| block | 16357065 |
| loanStatus | active |
| debt | 2,000.0005 MUSD |
| collateral | 0.045000 BTC |
| collateralRatio | 180.76% |
| btcPrice | 80,340.93 MUSD |
| pendingRepayment | 24.49 MUSD |
| operatingCash | 2,388.50 MUSD |
| unclassified | 0.00 MUSD |
| totalIncome | 555.00 MUSD |
| totalRepaid | 202.00 MUSD |
| maxRepayable | 0.00 MUSD |
| previewStatus | AtMinimumDebt |
| previewAmount | 0.00 MUSD |

</details>

<details><summary><code>owner-close-loan</code> (on-chain transaction)</summary>

| Field | Value |
| --- | --- |
| debtRepaid | 1,800.9636 MUSD |
| fromPending | 24.4988 MUSD |
| fromOperating | 1,776.4647 MUSD |
| collateralReturned | 0.045000 BTC |

</details>

<details><summary><code>read-after-close</code> (read-only call)</summary>

| Field | Value |
| --- | --- |
| loanStatus | closedByOwner |
| debt | 0.0000 MUSD |
| collateral | 0.000000 BTC |
| pendingRepayment | 0.00 MUSD |
| operatingCash | 612.03 MUSD |
| btcHeldByAccount | 0.045000 BTC |

</details>

## Fork simulation (not live evidence)

`pnpm contracts:fork` runs the full flow and the collateral guard against the real Mezo testnet
bytecode on a local fork. One component is **substituted**: Mezo's BTC price oracle is a chain
precompile (`0x7b7c…0015`) that local EVMs cannot execute (`EvmError: NotActivated`), so the fork
test mocks only its `latestRoundData()`/`decimals()`. The guard fork test drops the mocked price to
62,000 and shows `protect` taking the real Trove from 142.9% to 180.0%. The auto-close fork test has a
separate keeper address call `executeClose` on a real Trove funded entirely by a customer payment.

## Local test suites (not live evidence)

| Suite | Command | Result at time of writing |
| --- | --- | --- |
| Foundry unit + fuzz + invariant | `pnpm contracts:test` | 89 passed (81 unit/fuzz incl. guard, auto-close and permission matrix, 8 invariants) |
| Foundry fork (real Mezo bytecode, mocked oracle) | `pnpm contracts:fork` | 3 passed |
| SDK (Vitest) | `pnpm --filter @repay/sdk test` | 22 passed |
| Keeper (Vitest) | `pnpm --filter @repay/keeper test` | 10 passed |
| Web unit (Vitest) | `pnpm --filter @repay/web test` | 10 passed |
| Browser (Playwright, desktop + mobile) | `pnpm --filter @repay/web e2e` | see `docs/DEPLOYMENTS.md` |

## Source verification

- v3 factory: Sourcify **exact match** (creation + runtime): https://repo.sourcify.dev/31611/0x2AF4eB61EFdF3942B71B3f288FB58Cf719087eeb
- v3 account implementation: Sourcify **exact match** (runtime): https://repo.sourcify.dev/31611/0xC5FFc26652d6060CC027d770238FBfFF2d6404Fb
- v2 factory and implementation: Sourcify exact match: https://repo.sourcify.dev/31611/0xceb2223F6F81991E671781A77f8f3469d6FDe56b
- v1 factory and implementation: Sourcify exact match: https://repo.sourcify.dev/31611/0xDA44d73B02627CDD3a0D597CdE4E354493c3f61c
- Blockscout (explorer.test.mezo.org) does not show Sourcify results; its own verification API did not mark v1 verified at time of writing.
