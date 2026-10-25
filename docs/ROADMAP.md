# Roadmap

Ordered by what most increases real usefulness. None of this is built yet.

1. **Hosted keeper with public status (next wave).** An always-on keeper with redundancy, wired to the app's
   Automation page through `NEXT_PUBLIC_KEEPER_STATUS_URL`, plus an optional bounded keeper tip
   funded by the owner (capped per execution, enforced on-chain).
2. **Owner-approved auto-close.** A policy flag that lets keepers close the loan when the account
   holds enough MUSD, so income can retire the final minimum-debt tranche without a manual step.
   Needs careful testing around recovery mode and collateral destination.
3. **Invoices and receivables.** Off-chain invoice records with on-chain payment references,
   partial payments against one invoice, and accounting exports beyond CSV.
4. **Mezo Passport and smart-account wallets** for owners and payers, and multi-owner (Safe) accounts
   for agencies.
5. **Mainnet**, only after an independent audit and a review of Mezo mainnet parameters.

## Business hypothesis (unvalidated)

Businesses that borrow MUSD against BTC have recurring stablecoin revenue. Tying repayment to that
revenue lowers the effort and discipline needed to pay down debt and reduces time at high loan-to-value.
A future fee could be a small, capped share of repaid amounts. This is a hypothesis: no users, revenue
or traction are claimed.
