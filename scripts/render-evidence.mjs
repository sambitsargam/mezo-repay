// Renders docs/evidence/live-run-v3.json (current deployment), live-run-v2.json and live-run.json
// (earlier deployments) into docs/EVIDENCE.md so the doc always matches recorded data.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(root, "docs/evidence", f), "utf8"));
const v3 = load("live-run-v3.json");
const v2 = load("live-run-v2.json");
const v1 = load("live-run.json");
const reg = JSON.parse(readFileSync(join(root, "packages/sdk/src/deployments.json"), "utf8"))["31611"];
const cur = reg.repay;
const prev2 = reg.previous[0];
const prev = reg.previous[1];
const X = "https://explorer.test.mezo.org";
const a = (addr) => `[\`${addr}\`](${X}/address/${addr})`;
const tx = (h) => `[\`${h.slice(0, 18)}…\`](${X}/tx/${h})`;
const typeLabel = { transaction: "On-chain transaction", read: "Read-only call", simulation: "Simulation (eth_call)" };
const esc = (s) => String(s).replace(/\|/g, "\\|");
const find = (ev, step) => ev.steps.find((s) => s.step === step);

function stepsTable(ev) {
  let md = `| # | Step | Type | Result | What happened |\n| --- | --- | --- | --- | --- |\n`;
  ev.steps.forEach((s, i) => {
    const link = s.txHash ? `[${s.status ?? "?"} · block ${s.blockNumber}](${s.explorer})` : s.data?.block ? `block ${s.data.block}` : "—";
    md += `| ${i + 1} | \`${s.step}\` | ${typeLabel[s.type]} | ${link} | ${esc(s.summary)} |\n`;
  });
  return md;
}

function stateTables(ev) {
  let md = "";
  for (const s of ev.steps.filter((x) => x.data && Object.keys(x.data).length)) {
    md += `\n<details><summary><code>${s.step}</code> (${typeLabel[s.type].toLowerCase()})</summary>\n\n| Field | Value |\n| --- | --- |\n`;
    for (const [k, v] of Object.entries(s.data)) md += `| ${k} | ${esc(v)} |\n`;
    md += `\n</details>\n`;
  }
  return md;
}

const protect = find(v2, "keeper-protect");
const exec2 = find(v2, "keeper-execute");
const close = find(v1, "owner-close-loan");
const auto = find(v3, "keeper-auto-close");
const saving = find(v3, "read-saving-toward-payoff");
const close2 = find(v2, "owner-close-loan");

let md = `# Evidence

Everything below is generated from the JSON records in \`docs/evidence/\`, which the demo runner
(\`services/keeper/src/demo.ts\`) appends to as each step runs on **Mezo testnet (chain ${v3.chainId})**.
Regenerate with \`node scripts/render-evidence.mjs\`.

Each row is labeled with its type:

- **On-chain transaction**: mined on Mezo testnet; follow the explorer link.
- **Read-only call**: state read with \`eth_call\` at the stated block; no transaction.
- **Simulation**: \`eth_call\` of a write, showing what the contract would do; no transaction.

Local tests (Foundry, Vitest, Playwright) are listed at the end and are **not** live evidence.

## Summary

| Path | Live on testnet | Where |
| --- | --- | --- |
| Create account (factory clone) | Yes (v1, v2, v3) | v3 \`create-account\` |
| Open a Mezo Trove owned by the account | Yes (v1, v2, v3) | v3 \`open-loan\` (and reopened after the auto-close) |
| Tracked payment, approve + \`pay\` | Yes | v3 \`customer-pay\`; v2 \`customer-pay\` (×2) |
| Tracked payment, EIP-2612 \`payWithPermit\` | Yes | v3 and v2 \`customer-pay-permit\` |
| **Auto-close: keeper \`executeClose\` from pending only** | **Yes** | v3 \`keeper-auto-close\` |
| Split into pending repayment / operating cash | Yes | \`PaymentReceived\` data on each payment |
| Keeper \`executeRepayment\` (permissionless) | Yes | v2 \`keeper-execute\`; v1 two runs |
| Repayment capped at Mezo's minimum debt | Yes | v1 \`keeper-execute-capped\`; v2 \`keeper-protect\` |
| Collateral guard \`protect\`: pending → repay, buffer → \`addColl\` | Yes | v2 \`keeper-protect\` |
| Owner \`addCollateral\` / \`withdrawCollateral\` | Yes | v2 \`owner-add-collateral\`, \`owner-withdraw-collateral\` |
| Owner \`closeLoan\` (\`closeTrove\`) and BTC withdrawal | Yes | v1 and v2 \`owner-close-loan\`, \`owner-withdraw-btc\` |
| Direct transfer stays unclassified, then classified | Yes | v1 \`direct-transfer\`, \`classify-revenue\` |
| Non-owner rejected | Yes (simulation + mined revert) | v1 and v2 \`unauthorized-*\` |
| \`claimCollateralSurplus\` | **No.** Surplus exists only after a liquidation or redemption of this Trove, which we cannot cause honestly on a shared testnet. Covered by unit tests against the mock (\`test_fullRedemptionThenClaimSurplus\`). | — |

## Run 3: current deployment (v3, auto-close)

| Role | Address |
| --- | --- |
| RePay factory v3 | ${a(v3.factory)} · deployed in ${tx(cur.deploymentTx)} (block ${cur.deploymentBlock}) |
| RePay account (demo) | ${a(v3.account)} |
| Owner / deployer wallet | ${a(v3.owner)} |
| Customer wallet (separate key) | ${a(v3.customer)} |
| Keeper wallet (separate key, no authority) | ${a(v3.keeper)} |

### What run 3 demonstrates

Partial repayment always stops at Mezo's minimum net debt, so before v3 the last ~1,800 MUSD needed a
manual close. Auto-close lets income finish the job.

1. **Opt-in.** The account opened a Trove at the minimum size (0.045 BTC, borrow 1,800, debt 2,001.80 MUSD) and the owner called \`setAutoClose(true)\`. Status: *saving toward payoff* (payoff = debt − 200 MUSD gas compensation = ${saving.data.closeRequired}).
2. **Income accumulates instead of stalling.** The customer paid 1,000 MUSD (approve + \`pay\`) and 100 MUSD (permit); 30% of each went to pending repayment. Routine repayment reported \`${saving.data.previewStatus}\`, but pending kept growing toward the payoff (${saving.data.pendingRepayment} of ${saving.data.closeRequired}).
3. **Top-up, labeled.** To reach the payoff in one sitting, the owner deposited 1,480 MUSD of their own capital straight into pending repayment (\`depositCapital\`, recorded as capital, never income). In normal use income alone fills it over time.
4. **Keeper closes the loan.** The keeper wallet, which has no authority over the account, called \`executeClose\`. Mezo's \`closeTrove\` burned ${auto.data.debtRepaid}: **${auto.data.fromPending} from pending, ${auto.data.fromOperating} from operating cash**, and ${auto.data.collateralReturned} came back to the account.
5. **Back to work.** The owner withdrew the BTC, reopened a loan on the same account (auto-close still on), and set the guard to 150% → 170%. The read-only demo view shows this account.

### Steps

${stepsTable(v3)}
### Recorded state
${stateTables(v3)}
## Run 2: previous deployment (v2, collateral guard)

| Role | Address |
| --- | --- |
| RePay factory v2 | ${a(v2.factory)} · deployed in ${tx(prev2.deploymentTx)} (block ${prev2.deploymentBlock}) |
| RePay account (demo, now closed) | ${a(v2.account)} |
| Owner / deployer wallet | ${a(v2.owner)} |
| Customer wallet (separate key, borrowed its own MUSD) | ${a(v2.customer)} |
| Keeper wallet (separate key, no authority) | ${a(v2.keeper)} |

### What run 2 demonstrates

1. **Account and real Trove.** The factory created the account; \`openLoan\` sent 0.045 BTC through \`BorrowerOperations.openTrove\` and the account became the borrower (debt 2,202 MUSD, ratio 150.9%).
2. **Tracked income split once.** A separate customer wallet paid 500 MUSD (approve + \`pay\`), 100 MUSD (one-transaction permit) and 100 MUSD again. Each payment split 30% to pending repayment and 70% to operating cash. Borrowed MUSD was never counted as income.
3. **Policy limits respected.** The owner capped automated repayment at 100 MUSD; the keeper's \`executeRepayment\` repaid exactly 100 (debt ${exec2.data.debtBefore} → ${exec2.data.debtAfter}) and left the rest pending under cooldown.
4. **Collateral guard, live.** The owner set the guard to protect below 170% and aim for 180%, and reserved 0.003 BTC as a buffer. The trigger was set **above** the current ratio so the path runs at today's price (testnet prices cannot be moved by us). The keeper called \`protect\`: it repaid ${protect.data.repaid} from pending (capped exactly at Mezo's 2,000 MUSD floor, ignoring the cooldown), then added ${protect.data.collateralAdded} from the buffer through \`addColl\`. Ratio **${protect.data.ratioBefore} → ${protect.data.ratioAfter}**. Operating cash was not touched.
5. **Collateral management.** The owner added and withdrew 0.0005 BTC of collateral (\`addColl\`, \`withdrawColl\`).
6. **Authority.** The customer's \`withdrawOperating\` simulation reverted with \`NotOwner()\`, and its mined \`setPolicy\` transaction reverted.
7. **Closed before v3.** The owner closed the Trove with \`closeLoan\` (${close2.data.debtRepaid}: ${close2.data.fromPending} from pending, ${close2.data.fromOperating} from operating cash), withdrew the BTC and the remaining operating cash, and reused them for run 3.

### Steps

${stepsTable(v2)}
### Recorded state
${stateTables(v2)}
## Run 1: first deployment (v1), including the loan close

| Role | Address |
| --- | --- |
| RePay factory v1 | ${a(v1.factory)} · deployed in ${tx(prev.deploymentTx)} (block ${prev.deploymentBlock}) |
| RePay account (demo, now closed) | ${a(v1.account)} |

### What run 1 demonstrates

1. Account creation, Trove opening (0.045 BTC, debt 2,202 MUSD), and a 500 MUSD customer payment split 150 / 350.
2. Keeper repayment: debt 2,202.00 → 2,052.00 MUSD.
3. One-transaction permit payment; a direct transfer that stayed unclassified until the owner classified it.
4. Owner capital deposited straight to pending repayment (not income).
5. **Minimum-debt boundary.** With 76.50 MUSD pending but ~52 MUSD protocol-valid headroom, the keeper repaid exactly the headroom; debt landed on 2,000.0000 MUSD and the rest stayed pending ("waiting for enough MUSD to close").
6. **Loan closed.** \`closeLoan\` burned ${close.data.debtRepaid} (${close.data.fromPending} from pending first, ${close.data.fromOperating} from operating cash) through \`closeTrove\`, and ${close.data.collateralReturned} of collateral came back to the account; the owner then withdrew it.

### Steps

${stepsTable(v1)}
### Recorded state
${stateTables(v1)}
## Fork simulation (not live evidence)

\`pnpm contracts:fork\` runs the full flow and the collateral guard against the real Mezo testnet
bytecode on a local fork. One component is **substituted**: Mezo's BTC price oracle is a chain
precompile (\`0x7b7c…0015\`) that local EVMs cannot execute (\`EvmError: NotActivated\`), so the fork
test mocks only its \`latestRoundData()\`/\`decimals()\`. The guard fork test drops the mocked price to
62,000 and shows \`protect\` taking the real Trove from 142.9% to 180.0%. The auto-close fork test has a
separate keeper address call \`executeClose\` on a real Trove funded entirely by a customer payment.

## Local test suites (not live evidence)

| Suite | Command | Result at time of writing |
| --- | --- | --- |
| Foundry unit + fuzz + invariant | \`pnpm contracts:test\` | 89 passed (81 unit/fuzz incl. guard, auto-close and permission matrix, 8 invariants) |
| Foundry fork (real Mezo bytecode, mocked oracle) | \`pnpm contracts:fork\` | 3 passed |
| SDK (Vitest) | \`pnpm --filter @repay/sdk test\` | 22 passed |
| Keeper (Vitest) | \`pnpm --filter @repay/keeper test\` | 10 passed |
| Web unit (Vitest) | \`pnpm --filter @repay/web test\` | 10 passed |
| Browser (Playwright, desktop + mobile) | \`pnpm --filter @repay/web e2e\` | see \`docs/DEPLOYMENTS.md\` |

## Source verification

- v3 factory: Sourcify **exact match** (creation + runtime): https://repo.sourcify.dev/31611/${cur.factory}
- v3 account implementation: Sourcify **exact match** (runtime): https://repo.sourcify.dev/31611/${cur.implementation}
- v2 factory and implementation: Sourcify exact match: https://repo.sourcify.dev/31611/${prev2.factory}
- v1 factory and implementation: Sourcify exact match: https://repo.sourcify.dev/31611/${prev.factory}
- Blockscout (explorer.test.mezo.org) does not show Sourcify results; its own verification API did not mark v1 verified at time of writing.
`;
writeFileSync(join(root, "docs/EVIDENCE.md"), md);
console.log(`wrote docs/EVIDENCE.md (v3 ${v3.steps.length}, v2 ${v2.steps.length}, v1 ${v1.steps.length} steps)`);
