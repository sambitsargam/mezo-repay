# Two-minute pitch script

Centered on the real demo. Times are approximate.

**0:00 Problem (15 s).** "If you hold Bitcoin and run a business, Mezo lets you borrow MUSD against it
instead of selling. But repaying is a chore: you have to remember, decide how much, and send it,
while customer revenue arrives in the same wallet you spend from."

**0:15 Product (15 s).** "Mezo RePay lets your income pay down your Bitcoin loan. You choose a share,
say 30%, and every customer payment is split once: 30% set aside for the loan, 70% kept as operating cash."

**0:30 Live account (30 s).** *[Screen: /app?view=0x3B89…4aAe]* "This is a real account on Mezo testnet.
The account contract itself owns this Trove. A customer, from a separate wallet, paid 1,000 MUSD through a
payment link, and 300 went to pending repayment automatically. Mezo won't let partial repayment go below
its minimum debt, so normally the last 1,800 MUSD just sits there. With auto-close on, income keeps saving
toward the payoff, and the keeper closes the loan. It already did once on this account: a keeper wallet
with no special permissions burned 1,801.80 MUSD, all from pending, zero from operating cash, and the
Bitcoin came back." *[Activity → "Closed automatically from pending repayment" → Mezo explorer]*

**1:00 Safety (25 s).** *[Screen: Automation page, "can / cannot"]* "The keeper can only repay or close
this account's own loan, from money already set aside, within the owner's policy. It can't borrow,
withdraw, change policy or take a fee. Here's a customer trying to change the policy on-chain: reverted,
NotOwner." *[explorer: reverted tx]*

**1:25 Collateral guard (15 s).** *[Screen: Loan page, guard card]* "If BTC falls below the owner's
trigger, `protect` repays from pending income first, stopping exactly at Mezo's floor, then adds Bitcoin
from a buffer the owner reserved. Live, it took a loan from 158 to 177 percent."

**1:40 Close (20 s).** "Contracts are deployed and verified, with unit, fuzz, invariant and fork tests
and live evidence for every step, and a hosted keeper runs every ten minutes. The business pays a small,
capped fee only when its debt goes down or its loan closes. Next: real users and invoices.
Mezo RePay: ordinary income, all the way to zero debt."

## Shot list

1. Home page hero (3 s).
2. `/app?view=0x3B89a07a950c71c3f6978EDf17270384E2184aAe`: dashboard stats and allocation (10 s).
3. Activity → click the `Loan closed` ("Closed automatically from pending repayment") explorer link → explorer tx page (10 s).
4. `/pay/0x3B89…4aAe?amount=25&ref=DEMO&chain=31611`: "Verified RePay account" badge (8 s).
5. Automation page: "What a keeper can and cannot do" (8 s).
6. Explorer: the reverted `setPolicy` tx `0x21b086fb…e58a` (5 s).
7. Loan page: Auto-close card with "Saved toward payoff" progress (6 s).
8. Terminal: `pnpm contracts:test` summary line (5 s).

## Recording procedure

1. Use https://mezo-repay.vercel.app (or `pnpm build && pnpm --filter @repay/web start` locally).
2. Browser at 1440×900, zoom 100%, light OS theme, no extensions visible.
3. Record with the OS screen recorder (macOS: Shift-Cmd-5 → "Record selected portion") at 1440×900.
4. Read the script while following the shot list; keep each shot on screen until the line finishes.
5. Trim to ≤ 2:00 and export 1080p MP4. Upload it yourself and add the link to the submission.
   A recorded 1:44 walkthrough of the live on-chain flow (synthesized voice) is in `docs/video/mezo-repay-demo.mp4`, with its script in `docs/video/NARRATION.md`.
