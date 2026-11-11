# Roadmap

## Done in wave 2

- **Collateral guard** (v2 contracts): `protect` steers pending MUSD into repayment and tops up
  collateral from an owner-funded BTC buffer when the ratio falls below the owner's trigger. Run live.
- **Hosted keeper**: GitHub Actions every 10 minutes, with public status at `/api/keeper/status`
  built from chain data.
- **Live close, addColl and withdrawColl** on Mezo testnet (see `EVIDENCE.md`).

## Next

Ordered by what most increases real usefulness.

1. **Real outside users.** Onboard a handful of businesses and payers on testnet and record what they
   do and where they get stuck. So far every payer has been our own test wallet.
2. **Fees with immutable caps** (see `SUBMISSION.md`, revenue model): 0.25% of automated repayments
   capped at 5 MUSD, 0.5% of guard actions capped at 10 MUSD, taken from the pending allocation only.
3. **A second keeper operator** on separate infrastructure, so a delayed GitHub schedule is not a
   single point of failure for the guard.
4. **Owner-approved auto-close.** A policy flag that lets keepers close the loan when the account
   holds enough MUSD, so income can retire the final minimum-debt tranche without a manual step.
5. **Invoices and receivables**: invoice records with on-chain references, partial payments and
   accounting exports beyond CSV.
6. **Mezo Passport and smart-account wallets**, and multi-owner (Safe) accounts for agencies.
7. **Mainnet**, only after an independent audit and a review of Mezo mainnet parameters.

## Business hypothesis (unvalidated)

Businesses that borrow MUSD against BTC have recurring stablecoin revenue. Tying repayment to that
revenue, and watching the collateral ratio for them, lowers the effort and discipline needed to pay
down debt and reduces time at high loan-to-value. The revenue model in `SUBMISSION.md` is a plan;
no users, revenue or traction are claimed.
