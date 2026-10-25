"use client";
import { useState } from "react";
import Link from "next/link";
import { type LucideIcon, AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Info, Loader2, PauseCircle, XCircle } from "lucide-react";
import { explorerAddress, explorerTx, formatUnits18, shortAddress } from "@repay/sdk";
import { useMode } from "@/lib/mode";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

/** Financial amount with tabular numerals. Unit is rendered smaller and muted. */
export function Amount({
  value,
  unit = "MUSD",
  digits = 2,
  className,
  sign,
}: {
  value: bigint | undefined | null;
  unit?: string;
  digits?: number;
  className?: string;
  sign?: "+" | "−";
}) {
  if (value === undefined || value === null) return <span className={cx("num text-ink-muted", className)}>—</span>;
  return (
    <span className={cx("num whitespace-nowrap", className)}>
      {sign}
      {formatUnits18(value, digits)}
      {unit && <span className="ml-1 text-[0.72em] font-medium text-ink-muted">{unit}</span>}
    </span>
  );
}

type Tone = "neutral" | "positive" | "warning" | "danger" | "accent" | "info";
const toneClass: Record<Tone, string> = {
  neutral: "bg-ivory-deep text-ink-soft border-line",
  positive: "bg-sage-wash text-sage-deep border-sage/30",
  warning: "bg-amber-wash text-amber border-amber/30",
  danger: "bg-rust-wash text-rust border-rust/30",
  accent: "bg-copper-wash text-copper-deep border-copper/30",
  info: "bg-surface text-ink-soft border-line-strong",
};
const toneIcon: Record<Tone, LucideIcon> = {
  neutral: Info,
  positive: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  accent: Info,
  info: Info,
};

/** Status pill: always icon + text, never color alone. */
export function Pill({ tone = "neutral", children, icon, className }: { tone?: Tone; children: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  const Icon = toneIcon[tone];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", toneClass[tone], className)}>
      {icon ?? <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function PausedIcon() {
  return <PauseCircle className="h-3.5 w-3.5" aria-hidden />;
}

export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const Icon = toneIcon[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border p-4 text-sm", toneClass[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={cx("leading-relaxed text-ink-soft", title && "mt-1")}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className, as: As = "section", ...rest }: { children: React.ReactNode; className?: string; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx("card", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, description, action, id }: { title: string; description?: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, children, sub, emphasis }: { label: string; children: React.ReactNode; sub?: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className={cx("mt-1.5 text-ink", emphasis ? "font-display text-[28px] leading-tight tracking-tight" : "text-xl font-semibold")}>{children}</dd>
      {sub && <dd className="mt-1 text-[13px] text-ink-muted">{sub}</dd>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block animate-pulse rounded-md bg-ivory-deep", className ?? "h-5 w-24")} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-4 w-4 animate-spin", className)} aria-hidden />;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost min-h-[36px] px-2.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked */
        }
      }}
      aria-label={`${label}: ${value}`}
    >
      {done ? <Check className="h-3.5 w-3.5 text-sage-deep" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

/** Explorer link for a real transaction. In example mode it renders a non-link label instead. */
export function TxLink({ hash, short = true }: { hash?: string; short?: boolean }) {
  const mode = useMode();
  if (!hash) return null;
  if (mode === "example") return <span className="text-xs text-ink-muted">Sample · no transaction</span>;
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-copper-deep underline-offset-2 hover:underline">
      {short ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash}
      <ExternalLink className="h-3 w-3" aria-hidden />
      <span className="sr-only">(opens Mezo explorer)</span>
    </a>
  );
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  const mode = useMode();
  if (mode === "example") return <span className="font-mono text-sm">{label ?? shortAddress(address)}</span>;
  return (
    <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-sm text-ink underline-offset-2 hover:underline">
      {label ?? shortAddress(address)}
      <ExternalLink className="h-3 w-3 text-ink-muted" aria-hidden />
      <span className="sr-only">(opens Mezo explorer)</span>
    </a>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-full border border-line bg-ivory p-3 text-ink-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function DataError({ error, onRetry, what = "data" }: { error: Error | null; onRetry?: () => void; what?: string }) {
  if (!error) return null;
  return (
    <Notice
      tone="danger"
      title={`Couldn't load ${what} from Mezo testnet`}
      action={
        onRetry && (
          <button className="btn-secondary min-h-[36px]" onClick={onRetry}>
            Try again
          </button>
        )
      }
    >
      The RPC request failed, so nothing is shown instead of guessing. {error.message.split("\n")[0]?.slice(0, 160)}
    </Notice>
  );
}

export function KeyValue({ rows }: { rows: Array<[React.ReactNode, React.ReactNode]> }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-tight tracking-tight text-ink sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-copper-deep underline underline-offset-2 hover:text-copper">
      {children}
    </Link>
  );
}
