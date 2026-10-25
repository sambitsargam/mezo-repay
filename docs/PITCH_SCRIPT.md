# Two-minute pitch script

Centered on the real demo. Times are approximate.

**0:00 Problem (15 s).** "If you hold Bitcoin and run a business, Mezo lets you borrow MUSD against it
instead of selling. But repaying is a chore: you have to remember, decide how much, and send it,
while customer revenue arrives in the same wallet you spend from."

**0:15 Product (15 s).** "Mezo RePay lets your income pay down your Bitcoin loan. You choose a share,
say 30%, and every customer payment is split once: 30% set aside for the loan, 70% kept as operating cash."

**0:30 Live account (35 s).** *[Screen: /app?view=0x76D5…388C]* "This is a real account on Mezo testnet.
The account contract itself owns this Trove: 0.045 BTC collateral. A customer, from a separate wallet,
paid 500 MUSD through a payment link. 150 went to pending repayment automatically. Then a keeper wallet
with no special permissions called one function, and the debt dropped from 2,202 to 2,052."
*[Click the repayment row → Mezo explorer]*

**1:05 Safety (25 s).** *[Screen: Automation page, "can / cannot"]* "The keeper can only repay this
account's own loan, from money already set aside, within the owner's policy. It can't borrow, withdraw,
change policy or take a fee. Here's a customer trying to change the policy on-chain: reverted, NotOwner."
*[explorer: reverted tx]*

**1:30 Mezo detail (15 s).** "Mezo requires a minimum debt. When pending repayment exceeded what's
allowed, RePay repaid exactly down to the 2,000 MUSD floor and kept the rest pending. That's why the
dashboard says *Waiting for enough MUSD to close the loan*."

**1:45 Close (15 s).** "Contracts are deployed and verified, with unit, fuzz, invariant and fork tests
and live evidence for every step. Next: a hosted keeper, owner-approved auto-close, and invoices.
Mezo RePay: ordinary income, real repayment."

## Shot list

1. Home page hero (3 s).
2. `/app?view=0x76D5a6E6D0D494299A281006Bb5471d50acA388C`: dashboard stats and allocation (10 s).
3. Activity → click `Loan repayment` explorer link → explorer tx page (10 s).
4. `/pay/0x76D5…388C?amount=25&ref=DEMO&chain=31611`: "Verified RePay account" badge (8 s).
5. Automation page: "What a keeper can and cannot do" (8 s).
6. Explorer: the reverted `setPolicy` tx `0x21b086fb…e58a` (5 s).
7. Loan page: "Waiting for enough MUSD to close the loan" notice (6 s).
8. Terminal: `pnpm contracts:test` summary line (5 s).

## Recording procedure

1. Use https://mezo-repay.vercel.app (or `pnpm build && pnpm --filter @repay/web start` locally).
2. Browser at 1440×900, zoom 100%, light OS theme, no extensions visible.
3. Record with the OS screen recorder (macOS: Shift-Cmd-5 → "Record selected portion") at 1440×900.
4. Read the script while following the shot list; keep each shot on screen until the line finishes.
5. Trim to ≤ 2:00 and export 1080p MP4. Upload it yourself and add the link to the submission.
   No video link is included in this repository until a real recording exists.
