# Demo video narration

Video: [mezo-repay-demo.mp4](mezo-repay-demo.mp4) (1:36, 1080p). The video is a scripted browser
session on https://mezo-repay.vercel.app (read-only live view of the v2 demo account
`0x97D60Fb479B5E88B2C02A6d97C0d3da9b4A899D7`) and the Mezo testnet explorer. No transactions are sent
during the video. Every transaction shown was made earlier and is listed in `docs/EVIDENCE.md`
(run 2).

Voice: synthesized narration (Microsoft neural TTS, voice en-US-AndrewMultilingualNeural, via edge-tts).

| # | Screen | Narration |
| --- | --- | --- |
| 1 | Overview (live) | This is Mezo RePay, live on Mezo testnet. A RePay account is a contract the owner controls, and it owns a real Bitcoin-backed MUSD loan. Customer income pays that loan down automatically. |
| 2 | Overview: stats, collateral health, debt paydown | Here's the demo account. Debt started at twenty-two hundred and two MUSD and is now exactly two thousand, Mezo's minimum. Seven hundred MUSD of customer income came in, and two hundred and two went to the loan. |
| 3 | Activity | In the activity feed, every customer payment is split once, the moment it lands: thirty percent to repayment, seventy percent to operating cash. A keeper with no special permissions then repaid a hundred MUSD, capped by the owner's policy. |
| 4 | Explorer: keeper-execute tx | Each row links to the Mezo explorer. This is the account contract itself calling Mezo's Borrower Operations to repay its own Trove. |
| 5 | Loan: collateral guard | New this wave: the collateral guard. When the ratio falls below the owner's trigger, protect repays from pending income first, then adds Bitcoin from a buffer the owner set aside. Live, it took this loan from one fifty-eight to one seventy-seven percent. |
| 6 | Explorer: keeper-protect tx | Here's that transaction on the explorer: one call that repays MUSD and adds collateral to the same Trove, and it never touches operating cash. |
| 7 | Automation, then payer page | The keeper is hosted on a ten-minute schedule, and its public status comes straight from chain data. Customers pay through a link that verifies on-chain that the account is genuine. Mezo RePay: let your income pay down your Bitcoin loan. |
