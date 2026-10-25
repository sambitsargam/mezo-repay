import { type Address, type Hash, type Hex, type PublicClient, parseEventLogs } from "viem";
import { repayAccountAbi } from "./abi/RePayAccount";
import { decodeReference } from "./reference";

export type ActivityKind =
  | "payment"
  | "repayment"
  | "policy"
  | "pause"
  | "withdrawal"
  | "loanOpened"
  | "loanBorrowed"
  | "loanClosed"
  | "collateral"
  | "release"
  | "classify"
  | "capital"
  | "surplus"
  | "btcWithdrawal";

export interface ActivityItem {
  kind: ActivityKind;
  eventName: string;
  txHash: Hash;
  blockNumber: bigint;
  logIndex: number;
  account: Address;
  amount: bigint | null;
  reference: string;
  actor: Address | null;
  detail: Record<string, string>;
  timestamp: number | null;
}

const KIND: Record<string, ActivityKind> = {
  PaymentReceived: "payment",
  RepaymentExecuted: "repayment",
  PolicyUpdated: "policy",
  AutomationPaused: "pause",
  OperatingWithdrawn: "withdrawal",
  LoanOpened: "loanOpened",
  LoanBorrowed: "loanBorrowed",
  LoanClosed: "loanClosed",
  CollateralAdded: "collateral",
  CollateralWithdrawn: "collateral",
  PendingReleased: "release",
  UnclassifiedClassified: "classify",
  CapitalDeposited: "capital",
  CollateralSurplusClaimed: "surplus",
  BtcWithdrawn: "btcWithdrawal",
};

function str(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object" && v !== null) {
    return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
  }
  return String(v);
}

/**
 * Reads account events in bounded block ranges (Mezo RPC limits wide eth_getLogs ranges).
 * Retries transient failures with bounded backoff; throws if a range keeps failing.
 */
export async function readActivity(
  client: PublicClient,
  account: Address,
  fromBlock: bigint,
  toBlock?: bigint,
  opts: { chunk?: bigint; withTimestamps?: boolean } = {},
): Promise<ActivityItem[]> {
  const end = toBlock ?? (await client.getBlockNumber());
  const chunk = opts.chunk ?? 10_000n;
  const items: ActivityItem[] = [];
  for (let start = fromBlock; start <= end; start += chunk) {
    const stop = start + chunk - 1n > end ? end : start + chunk - 1n;
    const logs = await withRetry(() => client.getLogs({ address: account, fromBlock: start, toBlock: stop }));
    const parsed = parseEventLogs({ abi: repayAccountAbi, logs, strict: false });
    for (const log of parsed) {
      const name = log.eventName as string | undefined;
      if (!name || !(name in KIND)) continue;
      const args = (log.args ?? {}) as Record<string, unknown>;
      const amount =
        typeof args.amount === "bigint"
          ? args.amount
          : typeof args.debtRepaid === "bigint"
            ? args.debtRepaid
            : typeof args.borrowed === "bigint"
              ? args.borrowed
              : null;
      const ref = typeof args.ref === "string" ? decodeReference(args.ref as Hex) : "";
      const actor = (args.payer ?? args.executor ?? args.to ?? args.from ?? null) as Address | null;
      const detail: Record<string, string> = {};
      for (const [k, v] of Object.entries(args)) detail[k] = str(v);
      items.push({
        kind: KIND[name]!,
        eventName: name,
        txHash: log.transactionHash!,
        blockNumber: log.blockNumber!,
        logIndex: log.logIndex!,
        account,
        amount,
        reference: ref,
        actor,
        detail,
        timestamp: null,
      });
    }
  }
  if (opts.withTimestamps) {
    const blocks = [...new Set(items.map((i) => i.blockNumber))];
    const times = new Map<bigint, number>();
    await Promise.all(
      blocks.map(async (b) => {
        const blk = await withRetry(() => client.getBlock({ blockNumber: b }));
        times.set(b, Number(blk.timestamp));
      }),
    );
    for (const i of items) i.timestamp = times.get(i.blockNumber) ?? null;
  }
  return items.sort((a, b) =>
    a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber),
  );
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseMs = 400): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

export function activityToCsv(items: ActivityItem[], explorerTx: (h: string) => string): string {
  const header = ["timestamp_utc", "event", "amount_musd_wei", "reference", "actor", "account", "block", "tx_hash", "explorer"];
  const rows = items.map((i) => [
    i.timestamp ? new Date(i.timestamp * 1000).toISOString() : "",
    i.eventName,
    i.amount?.toString() ?? "",
    i.reference,
    i.actor ?? "",
    i.account,
    i.blockNumber.toString(),
    i.txHash,
    explorerTx(i.txHash),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

function csvCell(v: string): string {
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
