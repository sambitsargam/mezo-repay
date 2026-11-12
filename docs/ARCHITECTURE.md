# Architecture

```
apps/web            Next.js 14 app (wagmi + viem + TanStack Query + Tailwind)
packages/contracts  Foundry: RePayAccount, RePayAccountFactory, tests, deploy script
packages/sdk        Shared TS: deployment registry, ABIs, accounting math, hints, readers
services/keeper     TS keeper + live demo runner
scripts/            ABI export, evidence renderer
docs/               This documentation
```

## On-chain

```
           owner wallet ─────────────┐ (all owner actions)
                                     ▼
 customer ── pay / payWithPermit ──► RePayAccount (EIP-1167 clone) ──► Mezo BorrowerOperations
 keeper ──── executeRepayment ─────►   ├ pendingRepayment               (openTrove, repayMUSD,
        ├─── protect (guard) ──────►   ├ operatingCash                    closeTrove, addColl, …)
        └─── executeClose (opt-in) ►   │
                                       ├ collateralBuffer (BTC)
                                       └ owns its own Trove  ◄────────── Mezo TroveManager, PriceFeed (reads)
 RePayAccountFactory ── clone + initialize (same tx), AccountCreated event, isAccount registry
```

- **RePayAccountFactory**: immutable wiring (BorrowerOperations, TroveManager, CollSurplusPool); deploys
  one RePayAccount implementation in its constructor; creates clones and initializes them atomically.
  No admin, no funds, no upgrade path.
- **RePayAccount**: one per owner per business. The protocol addresses and MUSD are immutables in the
  implementation bytecode, so every clone shares them and they cannot change. MUSD is read from
  `BorrowerOperations.musd()` at deploy time, so the token always matches the borrowing system.
- Because Mezo's BorrowerOperations acts on `msg.sender`, the account contract *is* the borrower. No
  delegation or signatures are needed for repayment.

**Collateral guard (v2).** The owner sets a trigger and target ratio and reserves BTC in the account
(`fundBuffer`). `guardPreview()` reads Mezo's `PriceFeed.fetchPrice()` in-block and computes the
collateral ratio, then how much pending MUSD to repay toward the target (capped by pending and Mezo's
minimum debt) and how much buffer BTC to add for the remaining gap. `protect()` executes exactly that:
`repayMUSD` then `addColl`, both for the account's own Trove. The price feed is wrapped in try/catch so
views keep working when the oracle is stale. The keeper checks the guard first, then auto-close, then routine repayment.

The hosted keeper runs on a GitHub Actions schedule. The web app's `/api/keeper/status` route
rebuilds its status from chain logs (actions sent by the keeper address) and the public Actions API.

`RePayAccount.snapshot()` returns every field the UI and keeper need in one `eth_call`, including the
contract's own `previewRepayment()`. Off-chain code never re-implements the decision logic it acts on.

## Off-chain

- **Deployment registry** (`packages/sdk/src/deployments.json`): chain id, Mezo protocol addresses with
  source commit, RePay factory/implementation, deployment block and tx, source commit, compiler,
  verification status. Imported by the web app, keeper, demo runner, fork test (via
  `script/MezoTestnet.sol`), and evidence renderer. `repay` is `null` on networks without a deployment;
  the UI then shows "not deployed" instead of placeholders.
- **Web app**: one shell serves two strictly separate modes via the `[mode]` route segment:
  `/app` (live chain data only) and `/example` (deterministic fixtures, no tx hashes, no writes). Every
  data hook branches on the mode, and there is no fallback from live to fixtures.
  `/app?view=0x…` is a read-only live view of any account for people without a wallet.
  `/pay/[account]` is the public payer page.
- **Transactions**: `useTransaction` implements Review → Awaiting signature → Submitted → Confirming →
  Confirmed, with simulation before the wallet prompt, a submit lock, replacement tracking, and a
  "still confirming" state with manual re-check (never auto-resubmit).
- **Keeper**: discovers accounts from `AccountCreated` logs in 10k-block chunks with a persisted
  checkpoint, reads `snapshot()`, simulates `executeRepayment`, sends only in live mode, and serves
  `GET /status` and `GET /health`. See `KEEPER.md`.

## Why no database

Balances, policy, debt, and history are all on-chain. Activity is rebuilt from contract events in
bounded ranges starting at the factory deployment block. The keeper's only local state is a discovery
checkpoint and a log, both disposable.

## Compiler

Solidity 0.8.24, `evm_version = london` (matches Mezo's own MUSD build), optimizer 200 runs,
OpenZeppelin Contracts v5.0.2, forge-std v1.9.4.
