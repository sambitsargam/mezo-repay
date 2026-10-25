"use client";
import { type LucideIcon, ArrowDownLeft, ArrowUpRight, Ban, Coins, FileText, Landmark, PauseCircle, Repeat, SlidersHorizontal, Undo2 } from "lucide-react";
import type { ActivityItem, ActivityKind } from "@repay/sdk";
import { formatBps } from "@repay/sdk";
import { Amount, TxLink, cx } from "./ui";

const META: Record<ActivityKind, { label: string; icon: LucideIcon; tone: string }> = {
  payment: { label: "Customer payment", icon: ArrowDownLeft, tone: "text-sage-deep bg-sage-wash" },
  repayment: { label: "Loan repayment", icon: Repeat, tone: "text-copper-deep bg-copper-wash" },
  policy: { label: "Policy updated", icon: SlidersHorizontal, tone: "text-ink-soft bg-ivory-deep" },
  pause: { label: "Automation paused/resumed", icon: PauseCircle, tone: "text-amber bg-amber-wash" },
  withdrawal: { label: "Operating cash withdrawn", icon: ArrowUpRight, tone: "text-ink-soft bg-ivory-deep" },
  loanOpened: { label: "Loan opened", icon: Landmark, tone: "text-ink-soft bg-ivory-deep" },
  loanBorrowed: { label: "Additional borrowing", icon: Landmark, tone: "text-ink-soft bg-ivory-deep" },
  loanClosed: { label: "Loan closed", icon: Landmark, tone: "text-sage-deep bg-sage-wash" },
  collateral: { label: "Collateral change", icon: Coins, tone: "text-ink-soft bg-ivory-deep" },
  release: { label: "Pending released to operating", icon: Undo2, tone: "text-ink-soft bg-ivory-deep" },
  classify: { label: "Direct transfer classified", icon: FileText, tone: "text-ink-soft bg-ivory-deep" },
  capital: { label: "Owner capital deposited", icon: ArrowDownLeft, tone: "text-ink-soft bg-ivory-deep" },
  surplus: { label: "Collateral surplus claimed", icon: Coins, tone: "text-ink-soft bg-ivory-deep" },
  btcWithdrawal: { label: "BTC withdrawn", icon: ArrowUpRight, tone: "text-ink-soft bg-ivory-deep" },
};

export const ACTIVITY_FILTERS: Array<{ id: "all" | ActivityKind | "loan"; label: string }> = [
  { id: "all", label: "All" },
  { id: "payment", label: "Payments" },
  { id: "repayment", label: "Repayments" },
  { id: "policy", label: "Policy" },
  { id: "withdrawal", label: "Withdrawals" },
  { id: "loan", label: "Loan" },
];

export function matchesFilter(i: ActivityItem, f: string): boolean {
  if (f === "all") return true;
  if (f === "loan") return ["loanOpened", "loanBorrowed", "loanClosed", "collateral", "surplus", "btcWithdrawal"].includes(i.kind);
  if (f === "policy") return i.kind === "policy" || i.kind === "pause";
  if (f === "withdrawal") return i.kind === "withdrawal" || i.kind === "release" || i.kind === "btcWithdrawal";
  return i.kind === f;
}

function subline(i: ActivityItem): string | null {
  const d = i.detail;
  if (i.kind === "payment" && d.toRepayment) {
    const toR = BigInt(d.toRepayment);
    const toO = BigInt(d.toOperating ?? "0");
    return `${fmt(toR)} to repayment · ${fmt(toO)} to operating`;
  }
  if (i.kind === "repayment" && d.debtAfter) return `${d.automated === "true" ? "Automated" : "By owner"} · debt now ${fmt(BigInt(d.debtAfter))} MUSD`;
  if (i.kind === "policy" && d.policy) {
    try {
      const p = JSON.parse(d.policy) as { repaymentBps: string };
      return `Repayment share ${formatBps(Number(p.repaymentBps))}`;
    } catch {
      return null;
    }
  }
  if (i.kind === "pause") return d.paused === "true" ? "Paused" : "Resumed";
  if (i.kind === "classify") return d.asRevenue === "true" ? "As revenue" : "As owner capital";
  return null;
}

function fmt(v: bigint) {
  const whole = v / 10n ** 18n;
  const cents = (v % 10n ** 18n) / 10n ** 16n;
  return `${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

export function formatTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ActivityRow({ item, showAccount = false }: { item: ActivityItem; showAccount?: boolean }) {
  const m = META[item.kind];
  const Icon = m.icon;
  const outflow = item.kind === "repayment" || item.kind === "withdrawal" || item.kind === "btcWithdrawal";
  const sub = subline(item);
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <span className={cx("mt-0.5 rounded-lg p-2", m.tone)} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-medium text-ink">
            {m.label}
            {item.reference && <span className="ml-2 font-normal text-ink-muted">· {item.reference}</span>}
          </p>
          {item.amount !== null && item.kind !== "collateral" && item.kind !== "surplus" && item.kind !== "btcWithdrawal" ? (
            <Amount value={item.amount} className={cx("text-sm font-medium", item.kind === "payment" ? "text-sage-deep" : "text-ink")} sign={item.kind === "payment" ? "+" : outflow ? "−" : undefined} />
          ) : item.amount !== null ? (
            <Amount value={item.amount} unit="BTC" digits={6} className="text-sm font-medium" />
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {sub && <span>{sub}</span>}
          <span>{formatTime(item.timestamp)}</span>
          {showAccount && <span className="font-mono">{item.account.slice(0, 8)}…</span>}
          <TxLink hash={item.txHash} />
        </div>
      </div>
    </li>
  );
}

export function NoActivity() {
  return (
    <div className="flex items-center gap-2 px-5 py-8 text-sm text-ink-muted">
      <Ban className="h-4 w-4" aria-hidden /> No on-chain activity for this account yet.
    </div>
  );
}
