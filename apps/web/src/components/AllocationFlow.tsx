import { ArrowRight } from "lucide-react";
import { allocate, formatBps } from "@repay/sdk";
import { Amount, cx } from "./ui";

/** Income → Operating cash + Repayment allocation, proportional and labeled (not color-only). */
export function AllocationFlow({ amount, bps, caption, compact }: { amount: bigint; bps: number; caption?: string; compact?: boolean }) {
  const { toRepayment, toOperating } = allocate(amount, bps);
  const pct = bps / 100;
  return (
    <figure className="w-full">
      <div className={cx("grid items-center gap-3", compact ? "grid-cols-1" : "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,2fr)]")}>
        <div className="rounded-xl border border-line bg-ivory px-4 py-3">
          <p className="eyebrow">Income</p>
          <Amount value={amount} className="mt-1 block text-lg font-semibold" />
        </div>
        <ArrowRight className={cx("mx-auto h-4 w-4 text-ink-muted", compact ? "rotate-90" : "rotate-90 sm:rotate-0")} aria-hidden />
        <div className="space-y-2">
          <div className="flex h-3 overflow-hidden rounded-full bg-ivory-deep" role="img" aria-label={`${formatBps(bps)} to repayment, ${formatBps(10000 - bps)} to operating cash`}>
            <div className="h-full bg-copper transition-[width] duration-300" style={{ width: `${pct}%` }} />
            <div className="h-full flex-1 bg-sage/60" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-copper/25 bg-copper-wash/60 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-copper-deep">
                <span className="h-2 w-2 rounded-sm bg-copper" aria-hidden /> Repayment · {formatBps(bps)}
              </p>
              <Amount value={toRepayment} className="mt-0.5 block font-semibold" />
            </div>
            <div className="rounded-xl border border-sage/30 bg-sage-wash/70 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-sage-deep">
                <span className="h-2 w-2 rounded-sm bg-sage" aria-hidden /> Operating cash · {formatBps(10000 - bps)}
              </p>
              <Amount value={toOperating} className="mt-0.5 block font-semibold" />
            </div>
          </div>
        </div>
      </div>
      {caption && <figcaption className="mt-2 text-xs text-ink-muted">{caption}</figcaption>}
    </figure>
  );
}
