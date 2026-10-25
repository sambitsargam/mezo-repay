# Evidence

Everything below comes from `docs/evidence/live-run.json`, which the demo runner
(`services/keeper/src/demo.ts`) and keeper append to as steps run on **Mezo testnet (chain 31611)**.
Regenerate this file with `node scripts/render-evidence.mjs`.

Each row is labeled with its type:

- **On-chain transaction**: mined on Mezo testnet; follow the explorer link.
- **Read-only call**: state read with `eth_call` at the stated block; no transaction.
- **Simulation**: `eth_call` of a write, showing what the contract would do; no transaction.

Local tests (Foundry, Vitest, Playwright) are listed separately at the end and are **not** live evidence.

## Participants

| Role | Address |
| --- | --- |
| RePay factory | [`0xDA44d73B02627CDD3a0D597CdE4E354493c3f61c`](https://explorer.test.mezo.org/address/0xDA44d73B02627CDD3a0D597CdE4E354493c3f61c) |
| RePay account (demo) | [`0x76D5a6E6D0D494299A281006Bb5471d50acA388C`](https://explorer.test.mezo.org/address/0x76D5a6E6D0D494299A281006Bb5471d50acA388C) |
| Owner / deployer wallet | [`0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB`](https://explorer.test.mezo.org/address/0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB) |
| Customer wallet (separate key) | [`0xED7a26AD75c224728EBA1059BE7E1864c2Fab1ed`](https://explorer.test.mezo.org/address/0xED7a26AD75c224728EBA1059BE7E1864c2Fab1ed) |
| Keeper wallet (separate key, no authority) | [`0x2f7b81940281d513b0DbfebE78005030391e1c02`](https://explorer.test.mezo.org/address/0x2f7b81940281d513b0DbfebE78005030391e1c02) |
| Factory deployment tx | [`0x78dc084e1060fe0a…`](https://explorer.test.mezo.org/tx/0x78dc084e1060fe0a60342052847f116790ea76817083c935f197e8f1aaf380c4) (block 16356360) |

## Steps

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

## Recorded state

### create-account (on-chain transaction)

| Field | Value |
| --- | --- |
| account | 0x76D5a6E6D0D494299A281006Bb5471d50acA388C |
| owner | 0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB |

### open-loan (on-chain transaction)

| Field | Value |
| --- | --- |
| borrowingFee | 2.0000 MUSD |
| projectedTotalDebt | 2,202.0000 MUSD |
| projectedCR | 164.54% |

### read-after-open (read-only call)

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

### customer-pay (on-chain transaction)

| Field | Value |
| --- | --- |
| paymentId | 1 |
| toRepayment | 150.00 MUSD |
| toOperating | 350.00 MUSD |

### read-after-pay (read-only call)

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

### keeper-execute (on-chain transaction)

| Field | Value |
| --- | --- |
| executor | 0x2f7b81940281d513b0DbfebE78005030391e1c02 |
| amount | 150.00 MUSD |
| debtBefore | 2,202.0000 MUSD (2202000060009597885118 wei) |
| debtAfter | 2,052.0000 MUSD (2052000060009597885118 wei) |

### unauthorized-simulation (simulation (eth_call))

| Field | Value |
| --- | --- |
| error | NotOwner() |

### unauthorized-transaction (on-chain transaction)

| Field | Value |
| --- | --- |
| gasUsed | 60000 of 120000 limit (not out-of-gas) |
| revertData | 0x30cd7471 = NotOwner() (eth_call replay at block 16356476 from the customer) |

### read-after-repay (read-only call)

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

### customer-pay-permit (on-chain transaction)

| Field | Value |
| --- | --- |
| paymentId | 2 |
| toRepayment | 15.00 MUSD |
| toOperating | 35.00 MUSD |

### read-after-direct-transfer (read-only call)

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

### read-after-capital (read-only call)

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

### keeper-execute-capped (on-chain transaction)

| Field | Value |
| --- | --- |
| previewedAmount | 52001111468590830799 wei |
| simulatedAmount | 52001114069602563503 wei |
| executedAmount | 52001118621373095735 wei |
| debtBefore | 2052001118621373095735 wei |
| debtAfter | 2000000000000000000000 wei (= minNetDebt 1800 + gas compensation 200) |

### read-at-minimum-debt (read-only call)

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

### read-at-minimum-debt-after-cooldown (read-only call)

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

### read-waiting-to-close (read-only call)

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

## What this demonstrates

1. **Account creation.** A RePay account was created by the factory with the owner wallet (`create-account`).
2. **Real Mezo Trove owned by the account.** `openLoan` deposited 0.045 BTC through `BorrowerOperations.openTrove`; debt 2,202 MUSD (2,000 + 0.1% fee + 200 gas compensation).
3. **Borrowed MUSD is not income.** After opening, `totalIncome` = 0 and the 2,000 MUSD sits in operating cash.
4. **Tracked customer payment from a separate wallet.** The customer approved exactly 500 MUSD and called `pay`: 150 to pending repayment, 350 to operating (30%).
5. **Keeper repayment changed real protocol debt.** A third wallet with no authority called `executeRepayment`: debt 2,202.00 → 2,052.00 MUSD, CR 164.5% → 176.6%.
6. **Rejected unauthorized action.** The customer's `withdrawOperating` simulation reverted with `NotOwner()`, and its on-chain `setPolicy` transaction was mined and reverted.
7. **One-transaction permit payment.** `payWithPermit` with an EIP-2612 signature over exactly 50 MUSD.
8. **Direct transfer stays unclassified.** A plain ERC-20 transfer of 5 MUSD did not change `totalIncome` until the owner classified it as revenue.
9. **Minimum-debt boundary handled.** With 76.50 MUSD pending but only ~52 MUSD protocol-valid headroom, the keeper repaid exactly the headroom. Debt landed on **2,000.0000 MUSD** (1,800 minimum net debt + 200 gas compensation), the remainder stayed pending, and status became "waiting for enough MUSD to close".
10. **Interest drift resolved on-chain.** The previewed amount (52.001111) and the executed amount (52.001119) differ by interest accrued between blocks; the contract computed it in the executing block.

## Fork simulation (not live evidence)

`MEZO_FORK=1 forge test --match-contract MezoForkTest -vv` runs the full flow against the real
Mezo testnet bytecode on a local fork. One component is **substituted**: Mezo's BTC price oracle is a
chain precompile (`0x7b7c…0015`) that local EVMs cannot execute (`EvmError: NotActivated`), so the
fork test mocks only its `latestRoundData()`/`decimals()` at a realistic price.

## Local test suites (not live evidence)

| Suite | Command | Result at time of writing |
| --- | --- | --- |
| Foundry unit + fuzz + invariant | `pnpm contracts:test` | 61 tests passed (55 unit/fuzz, 6 invariants) |
| Foundry fork (real Mezo bytecode, mocked oracle) | `pnpm contracts:fork` | 1 passed |
| SDK (Vitest) | `pnpm --filter @repay/sdk test` | 18 passed |
| Keeper (Vitest) | `pnpm --filter @repay/keeper test` | 6 passed |
| Web unit (Vitest) | `pnpm --filter @repay/web test` | 7 passed |
| Browser (Playwright, desktop + mobile) | `pnpm --filter @repay/web e2e` | 46 passed |

## Source verification

- Factory: Sourcify **exact match** (creation + runtime): https://repo.sourcify.dev/31611/0xDA44d73B02627CDD3a0D597CdE4E354493c3f61c
- Account implementation: Sourcify **exact match** (runtime): https://repo.sourcify.dev/31611/0x469C9d8Fa5c8c8C8334f39ae2e52064B9e3DA9DA
- Blockscout (explorer.test.mezo.org): verification submitted via API; the explorer had not marked the contracts verified at time of writing. Local `forge inspect` bytecode, including the metadata hash, matches the deployed code byte for byte.
