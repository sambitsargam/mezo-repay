# Keeper

`services/keeper`: a small TypeScript service that triggers `executeRepayment` on RePay accounts
when the contract's own preview says a repayment is ready.

## Authority and cost

- `executeRepayment` is **permissionless and bounded by the contract** (see `SECURITY.md`). The keeper
  key has no special role: it cannot borrow, withdraw, change policy, or redirect funds, and it is
  paid nothing.
- **Keeper fee: zero.** The keeper operator pays gas in testnet BTC. On Mezo testnet a repayment costs
  a fraction of a cent of test BTC.
- Execution is best-effort. If the keeper is down, owners can press **Repay now** in the app
  (Automation page), which calls the same function.

## What it does each scan

1. Checks the chain id is allowlisted (31611 only) at startup and refuses otherwise.
2. Discovers accounts from factory `AccountCreated` events in 10,000-block ranges, from the
   registry's deployment block, saving a checkpoint after each range (`state/state.json`, atomic write).
3. For each account, reads `snapshot()` (with bounded retry/backoff). If `previewStatus != Ready`,
   logs the plain-language reason and moves on.
4. Computes sorted-list hints for the post-repayment position (falls back to zero hints).
5. **Simulates** `executeRepayment`. If simulation reverts (another keeper won, cooldown, interest
   changed), nothing is sent.
6. In live mode, sends, then waits up to 120 s for the receipt. A missing receipt is logged and
   **never resubmitted**; the next scan re-reads chain state, which is authoritative.
7. One in-flight execution per account per process; on-chain rules (cooldown, decrementing pending
   before the call) make races between processes safe.

Logs are JSON lines on stdout and in `state/keeper.log.jsonl`. Private-key-shaped strings are redacted.

## Setup

```bash
cp services/keeper/.env.example services/keeper/.env   # then fill KEEPER_PRIVATE_KEY (testnet only)
pnpm install
```

The keeper also reads the repository root `.env` if present. Never commit either file.

## Commands

```bash
# Dry run: reads and simulates, never sends (no key needed)
pnpm --filter @repay/keeper dry-run -- --once

# Single account, one pass
pnpm --filter @repay/keeper once -- --account 0x76D5a6E6D0D494299A281006Bb5471d50acA388C

# Live, continuous, with status endpoint on :8787
KEEPER_MODE=live pnpm --filter @repay/keeper start
```

Status endpoint (read-only, no keys, no commands):

- `GET /status`: checkpoint, discovered accounts, per-account status and last action, last execution, mode
- `GET /health`: 200 if a scan succeeded within 3 poll intervals, else 503

To show live keeper status in the web app, set `NEXT_PUBLIC_KEEPER_STATUS_URL` to the keeper's public
base URL (this is a URL, not a secret). Without it the Automation page says **Not configured**. It never
claims automation is active just because contracts exist.

`SIGINT`/`SIGTERM` stop the loop, let an in-flight scan finish, then exit.

## Hosting

Any always-on Node 20+ host works (a small VM, Fly.io, Railway, Render background worker):

```bash
pnpm install --frozen-lockfile
KEEPER_MODE=live KEEPER_PRIVATE_KEY=… KEEPER_PORT=8787 pnpm --filter @repay/keeper start
```

Persist `KEEPER_STATE_DIR` for the checkpoint (optional; without it, discovery restarts from the
deployment block). Put the status port behind HTTPS if exposing it to the browser.

## Operational status (at time of writing)

The keeper has been run live with `--once` against Mezo testnet twice. Both runs executed real
repayments (`docs/EVIDENCE.md` steps `keeper-execute` and `keeper-execute-capped`). No always-on
public keeper instance is hosted, so the deployed app shows automation as **Not configured**.

## Limitations

- One operator, no redundancy, no SLA.
- No liquidation monitoring or protection.
- Keeper gas comes from the operator's wallet; if it runs out of BTC, the keeper logs a warning and
  simulations still run, but sends fail.
