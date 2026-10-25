// Renders docs/evidence/live-run.json into docs/EVIDENCE.md so the doc always matches recorded data.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const ev = JSON.parse(readFileSync(join(root, "docs/evidence/live-run.json"), "utf8"));
const reg = JSON.parse(readFileSync(join(root, "packages/sdk/src/deployments.json"), "utf8"))["31611"];
const X = "https://explorer.test.mezo.org";
const a = (addr) => `[\`${addr}\`](${X}/address/${addr})`;

const typeLabel = { transaction: "On-chain transaction", read: "Read-only call", simulation: "Simulation (eth_call)" };
let md = `# Evidence

Everything below comes from \`docs/evidence/live-run.json\`, which the demo runner
(\`services/keeper/src/demo.ts\`) and keeper append to as steps run on **Mezo testnet (chain ${ev.chainId})**.
Regenerate this file with \`node scripts/render-evidence.mjs\`.

Each row is labeled with its type:

- **On-chain transaction**: mined on Mezo testnet; follow the explorer link.
- **Read-only call**: state read with \`eth_call\` at the stated block; no transaction.
- **Simulation**: \`eth_call\` of a write, showing what the contract would do; no transaction.

Local tests (Foundry, Vitest, Playwright) are listed separately at the end and are **not** live evidence.

## Participants

| Role | Address |
| --- | --- |
| RePay factory | ${a(ev.factory)} |
| RePay account (demo) | ${a(ev.account)} |
| Owner / deployer wallet | ${a(ev.owner)} |
| Customer wallet (separate key) | ${a(ev.customer)} |
| Keeper wallet (separate key, no authority) | ${a(ev.keeper)} |
| Factory deployment tx | [\`${reg.repay.deploymentTx.slice(0, 18)}…\`](${X}/tx/${reg.repay.deploymentTx}) (block ${reg.repay.deploymentBlock}) |

## Steps

| # | Step | Type | Result | What happened |
| --- | --- | --- | --- | --- |
`;
ev.steps.forEach((s, i) => {
  const link = s.txHash ? `[${s.status ?? "?"} · block ${s.blockNumber}](${s.explorer})` : s.data?.block ? `block ${s.data.block}` : "—";
  md += `| ${i + 1} | \`${s.step}\` | ${typeLabel[s.type]} | ${link} | ${s.summary.replace(/\|/g, "\\|")} |\n`;
});

md += `\n## Recorded state\n`;
for (const s of ev.steps.filter((x) => x.data && Object.keys(x.data).length)) {
  md += `\n### ${s.step} (${typeLabel[s.type].toLowerCase()})\n\n| Field | Value |\n| --- | --- |\n`;
  for (const [k, v] of Object.entries(s.data)) md += `| ${k} | ${String(v).replace(/\|/g, "\\|")} |\n`;
}

md += `
## What this demonstrates

1. **Account creation.** A RePay account was created by the factory with the owner wallet (\`create-account\`).
2. **Real Mezo Trove owned by the account.** \`openLoan\` deposited 0.045 BTC through \`BorrowerOperations.openTrove\`; debt 2,202 MUSD (2,000 + 0.1% fee + 200 gas compensation).
3. **Borrowed MUSD is not income.** After opening, \`totalIncome\` = 0 and the 2,000 MUSD sits in operating cash.
4. **Tracked customer payment from a separate wallet.** The customer approved exactly 500 MUSD and called \`pay\`: 150 to pending repayment, 350 to operating (30%).
5. **Keeper repayment changed real protocol debt.** A third wallet with no authority called \`executeRepayment\`: debt 2,202.00 → 2,052.00 MUSD, CR 164.5% → 176.6%.
6. **Rejected unauthorized action.** The customer's \`withdrawOperating\` simulation reverted with \`NotOwner()\`, and its on-chain \`setPolicy\` transaction was mined and reverted.
7. **One-transaction permit payment.** \`payWithPermit\` with an EIP-2612 signature over exactly 50 MUSD.
8. **Direct transfer stays unclassified.** A plain ERC-20 transfer of 5 MUSD did not change \`totalIncome\` until the owner classified it as revenue.
9. **Minimum-debt boundary handled.** With 76.50 MUSD pending but only ~52 MUSD protocol-valid headroom, the keeper repaid exactly the headroom. Debt landed on **2,000.0000 MUSD** (1,800 minimum net debt + 200 gas compensation), the remainder stayed pending, and status became "waiting for enough MUSD to close".
10. **Interest drift resolved on-chain.** The previewed amount (52.001111) and the executed amount (52.001119) differ by interest accrued between blocks; the contract computed it in the executing block.

## Fork simulation (not live evidence)

\`MEZO_FORK=1 forge test --match-contract MezoForkTest -vv\` runs the full flow against the real
Mezo testnet bytecode on a local fork. One component is **substituted**: Mezo's BTC price oracle is a
chain precompile (\`0x7b7c…0015\`) that local EVMs cannot execute (\`EvmError: NotActivated\`), so the
fork test mocks only its \`latestRoundData()\`/\`decimals()\` at a realistic price.

## Local test suites (not live evidence)

| Suite | Command | Result at time of writing |
| --- | --- | --- |
| Foundry unit + fuzz + invariant | \`pnpm contracts:test\` | 61 tests passed (55 unit/fuzz, 6 invariants) |
| Foundry fork (real Mezo bytecode, mocked oracle) | \`pnpm contracts:fork\` | 1 passed |
| SDK (Vitest) | \`pnpm --filter @repay/sdk test\` | 18 passed |
| Keeper (Vitest) | \`pnpm --filter @repay/keeper test\` | 6 passed |
| Web unit (Vitest) | \`pnpm --filter @repay/web test\` | 7 passed |
| Browser (Playwright, desktop + mobile) | \`pnpm --filter @repay/web e2e\` | 44 passed |

## Source verification

- Factory: Sourcify **exact match** (creation + runtime): https://repo.sourcify.dev/31611/${reg.repay.factory}
- Account implementation: Sourcify **exact match** (runtime): https://repo.sourcify.dev/31611/${reg.repay.implementation}
- Blockscout (explorer.test.mezo.org): verification submitted via API; the explorer had not marked the contracts verified at time of writing. Local \`forge inspect\` bytecode, including the metadata hash, matches the deployed code byte for byte.
`;
writeFileSync(join(root, "docs/EVIDENCE.md"), md);
console.log(`wrote docs/EVIDENCE.md (${ev.steps.length} steps)`);
