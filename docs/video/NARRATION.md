# Demo video narration

Video: [mezo-repay-demo.mp4](mezo-repay-demo.mp4) (1:44, 1080p). A scripted browser session on
https://mezo-repay.vercel.app, using the read-only live view of the v3 demo account
`0x3B89a07a950c71c3f6978EDf17270384E2184aAe`, and the Mezo testnet explorer. No transactions are sent
during the video. Every transaction shown was made earlier and is listed in `docs/EVIDENCE.md`
(run 3).

Voice: synthesized narration (Microsoft neural TTS, voice en-US-AndrewMultilingualNeural, via
edge-tts). To sound less robotic, it is generated one sentence at a time with small pace and pitch
variation, joined with natural-length pauses, then lightly EQ'd and compressed over quiet room tone
(normalized to -16 LUFS).

| # | Screen | Narration |
| --- | --- | --- |
| 1 | Home page (hosted app) | So, here's the problem. If you run a business and hold Bitcoin, Mezo lets you borrow MUSD against it, instead of selling. But paying that loan back? That part's still on you. Mezo RePay fixes that. Your income pays the loan down for you. |
| 2 | Overview of the live v3 demo account: stats, income split, auto-close progress | This is a real account on Mezo testnet, and the contract itself owns this loan. Every time a customer pays, thirty percent gets set aside for the loan, and the rest stays as operating cash. And this box here? That's auto-close, tracking how close we are to paying the whole thing off. |
| 3 | Activity: customer payment, then the automatic close | Here's the activity feed. A customer, from their own wallet, paid a thousand MUSD, and three hundred went straight to repayment. And right here, the previous loan on this account, closed automatically. Nobody clicked anything. The keeper did it. |
| 4 | Mezo explorer: the keeper's executeClose transaction | You can check it on the explorer. One call, execute close. Mezo burned about eighteen hundred MUSD, every bit of it from the repayment pot, nothing from operating cash, and the Bitcoin went right back to the account. |
| 5 | Loan page: Auto-close card, then the collateral guard | Here's why that matters. Mezo won't let you pay a loan below its minimum debt, so normally that last eighteen hundred just sits there. With auto-close on, income keeps saving toward the payoff, and once it's covered, the loan is done. And if Bitcoin drops? The collateral guard steps in first, repaying from pending and topping up collateral from a buffer you set aside. |
| 6 | Automation (what a keeper can and cannot do), then the public payer page | The keeper runs every ten minutes, and honestly, it can't do much. It can't borrow, it can't withdraw, and it can't touch your cash. Customers just pay through a link, which checks on-chain that the account is real. |
| 7 | Home page | That's Mezo RePay. Your income, paying off your Bitcoin loan, all the way to zero. |
