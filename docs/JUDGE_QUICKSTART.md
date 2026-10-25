# Judge quickstart (about 2 minutes)

**What it is:** a RePay account is a contract you own. It owns a Bitcoin-backed Mezo MUSD loan,
receives customer MUSD through payment links, splits each payment once (e.g. 30% to repayment, 70%
operating cash), and lets anyone, such as a keeper, apply the set-aside share to the loan. It is
bounded by your policy and Mezo's minimum-debt rule.

## 1. See the real thing without a wallet (30 s)

Open the app's read-only live view of the demo account (live chain data, nothing mocked):

```
<app-url>/app?view=0x76D5a6E6D0D494299A281006Bb5471d50acA388C
```

(Locally: `http://localhost:3000/app?view=0x76D5…388C` after `pnpm dev`.)

You will see a real Trove: 0.045 BTC collateral, debt reduced from 2,202 to exactly 2,000 MUSD,
202 MUSD repaid, 555 MUSD of tracked income, and the status **"Waiting for enough MUSD to close the
loan"** because the loan sits at Mezo's minimum net debt. Activity rows link to the Mezo explorer.

## 2. Check the evidence (30 s)

`docs/EVIDENCE.md`: every transaction with an explorer link. The key ones:

- `open-loan`: the account contract opened the Trove.
- `customer-pay`: a separate wallet paid 500 MUSD (150 to repayment, 350 to operating).
- `keeper-execute`: a third wallet with no authority repaid 150 MUSD (debt 2,202 → 2,052).
- `unauthorized-transaction`: a non-owner `setPolicy`, mined and reverted with `NotOwner()`.
- `keeper-execute-capped`: the repayment was capped exactly at Mezo's minimum debt.

## 3. Explore the product (60 s)

- `/example`: a fully populated account with **clearly labeled sample data**.
- `/pay/0x76D5a6E6D0D494299A281006Bb5471d50acA388C?amount=25&ref=JUDGE&chain=31611`: the public payer
  page. It verifies on-chain that the recipient is a genuine RePay account.
- With a wallet on Mezo testnet (chain 31611, RPC `https://rpc.test.mezo.org`, faucet
  https://faucet.test.mezo.org): `/app/setup` walks through creating your own account and loan.

## Run it

```bash
git clone --recurse-submodules https://github.com/sambitsargam/mezo-repay && cd mezo-repay
pnpm install
pnpm dev                       # http://localhost:3000
pnpm contracts:test            # 61 Foundry tests (unit, fuzz, invariants)
```
