import { NextResponse } from "next/server";
import { type Address, createPublicClient, getAddress, http, parseAbiItem } from "viem";
import { getDeployment, mezoTestnet, readAccountSnapshot, repayAccountFactoryAbi } from "@repay/sdk";

/**
 * Public status for the hosted keeper, built only from public sources:
 *  - chain: accounts, their current status, and actions sent by the keeper's address;
 *  - GitHub: the scheduled workflow's recent runs (public repository API).
 * No keys are read here. Same response shape as services/keeper's GET /status.
 */
export const dynamic = "force-dynamic";

const LOOKBACK_BLOCKS = 60_000n;
const CHUNK = 10_000n;
const repaid = parseAbiItem(
  "event RepaymentExecuted(address indexed executor, uint256 amount, uint256 debtBefore, uint256 debtAfter, bool automated, bool fromPending)",
);
const protectedEv = parseAbiItem(
  "event CollateralProtected(address indexed executor, uint256 ratioBefore, uint256 ratioAfter, uint256 repaid, uint256 collateralAdded)",
);

const closedEv = parseAbiItem("event AutoClosed(address indexed executor, uint256 debtRepaid, uint256 collateralReturned)");

interface Run {
  status: string;
  conclusion: string | null;
  updated_at: string;
  html_url: string;
  event: string;
}

export async function GET() {
  const d = getDeployment(mezoTestnet.id);
  if (!d?.repay || !d.keeper) return NextResponse.json({ error: "no hosted keeper registered" }, { status: 404 });
  const keeper = d.keeper;
  const factory = d.repay.factory;
  const client = createPublicClient({ chain: mezoTestnet, transport: http(process.env.NEXT_PUBLIC_MEZO_RPC_URL || undefined, { retryCount: 2, timeout: 15_000 }) });

  const runsP = fetch(keeper.workflowApi, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as { workflow_runs: Run[] }).workflow_runs : null))
    .catch(() => null);

  const [count, head] = await Promise.all([
    client.readContract({ address: factory, abi: repayAccountFactoryAbi, functionName: "accountCount" }),
    client.getBlockNumber(),
  ]);
  const accounts = (count > 0n
    ? await client.readContract({ address: factory, abi: repayAccountFactoryAbi, functionName: "accountsSlice", args: [0n, count > 50n ? 50n : count] })
    : []) as readonly Address[];

  // Keeper actions on any RePay account, newest first, within a bounded lookback.
  const start = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
  const from0 = start > BigInt(d.repay.deploymentBlock) ? start : BigInt(d.repay.deploymentBlock);
  type Action = { kind: "executed" | "protected" | "closed"; account: Address; txHash: `0x${string}`; blockNumber: bigint; amount: string };
  const actions: Action[] = [];
  if (accounts.length) {
    for (let to = head; to >= from0 && actions.length === 0; to -= CHUNK) {
      const from = to - CHUNK + 1n > from0 ? to - CHUNK + 1n : from0;
      const [c, r, p] = await Promise.all([
        client.getLogs({ address: [...accounts], event: closedEv, args: { executor: keeper.address }, fromBlock: from, toBlock: to }),
        client.getLogs({ address: [...accounts], event: repaid, args: { executor: keeper.address }, fromBlock: from, toBlock: to }),
        client.getLogs({ address: [...accounts], event: protectedEv, args: { executor: keeper.address }, fromBlock: from, toBlock: to }),
      ]);
      // protect() also emits RepaymentExecuted for its repayment part; label that tx "protected".
      const guardTxs = new Set(p.map((l) => l.transactionHash));
      for (const l of r) {
        if (guardTxs.has(l.transactionHash)) continue;
        actions.push({ kind: "executed", account: getAddress(l.address), txHash: l.transactionHash, blockNumber: l.blockNumber, amount: l.args.amount!.toString() });
      }
      for (const l of c) actions.push({ kind: "closed", account: getAddress(l.address), txHash: l.transactionHash, blockNumber: l.blockNumber, amount: l.args.debtRepaid!.toString() });
      for (const l of p) actions.push({ kind: "protected", account: getAddress(l.address), txHash: l.transactionHash, blockNumber: l.blockNumber, amount: l.args.repaid!.toString() });
      if (from === from0) break;
    }
  }
  actions.sort((a, b) => Number(b.blockNumber - a.blockNumber));
  const last = actions[0];
  const lastAt = last ? new Date(Number((await client.getBlock({ blockNumber: last.blockNumber })).timestamp) * 1000).toISOString() : null;

  const runs = await runsP;
  const scheduled = runs?.filter((r) => r.status === "completed") ?? [];
  const lastOk = scheduled.find((r) => r.conclusion === "success");
  const latest = runs?.[0];

  const statuses: Record<string, unknown> = {};
  await Promise.all(
    accounts.map(async (a) => {
      try {
        const s = await readAccountSnapshot(client, a);
        const mine = actions.find((x) => x.account === a);
        statuses[a] = {
          account: a,
          owner: s.owner,
          previewStatus: s.previewStatus,
          previewAmount: s.previewAmount.toString(),
          guardStatus: s.guardStatus,
          ratio: s.ratio.toString(),
          closeStatus: s.closeStatus,
          closeRequired: s.closeRequired.toString(),
          pendingRepayment: s.pendingRepayment.toString(),
          debt: s.debt.toString(),
          checkedAt: lastOk?.updated_at ?? null,
          lastAction: mine ? { kind: mine.kind, at: mine === last ? lastAt : null, txHash: mine.txHash, amount: mine.amount } : undefined,
        };
      } catch {
        /* skip unreadable accounts */
      }
    }),
  );

  return NextResponse.json(
    {
      source: "chain + GitHub Actions API (public data only)",
      host: keeper.host,
      workflow: keeper.workflow,
      mode: "live",
      chainId: mezoTestnet.id,
      factory,
      keeperAddress: keeper.address,
      keeperBalanceWei: (await client.getBalance({ address: keeper.address })).toString(),
      pollSeconds: keeper.intervalSeconds,
      lastSuccessfulScanAt: lastOk?.updated_at ?? null,
      lastRun: latest ? { status: latest.status, conclusion: latest.conclusion, at: latest.updated_at, url: latest.html_url, event: latest.event } : null,
      lastExecution: last ? { account: last.account, kind: last.kind, txHash: last.txHash, amount: last.amount, at: lastAt, blockNumber: last.blockNumber.toString() } : null,
      accounts,
      statuses,
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
