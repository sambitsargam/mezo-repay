# Protocol research

Date checked: 2026-10-25

All facts below were checked against official sources **and** the deployed testnet contracts with
read-only `cast call`s. Nothing here was copied from a third-party blog or another submission.

## Sources consulted

| Source | Used for |
| --- | --- |
| https://mezo.org/docs/developers/musd/ | Trove lifecycle, fees, hints, MCR / recovery mode |
| https://mezo.org/docs/developers/musd/musd-redemptions/ | Redemption behavior |
| https://github.com/mezo-org/musd @ `de1ec2af9449f65dec4fb3293f02674446143e87` (2026-10-23) | Contract source, `solidity/artifacts/deployments/matsnet/*.json` deployment records, compiler config |
| `https://rpc.test.mezo.org` | Live on-chain reads (chain id, code, parameters) |
| https://explorer.test.mezo.org | Explorer links |

The developer docs page does not list contract addresses. The authoritative address list used is
the `matsnet` (Mezo testnet) deployment records published in the official `mezo-org/musd` repository,
each cross-checked on-chain.

## Chosen network

Mezo testnet ("matsnet").

- Chain ID: `31611` (verified via `eth_chainId`)
- RPC: `https://rpc.test.mezo.org`
- Native gas currency: BTC (18 decimals)
- Explorer: https://explorer.test.mezo.org
- Mainnet (31612) is **not** used for any writes.

## Verified addresses (Mezo testnet)

| Contract | Proxy address | Implementation (from deployment record) |
| --- | --- | --- |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | not a proxy |
| BorrowerOperations | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` | `0xc05Bf344BD5b58825784326dD3112fB6cC160dcC` |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | `0x9aAB567966983e95536FC460C12266FB0Cc10B07` |
| HintHelpers | `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6` | `0x8adF3f35dBE4026112bCFc078872bcb967732Ea8` |
| SortedTroves | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` | `0x9177DF58A9614b84C8c2F68dF27506AB9a5d0323` |
| PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | `0xec42B37C12b8D73d320f4075A1BCd58B306629c1` |
| CollSurplusPool | `0xB4C35747c26E4aB5F1a7CdC7E875B5946eFa6fa9` | `0x13AF349efde2A7Ff4469EF1f98126FFD57C32806` |
| InterestRateManager | `0xD4D6c36A592A2c5e86035A6bca1d57747a567f37` | `0xAA13B1d9CFFA3F44ab3A8BE0dC8774FB7841459C` |
| ActivePool | `0x143A063F62340DA3A8bEA1C5642d18C6D0F7FF51` | — |
| GasPool | `0x8fa3EF45137C3AFF337e42f98023C1D7dd3666C0` | — |

On-chain checks performed (block ~16,355,985):

- All addresses have deployed code. The proxies are 1,159-byte proxy contracts; the EIP-1967 admin
  slot is populated (`0x987dce74…31bb`), the EIP-1967 implementation slot reads zero, so the
  implementation addresses above come from the official deployment record, not from the slot.
- `BorrowerOperations.musd()` returns `0x118917a4…c503` — the same MUSD token.
- `MUSD.decimals() = 18`, `symbol() = "MUSD"`, `DOMAIN_SEPARATOR()` is present.
  Source: `MUSD is ERC20Permit` (OpenZeppelin) → EIP-2612 `permit` is supported.
- `BorrowerOperations.minNetDebt() = 1800e18` (1,800 MUSD).
- `TroveManager.MUSD_GAS_COMPENSATION() = 200e18` (200 MUSD).
- `BorrowerOperations.getBorrowingFee(1000e18) = 1e18` → 0.1% borrowing fee.
- `TroveManager.MCR() = 1.1e18` (110%).
- `InterestRateManager.interestRate() = 100` (basis points → 1% simple annual interest).
- `PriceFeed.fetchPrice()` ≈ `80,536e18` (BTC/USD, 18 decimals) at the time of checking.
- `TroveManager.checkRecoveryMode(price) = false`.

## Compiler / EVM

MUSD is compiled with Solidity `0.8.24`, `evmVersion: "london"` (`solidity/hardhat.config.ts`).
RePay contracts use the same compiler version and EVM target to avoid unsupported opcodes (no `PUSH0`,
no transient storage, no `MCOPY`).

## Relevant protocol constraints (from source, BorrowerOperations.sol)

1. **Sender semantics.** `openTrove`, `addColl`, `withdrawColl`, `withdrawMUSD`, `repayMUSD`,
   `closeTrove`, `claimCollateral` all act on `msg.sender` as the borrower. There is no `tx.origin`
   or EOA check, so **a contract can own and manage a Trove**. A RePay account contract therefore owns
   its own Trove; an existing wallet-owned Trove cannot be moved into an account.
2. **Collateral is native BTC** passed as `msg.value`. Collateral is returned with a plain
   `call{value: amount}("")` from ActivePool / CollSurplusPool, so the account needs `receive()`.
3. **Opening.** `netDebt = requested + borrowingFee` must be `>= minNetDebt`. Composite debt adds the
   200 MUSD gas compensation, which is minted to the GasPool, not to the borrower. ICR is computed on
   composite debt and must be ≥ MCR (or ≥ CCR in recovery mode). The requested amount is minted to
   the borrower.
4. **Interest.** Simple interest on principal, rate fixed at open (refinanceable).
   `TroveManager.getEntireDebtAndColl` includes interest accrued up to `block.timestamp`, so a contract
   can compute exact current debt inside the same transaction that repays.
5. **Partial repayment** (`repayMUSD`): payment is applied to accrued interest first, then principal
   (`InterestRateMath.calculateDebtAdjustment`). Requirements:
   - `(totalDebt - gasComp) - amount >= minNetDebt`
   - `amount <= totalDebt - gasComp`
   - caller MUSD balance ≥ amount.
   MUSD is **burned directly** from the caller by BorrowerOperations (it is on the MUSD burn list);
   no ERC-20 approval is required.
   ⇒ Maximum protocol-valid partial repayment = `totalDebt - gasComp - minNetDebt` (0 if negative).
6. **Close** (`closeTrove`): burns `totalDebt - gasComp` from the caller (gas compensation is burned
   from the GasPool), returns all collateral to the caller. Blocked in recovery mode, and the new TCR
   must remain above CCR.
7. **Liquidation / redemption** close the Trove with status `closedByLiquidation` (3) or
   `closedByRedemption` (4). Any surplus collateral is claimable by the borrower through
   `BorrowerOperations.claimCollateral()`; `CollSurplusPool.getCollateral(account)` shows it.
8. **Hints.** `HintHelpers.getApproxHint(nicr, numTrials, seed)` + `SortedTroves.findInsertPosition`.
   Invalid hints fall back to a list search inside SortedTroves (more gas, not a revert), so hints can
   safely be supplied by an untrusted keeper.
9. **Recovery mode** (TCR < 150%) disallows debt increases that do not improve ICR and disallows close
   when MUSD can still be minted; pure repayments are allowed.
10. **MUSD transfer rules.** Transfers to `address(0)` or to the MUSD contract itself revert.
11. **Price feed** reverts if the oracle is stale (`MAX_PRICE_DELAY`). All trove operations call it,
    so a stale oracle blocks repayments; RePay surfaces this as an RPC/protocol error and keeps funds
    pending.

## Practical sizing for the demo Trove

With minNetDebt = 1,800 and fee 0.1%, any partial repayment requires net debt above 1,800. The demo
opens a Trove borrowing **2,400 MUSD** (net debt 2,402.4, total debt 2,602.4), which leaves up to
~602 MUSD of repayable headroom. At a BTC price of ~80.5k a 200% collateral ratio needs
≈ 0.065 BTC of collateral.

## Conflicts between documentation and deployed behavior

- The developer docs describe the borrowing fee as 0.1% "governable"; on-chain value matches (0.1%).
- The docs do not state the minimum debt; on-chain it is 1,800 MUSD (the README of older Liquity forks
  often states 2,000 — not applicable here).
- EIP-1967 implementation slot is zero on the proxies although the admin slot is set. Implementation
  addresses are taken from the official deployment record; behavior was verified by calling the proxy.

## Unresolved assumptions

- Testnet parameters (rate, fee, min debt) are governable and may change; the app reads them live
  instead of hard-coding them.
- The faucet amount per request is unknown; demo sizing assumes ≥ 0.07 BTC can be obtained.
- Fork testing via anvil assumes no Mezo-specific precompile is touched by the MUSD trove path
  (source review found only plain native-value transfers and a Chainlink-style oracle).
