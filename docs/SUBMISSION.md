# Submission materials

> Draft for the AKINDO Wave Hack entry. Not submitted. The team must review it, fill the placeholders,
> and submit it themselves (and accept any contest terms themselves).

**Project name:** Mezo RePay

**Short category:** Payments × BTC-backed credit (MUSD)

**Supported track:** _[confirm the exact track name on the AKINDO page: e.g. the MUSD / Mezo integration track]_

**One-sentence description:** Mezo RePay lets a business receive MUSD and automatically route a
chosen share of each customer payment into repaying its own Bitcoin-backed Mezo loan, while keeping
the rest as operating cash.

## Problem

Freelancers and small businesses that borrow MUSD against BTC have to remember, time, and manually
send repayments, competing with every other use of incoming cash. Debt lingers at high loan-to-value
even when revenue is healthy. Payment links don't repay loans, and loan dashboards don't know about
revenue.

## Target users

Freelancers paid in stablecoins; small agencies and studios; Bitcoin-holding founders; businesses
borrowing MUSD against BTC.

## How it works

1. The owner creates a RePay account: a minimal contract only their wallet controls.
2. The account opens and owns a Mezo Trove (BTC collateral, MUSD debt). Borrowed MUSD is operating
   cash, never income.
3. The owner sets a policy: repayment share, operating reserve, min/max per execution, cooldown, pause.
4. Customers pay via a payment link (`pay` with exact approval, or `payWithPermit` in one
   transaction). Each payment is split once: floor(P × share) to pending repayment, the rest to
   operating cash.
5. Anyone (a keeper or the owner) calls `executeRepayment`. The contract computes the protocol-valid
   amount in-block and calls Mezo `repayMUSD` for its own Trove.
6. The dashboard shows real debt, collateral ratio, income, and repayments, with explorer links.

## Exact MUSD / Mezo integration

- Mezo `BorrowerOperations.openTrove / repayMUSD / closeTrove / addColl / withdrawColl / withdrawMUSD /
  claimCollateral`, called by the account contract as the borrower (`msg.sender`).
- `TroveManager.getEntireDebtAndColl` (live debt including accrued interest), `getTroveStatus`,
  `MUSD_GAS_COMPENSATION`; `BorrowerOperations.minNetDebt / getBorrowingFee / musd`; `PriceFeed.fetchPrice`;
  `HintHelpers.getApproxHint` + `SortedTroves.findInsertPosition` for hints; `CollSurplusPool.getCollateral`.
- MUSD ERC-20 + EIP-2612 permit (domain "Mezo USD", version "1", verified on-chain).
- Handles Mezo's 1,800 MUSD minimum net debt, the 200 MUSD gas compensation, interest-first repayment,
  liquidation, redemption, surplus claims, and recovery mode.

## Actual deployment status

- Contracts **deployed to Mezo testnet**; factory `0xDA44d73B02627CDD3a0D597CdE4E354493c3f61c`,
  Sourcify exact match.
- Real end-to-end run on testnet: account → Trove → customer payments (approve and permit) → keeper
  repayments → debt 2,202 → 2,000 MUSD → rejected unauthorized action. See `docs/EVIDENCE.md`.
- Web app: https://mezo-repay.vercel.app (hosted on Vercel, opened and checked).
- Keeper: run live on demand; no always-on public instance yet. Hosting it with public status is planned for the next wave.

## Demo video

`docs/video/mezo-repay-demo.mp4` (4:15): pitch deck with narration, then a live walkthrough of the hosted app and Mezo explorer. Narration is synthesized speech. Upload it to YouTube/Loom yourself if the form needs a link.

## Technologies

Solidity 0.8.24 (london), Foundry (unit, fuzz, invariant, fork tests), OpenZeppelin 5, TypeScript,
Next.js 14, Tailwind CSS, wagmi 2, viem 2, TanStack Query 5, Radix UI, Playwright, Vitest, Slither, Sourcify.

## Existing vs newly built

- **Existing (used, not modified):** Mezo MUSD protocol contracts on testnet; OpenZeppelin Contracts;
  forge-std; open-source libraries listed in package files.
- **Newly built for this hackathon:** RePayAccount and factory contracts and all tests; the SDK;
  the keeper and demo runner; the web app; all documentation.

## Three concrete future milestones

1. Next wave: hosted, redundant keeper with public status and an optional owner-funded, capped keeper tip.
2. Owner-approved auto-close so income can retire the final minimum-debt tranche.
3. Invoice records with partial-payment tracking and accounting exports; then an audit before mainnet.

## Known limitations

Testnet only; not audited (self-review only). Partial repayment stops at Mezo's minimum debt, so a
full close is a manual owner action. No liquidation protection. Keeper is best-effort. Existing
wallet-owned Troves cannot be imported. Payment references are labels, not proof of invoices.

## Team

_[Team name]_ · _[Member names / roles]_ · _[Contact]_

## AI-use disclosure

_[If the hackathon's submission form asks about AI tool use, answer truthfully in that field.]_
