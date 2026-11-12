# Judge quickstart (about 2 minutes)

**What it is:** a RePay account is a contract you own. It owns a Bitcoin-backed Mezo MUSD loan
(Trove), receives customer MUSD through payment links, splits each payment once (for example 30% to
repayment, 70% to operating cash), and lets anyone, such as the hosted keeper, apply the set-aside
share to the loan. When BTC falls below your trigger, its collateral guard repays from pending MUSD
and adds buffer BTC to the same Trove. With auto-close on, income keeps saving past Mezo's minimum
debt and the keeper closes the loan when pending covers the payoff.

## 1. See the real thing without a wallet (30 s)

Open the read-only live view of the demo account (live chain data, nothing mocked):

https://mezo-repay.vercel.app/app?view=0x3B89a07a950c71c3f6978EDf17270384E2184aAe

You will see a real Trove with auto-close on and its progress toward the payoff, 1,100 MUSD of tracked
income from a separate customer wallet, and on **Loan** the collateral guard (trigger 150%, target
170%) and the **Auto-close** card. **Activity** shows the earlier loan on this account being closed by
the keeper ("Closed automatically from pending repayment"), with explorer links for every event.
**Automation** shows the hosted keeper's schedule and its latest run.

## 2. Check the evidence (30 s)

`docs/EVIDENCE.md`: every transaction with an explorer link. Run 3 (v3, current):

- `owner-set-auto-close`: the owner opted in.
- `keeper-auto-close`: the keeper wallet called `executeClose`; Mezo's `closeTrove` burned 1,801.80
  MUSD, all from pending repayment, and 0.045 BTC came back to the account.

Run 2 (v2):

- `open-loan`: the account contract opened the Trove itself.
- `customer-pay`, `customer-pay-permit`: a separate wallet paid, split 30/70 on arrival.
- `keeper-execute`: a wallet with no authority repaid 100 MUSD (the owner's per-run cap).
- `keeper-protect`: the guard repaid 102 MUSD down to Mezo's floor and added 0.003 BTC; ratio
  158.2% → 177.4%.
- `owner-add-collateral`, `owner-withdraw-collateral`; and in run 1, `owner-close-loan`.
- `unauthorized-transaction`: a non-owner `setPolicy`, mined and reverted with `NotOwner()`.

## 3. Explore the product (60 s)

- https://mezo-repay.vercel.app/example: a fully populated account with **clearly labeled sample data**.
- https://mezo-repay.vercel.app/pay/0x3B89a07a950c71c3f6978EDf17270384E2184aAe?amount=25&ref=JUDGE&chain=31611 :
  the public payer page. It verifies on-chain that the recipient is a genuine RePay account. With
  testnet MUSD you can pay the demo account yourself.
- With a wallet on Mezo testnet (chain 31611, RPC `https://rpc.test.mezo.org`, faucet
  https://faucet.test.mezo.org): `/app/setup` walks you through creating your own account and loan.
- Deck: https://mezo-repay.vercel.app/deck

## Run it

```bash
git clone --recurse-submodules https://github.com/sambitsargam/mezo-repay && cd mezo-repay
pnpm install
pnpm dev                       # http://localhost:3000
pnpm contracts:test            # 79 Foundry tests (unit, fuzz, permission matrix, 7 invariants)
pnpm contracts:fork            # flow + guard against real Mezo testnet bytecode (~5 min)
```
