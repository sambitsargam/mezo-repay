# Demo video narration

Video: [mezo-repay-demo.mp4](mezo-repay-demo.mp4) (4:15, 1080p). Part 1 narrates the pitch deck; part 2 is a scripted browser session on https://mezo-repay.vercel.app using the read-only live view of the real demo account and the Mezo testnet explorer. No transactions are sent in the video; the transactions shown were made earlier (see docs/EVIDENCE.md).

Voice: synthesized narration (Microsoft neural TTS, voice en-US-AndrewMultilingualNeural, via edge-tts).

## Part 1: slides

1. This is Mezo RePay. Let your income pay down your Bitcoin loan. Receive MUSD from customers, keep your operating cash, and automatically direct a chosen share toward your Mezo loan. Everything you'll see runs on Mezo testnet.

2. The problem. Borrowing MUSD against Bitcoin is easy. Paying it back is a chore. Owners must remember, size, and send every repayment, while revenue lands in the same wallet as their spending money. Payment links don't repay loans, and loan dashboards don't see revenue.

3. The product. Every tracked payment is split once, the moment it arrives. In our live run, a customer paid five hundred MUSD. One hundred fifty went to loan repayment, and three hundred fifty stayed as operating cash. Borrowed MUSD is never counted as income.

4. The flow takes five steps. Create an account only your wallet controls. The account opens and owns a Mezo loan. Set your share, reserve, limits, and cooldown. Share a payment link. Then a keeper, or you, applies the set-aside money to the loan.

5. The Mezo integration is direct. The account contract is the borrower. It calls Mezo's Borrower Operations to open, repay, and close its own Trove, reads live debt including interest from the Trove Manager, and respects Mezo's eighteen hundred MUSD minimum debt.

6. Security. Keepers can repay, and nothing else. They can't borrow, withdraw collateral, touch operating cash, change the policy, or take a fee. Accounts are created by a factory with no admin. Sixty one contract tests, including fuzz and invariant tests, back this up.

7. The evidence is real. An account opened a Trove with real test Bitcoin. A separate customer wallet paid it. A keeper with no special permissions cut the debt from twenty two hundred and two, down to exactly two thousand, the protocol floor. And an unauthorized policy change was rejected on chain.

8. Next, we plan a hosted keeper, owner approved auto close, and invoices. Our hypothesis: tie repayment to revenue, and debt falls on its own. Now let's see the live app.

## Part 2: live demo

1. Okay, here's the live app, hosted on Vercel. The illustration on the right tells the whole story in a few seconds: a customer payment comes in, it gets split, and a repayment lands against the Mezo loan.

2. Now this is the real thing. It's a read-only live view of our demo account, pulling straight from Mezo testnet. The debt is two thousand MUSD, the collateral ratio is around a hundred and eighty percent, and two hundred and two MUSD has already been repaid out of customer income.

3. Down here, the gauge shows how healthy the collateral is, with Mezo's hundred-and-ten-percent liquidation line marked. And the paydown bar shows how much of the loan we've cleared so far.

4. Notice the status on the right: waiting for enough MUSD to close the loan. The loan is sitting at Mezo's minimum debt, so instead of firing off a transaction that would just revert, RePay keeps the last twenty-four MUSD pending until the owner closes the loan.

5. Every number on the split card is real, too. Five hundred and fifty-five MUSD of tracked income, divided once, thirty percent to repayment and seventy percent to operating cash.

6. The activity feed is rebuilt from the contract's own events. You can see the customer payments, the one-transaction permit payment, a direct transfer the owner classified as revenue, and both keeper repayments, each with a link to the explorer.

7. And here it is on the Mezo explorer: the keeper's repayment, confirmed on testnet.

8. On the receive page, the owner creates a payment link with an amount and a reference, and gets a QR code to share with the customer.

9. This is what the customer sees. The page checks on chain that the recipient really is a RePay account, shows exactly how the payment will be split, and lets them pay in a single transaction with a permit.

10. Finally, automation. We don't pretend. There's no hosted keeper connected right now, so it says not configured, and gives you a manual repay button. It also lays out exactly what a keeper can and can't do.

11. That's Mezo RePay: ordinary business income, flowing into real repayment of Bitcoin-backed loans. Thanks for watching.
