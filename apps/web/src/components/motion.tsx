"use client";
import { useEffect, useRef, useState } from "react";
import { formatRatio, formatUnits18 } from "@repay/sdk";
import { useMode } from "@/lib/mode";
import { cx } from "./ui";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Amount that eases from its previous value to the new one when chain data changes.
 * Intermediate frames are display-only approximations; the final frame is always the exact bigint.
 */
export function CountUp({ value, digits = 2, unit = "MUSD", className, duration = 700 }: { value: bigint | undefined | null; digits?: number; unit?: string; className?: string; duration?: number }) {
  const [shown, setShown] = useState<string | null>(value == null ? null : formatUnits18(value, digits));
  const prev = useRef<bigint | null>(null);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (value == null) return;
    const from = prev.current;
    prev.current = value;
    if (from === null || from === value || prefersReducedMotion()) {
      setShown(formatUnits18(value, digits));
      if (from !== null && from !== value) setFlash((f) => f + 1);
      return;
    }
    setFlash((f) => f + 1);
    const start = performance.now();
    const a = Number(from) / 1e18;
    const b = Number(value) / 1e18;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      if (k < 1) {
        const v = a + (b - a) * e;
        setShown(v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
        raf = requestAnimationFrame(tick);
      } else setShown(formatUnits18(value, digits));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, digits, duration]);
  if (shown === null) return <span className={cx("num text-ink-muted", className)}>—</span>;
  return (
    <span key={flash} className={cx("num rounded-md", flash > 0 && "animate-flash", className)}>
      <span className="whitespace-nowrap">{shown}</span>
      {unit && <span className="ml-1 whitespace-nowrap text-[0.72em] font-medium text-ink-muted">{unit}</span>}
    </span>
  );
}

const WAD = 10n ** 18n;

/**
 * Collateral ratio meter. Scale 100%–300%; marks Mezo's 110% liquidation line and 150% (CCR).
 * Zones are labeled in text, not color alone.
 */
export function RatioGauge({ ratio, mcr, ccr }: { ratio: bigint | null; mcr: bigint; ccr: bigint }) {
  const toPct = (r: bigint) => Math.max(0, Math.min(100, ((Number((r * 1000n) / WAD) / 10 - 100) / 200) * 100));
  const pos = ratio === null ? 0 : toPct(ratio);
  const zone = ratio === null ? "—" : ratio < mcr ? "Below minimum" : ratio < ccr ? "Close to minimum" : ratio < 2n * WAD ? "Moderate buffer" : "Comfortable buffer";
  const valueNow: number | undefined = ratio === null ? undefined : Number(ratio / (WAD / 100n));
  const tone = ratio === null ? "bg-line" : ratio < mcr ? "bg-rust" : ratio < ccr ? "bg-amber" : "bg-sage";
  return (
    <div>
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-rust/25 via-amber/25 to-sage/30" role="meter" aria-valuemin={100} aria-valuemax={300} aria-valuenow={valueNow} aria-label={`Collateral ratio ${formatRatio(ratio)}, ${zone}`}>
        <div className={cx("animate-grow absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${pos}%` }} />
        {[mcr, ccr].map((m, i) => (
          <span key={i} className="absolute -top-1 w-px bg-ink/50" style={{ left: `${toPct(m)}%`, height: 18 }} aria-hidden />
        ))}
        <span className="absolute -top-[5px] h-5 w-5 -translate-x-1/2 rounded-full border-2 border-surface shadow-card transition-[left] duration-700" style={{ left: `${pos}%`, background: "rgb(var(--ink))" }} aria-hidden />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
        <span>100%</span>
        <span>300%+</span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
        <span className="font-medium">{zone}</span>
        <span className="inline-flex items-center gap-1 text-ink-muted">
          <span className="h-3 w-px bg-ink/50" aria-hidden /> {formatRatio(mcr, 0)} liquidation
        </span>
        <span className="inline-flex items-center gap-1 text-ink-muted">
          <span className="h-3 w-px bg-ink/50" aria-hidden /> {formatRatio(ccr, 0)} Mezo recovery threshold
        </span>
      </p>
    </div>
  );
}

/** How much of the debt has been paid down since the account started, and how much is still repayable before Mezo's floor. */
export function DebtProgress({ debt, repaid, floor }: { debt: bigint; repaid: bigint; floor: bigint }) {
  const start = debt + repaid;
  if (start === 0n) return null;
  const paidPct = Number((repaid * 10000n) / start) / 100;
  const floorPct = Number((floor * 10000n) / start) / 100;
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-ivory-deep" role="img" aria-label={`${paidPct.toFixed(1)}% of the debt repaid`}>
        <div className="animate-grow flow-stripes absolute inset-y-0 left-0 rounded-full bg-sage" style={{ width: `${paidPct}%` }} />
        <div className="absolute inset-y-0 right-0 border-l border-dashed border-ink/30 bg-[repeating-linear-gradient(135deg,rgb(var(--ink)/.08)_0_4px,transparent_4px_8px)]" style={{ width: `${Math.min(100 - paidPct, floorPct)}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
        <span>
          <span className="font-medium text-sage-deep">{paidPct.toFixed(1)}% repaid</span> since the account opened its loan
        </span>
        <span>Hatched: Mezo minimum (needs full close)</span>
      </div>
    </div>
  );
}

/** "Live · updated 8s ago" with a soft pulse. Only shown for live chain data. */
export function LiveIndicator({ updatedAt, fetching }: { updatedAt: number; fetching?: boolean }) {
  const mode = useMode();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (mode !== "live" || !updatedAt) return null;
  const s = Math.max(0, Math.round((now - updatedAt) / 1000));
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-muted" aria-live="off">
      <span className="relative flex h-2 w-2">
        <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-sage" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-sage" />
      </span>
      Live from Mezo testnet · {fetching ? "refreshing…" : `updated ${s < 2 ? "just now" : `${s}s ago`}`}
    </span>
  );
}
