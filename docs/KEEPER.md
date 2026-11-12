# Keeper

`services/keeper`: a small TypeScript service that calls `protect` on RePay accounts whose collateral
guard can act; otherwise `executeClose` when the owner turned auto-close on and pending repayment covers
the payoff; otherwise `executeRepayment` when the contract's own preview says a repayment is ready.
Loan safety comes first.

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
3. For each account, reads `snapshot()` (with bounded retry/backoff). If `guardStatus == Protectable`
   it calls `protect`. Otherwise, if `closeStatus == Ready` it calls `executeClose`. Otherwise, if
   `previewStatus != Ready`, it logs the plain-language reason and moves on.
4. Computes sorted-list hints for the post-repayment position (falls back to zero hints).
5. **Simulates** the call (`protect`, `executeClose` or `executeRepayment`). If simulation reverts (another keeper won, cooldown, interest
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
pnpm --filter @repay/keeper once -- --account 0x3B89a07a950c71c3f6978EDf17270384E2184aAe

# Live, continuous, with status endpoint on :8787
KEEPER_MODE=live pnpm --filter @repay/keeper start
```

Status endpoint (read-only, no keys, no commands):

- `GET /status`: checkpoint, discovered accounts, per-account status and last action, last execution, mode
- `GET /health`: 200 if a scan succeeded within 3 poll intervals, else 503

The web app reads keeper status from `NEXT_PUBLIC_KEEPER_STATUS_URL` + `/status`. By default that is
the app's own `/api/keeper/status` route, which describes the hosted keeper from public data only (see
below). Point it at a self-hosted keeper's base URL instead, or set it to `off` to show
**Not configured**. The app never claims automation is active just because contracts exist.

`SIGINT`/`SIGTERM` stop the loop, let an in-flight scan finish, then exit.

## Hosting

### Hosted instance: GitHub Actions (current)

`.github/workflows/keeper.yml` runs one live keeper pass (`--once --live`) every 10 minutes and on
manual dispatch. The key comes from the encrypted repository secret `KEEPER_PRIVATE_KEY` for the
testnet keeper wallet `0x2f7b81940281d513b0DbfebE78005030391e1c02`, which has no authority over any
account. The discovery checkpoint is kept in the Actions cache.

The repository owner adds the secret once:

```bash
gh secret set KEEPER_PRIVATE_KEY --repo sambitsargam/mezo-repay
```

Public status: https://mezo-repay.vercel.app/api/keeper/status. It is built only from the chain
(accounts, statuses, actions sent by the keeper address) and the public GitHub Actions API (latest
runs). It reads no key.

GitHub may start scheduled runs late, and pauses schedules in repositories with no activity for 60
days. That is acceptable for testnet; a guard that must react fast needs an always-on host too.

### Always-on host

Any Node 20+ host works (a small VM, Fly.io, Railway, Render background worker):

```bash
pnpm install --frozen-lockfile
KEEPER_MODE=live KEEPER_PRIVATE_KEY=… KEEPER_PORT=8787 pnpm --filter @repay/keeper start
```

Persist `KEEPER_STATE_DIR` for the checkpoint (optional; without it, discovery restarts from the
deployment block). Put the status port behind HTTPS if exposing it to the browser.

## Operational status (at time of writing)

- v1: two live `--once` runs executed real repayments (`keeper-execute`, `keeper-execute-capped`).
- v2: the keeper wallet executed a repayment and a guard `protect` live (`keeper-execute`,
  `keeper-protect` in `docs/EVIDENCE.md`).
- v3: the keeper wallet auto-closed a Trove live (`keeper-auto-close`): 1,801.80 MUSD from pending,
  0 from operating cash.
- Hosted schedule: running every 10 minutes since the `KEEPER_PRIVATE_KEY` secret was added. The
  Automation page shows the latest run and its result.

## Limitations

- One operator, no redundancy, no SLA; scheduled runs can be late.
- The guard only acts when a pass runs, and only with pending MUSD and the owner's buffer.
- Keeper gas comes from the operator's wallet; if it runs out of BTC, the keeper logs a warning and
  simulations still run, but sends fail.
