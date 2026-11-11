# Submission materials

> Copy-ready text for the AKINDO form. Not submitted by us. The team submits it and accepts any
> contest terms. Fields marked **(fill)** need a value only the team can confirm.

**Project name:** Mezo RePay

**Category:** DeFi · Payments and BTC-backed credit (MUSD)

**Track:** **(fill)** copy the exact track name from the AKINDO form (the one for building on Mezo / MUSD)

**Links**

- Live app: https://mezo-repay.vercel.app
- Read-only live view of the demo account: https://mezo-repay.vercel.app/app?view=0x97D60Fb479B5E88B2C02A6d97C0d3da9b4A899D7
- Pitch deck: https://mezo-repay.vercel.app/deck (PDF: `docs/deck/mezo-repay-deck.pdf`)
- Code: https://github.com/sambitsargam/mezo-repay
- Evidence (every transaction, with explorer links): `docs/EVIDENCE.md`
- Demo video (1:36): `docs/video/mezo-repay-demo.mp4`, or the uploaded link **(fill if the form needs a URL)**

## Overview (for the form)

Mezo RePay is a working, deployed payments account for businesses that borrow MUSD against bitcoin
on Mezo. A RePay account is a small contract that only the owner's wallet controls, and it **owns the
owner's Mezo Trove**: the account itself calls `BorrowerOperations.openTrove`, `repayMUSD`, `addColl`,
`withdrawColl` and `closeTrove`. Customers pay through a payment link (exact approval or a one-step
EIP-2612 permit). Each payment is split once: a chosen share (for example 30%) goes to pending
repayment, the rest to operating cash. A permissionless keeper applies the pending share to the
Trove within the owner's policy and Mezo's 1,800 MUSD minimum net debt.

New in this wave: a **collateral guard**. When the Trove's collateral ratio falls below the owner's
trigger, anyone (normally the keeper) can call `protect`. It first steers pending MUSD into
repayment, ignoring cooldowns but never touching operating cash. It then tops up collateral from a
BTC buffer the owner reserved in the account, aiming for the owner's target ratio.

This runs on Mezo testnet today. v2 contracts are deployed and Sourcify-verified. A live run with a
separate customer wallet and a separate keeper wallet repaid debt from 2,202 to 2,000 MUSD, and the
guard lifted the ratio from 158.2% to 177.4%. The owner exercised addColl and withdrawColl, and a
v1 Trove was closed live. The web app is hosted, and a scheduled keeper with a public status page
runs on GitHub Actions.

## Problem

Freelancers and small businesses that borrow MUSD against BTC have to remember, size and send
repayments by hand, competing with every other use of incoming cash. Debt lingers at a high
loan-to-value even when revenue is healthy, and nothing watches the collateral ratio when BTC drops.
Payment links don't repay loans, and loan dashboards don't know about revenue.

## Target users

Freelancers paid in stablecoins; small agencies and studios; bitcoin-holding founders; any business
with recurring MUSD revenue and an MUSD loan on Mezo.

## How it works

1. The owner creates a RePay account: a minimal clone that only their wallet controls.
2. The account opens and owns a Mezo Trove (BTC collateral, MUSD debt). Borrowed MUSD is operating
   cash, never income.
3. The owner sets a policy (repayment share, operating reserve, min/max per execution, cooldown,
   pause) and optionally a guard (trigger and target ratio, plus a BTC buffer).
4. Customers pay through a payment link (`pay` with exact approval, or `payWithPermit` in one
   transaction). Each payment splits once: floor(P × share) to pending repayment, the rest to
   operating cash. Direct transfers stay *unclassified* until the owner classifies them.
5. The keeper (or anyone) calls `protect` when the guard can act, otherwise `executeRepayment`. The
   contract computes every amount in the executing block and calls Mezo for its own Trove.
6. The dashboard shows real debt, collateral ratio, guard state, income and repayments, with explorer
   links for every transaction.

## Revenue model

Planned, not in the deployed testnet contracts (fees there are zero).

| Fee | Who pays | How much | Why they pay |
| --- | --- | --- | --- |
| Repayment fee | The account owner (the business) | 0.25% of each automated repayment, capped at 5 MUSD per execution | Debt goes down without anyone remembering to do it. Charged only when debt actually falls. |
| Guard fee | The account owner | 0.5% of the value moved by `protect` (MUSD repaid + BTC added at oracle price), capped at 10 MUSD | Someone watches the ratio 24/7 and acts below the trigger. The alternative is liquidation, which costs the collateral above the debt. |
| Payers | Nobody else | 0 | Customers pay invoices normally; adding a fee would hurt adoption. |

Worked example: a studio earning 10,000 MUSD a month with a 30% repayment share routes 3,000 MUSD to
its loan. At about 150 MUSD per execution that is roughly 20 repayments, so about 7.50 MUSD a month
(0.075% of revenue). Keeper gas on Mezo is a fraction of a cent per call, so the fee covers
operations with margin. Fees would be taken from the pending allocation at execution, with an
immutable cap set in the factory, so a fee change could never touch operating cash. This is a
hypothesis: we have no paying users yet.

## Exact MUSD / Mezo integration

- `BorrowerOperations.openTrove / repayMUSD / closeTrove / addColl / withdrawColl / withdrawMUSD /
  claimCollateral`, called by the account contract as the borrower (`msg.sender`).
- `TroveManager.getEntireDebtAndColl` (live debt including accrued interest), `getTroveStatus`,
  `MUSD_GAS_COMPENSATION`; `BorrowerOperations.minNetDebt / getBorrowingFee / musd / priceFeed`;
  `PriceFeed.fetchPrice` (guard ratio, read on-chain); `HintHelpers.getApproxHint` +
  `SortedTroves.findInsertPosition` for hints; `CollSurplusPool.getCollateral`.
- MUSD ERC-20 + EIP-2612 permit (domain "Mezo USD", version "1", verified on-chain).
- Handles Mezo's minimum net debt, the 200 MUSD gas compensation, interest-first repayment,
  liquidation, redemption, surplus claims and recovery mode.

## Deployment status

- **v2 contracts on Mezo testnet**: factory `0xceb2223F6F81991E671781A77f8f3469d6FDe56b`,
  implementation `0xEE5b9ABFd95deb642bc03089b43dA0C5e47D1A56`, Sourcify exact match.
- **Live run, v2**: account `0x97D60Fb479B5E88B2C02A6d97C0d3da9b4A899D7` opened a Trove (0.045 BTC,
  debt 2,202 MUSD). A separate customer paid 500 + 100 (permit) + 100 MUSD. The keeper repaid 100
  (policy cap), then `protect` repaid 102 down to Mezo's 2,000 floor and added 0.003 BTC from the
  buffer (158.2% → 177.4%). The owner ran `addColl`/`withdrawColl`. A non-owner `setPolicy` was mined
  and reverted.
- **Live run, v1**: payments, two keeper repayments, a minimum-debt cap, and a full `closeLoan` that
  burned 1,800.96 MUSD and returned 0.045 BTC.
- **Not exercised live**: `claimCollateralSurplus` needs a liquidation or redemption of our own
  Trove, which can't honestly be caused on a shared testnet. It is unit-tested.
- **Web app**: https://mezo-repay.vercel.app (Vercel).
- **Keeper**: scheduled every 10 minutes on GitHub Actions (`.github/workflows/keeper.yml`); public
  status at https://mezo-repay.vercel.app/api/keeper/status, built only from chain data and the
  public Actions API.

## Demo video

`docs/video/mezo-repay-demo.mp4` (1:36): the live on-chain flow (account, Trove, customer payment,
keeper repayment, collateral guard) in the hosted app and Mezo explorer. Narration is synthesized
speech. Upload it to YouTube or Loom if the form needs a link.

## Technologies

Solidity 0.8.24 (london), Foundry (unit, fuzz, invariant and fork tests), OpenZeppelin 5, TypeScript,
Next.js 14, Tailwind CSS, wagmi 2, viem 2, TanStack Query 5, Radix UI, Playwright, Vitest, Slither,
Sourcify, GitHub Actions.

## Existing vs newly built

- **Existing (used, not modified):** Mezo MUSD protocol contracts on testnet; OpenZeppelin Contracts;
  forge-std; open-source libraries listed in package files.
- **Newly built for this hackathon:** RePayAccount and factory contracts (v1, v2 with the guard) and
  all tests; the SDK; the keeper, its hosted schedule and status route; the demo runner; the web app;
  all documentation.

## Three concrete future milestones

1. Fees as specified above, with immutable caps, plus a second independent keeper operator.
2. Owner-approved auto-close so income can retire the final minimum-debt tranche.
3. Invoice records with partial payments and accounting exports; external audit before mainnet.

## Known limitations

Testnet only and not audited (self-review only). Partial repayment stops at Mezo's minimum debt, so
the final close is a manual owner action. The guard reduces liquidation risk but cannot prevent it in
a fast price drop, and it only uses pending MUSD and the buffer the owner funds. Scheduled GitHub
runs can start late. Existing wallet-owned Troves cannot be imported. Payment references are labels,
not proof of invoices. Real demand is unproven: so far the only payers are our own test wallets.

## Team

**(fill)** Team name · members and roles · contact

## AI-use disclosure

**(fill)** If the form asks about AI tool use, answer truthfully in that field.
