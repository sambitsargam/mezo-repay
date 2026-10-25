"use client";
import { useEffect, useMemo, useState } from "react";
import { type Policy, percentToBps, formatBps, formatDuration, formatUnits18, parseUnits18, repayAccountAbi } from "@repay/sdk";
import type { Address } from "viem";
import { AllocationFlow } from "./AllocationFlow";
import { TxDialog } from "./TxDialog";
import { Amount, KeyValue, Notice, Pill, cx } from "./ui";

const COOLDOWNS = [
  { v: 0, label: "None" },
  { v: 300, label: "5 min" },
  { v: 3600, label: "1 hour" },
  { v: 86400, label: "1 day" },
  { v: 604800, label: "7 days" },
];

interface Draft {
  pct: string;
  reserve: string;
  min: string;
  max: string;
  cooldown: number;
  paused: boolean;
}

function toDraft(p: Policy): Draft {
  const strip = (v: bigint) => (v === 0n ? "" : formatUnits18(v, 2).replace(/,/g, "").replace(/\.00$/, ""));
  return {
    pct: String(p.repaymentBps / 100),
    reserve: strip(p.operatingReserve),
    min: strip(p.minExecution),
    max: strip(p.maxExecution),
    cooldown: p.cooldown,
    paused: p.paused,
  };
}

export type ParsedPolicy = { ok: true; policy: Policy } | { ok: false; errors: Partial<Record<keyof Draft, string>> };

/** Validates the draft exactly like RePayAccount._validatePolicy, plus input-format checks. */
export function parsePolicyDraft(d: Draft): ParsedPolicy {
  const errors: Partial<Record<keyof Draft, string>> = {};
  const bps = percentToBps(d.pct);
  if (bps === null) errors.pct = "Enter a percentage from 0 to 100 (up to 2 decimals).";
  const pctNum = bps ?? 0;
  const amt = (s: string, k: keyof Draft) => {
    if (s.trim() === "") return 0n;
    const v = parseUnits18(s);
    if (v === null) errors[k] = "Enter a plain number, e.g. 250 or 250.50.";
    return v ?? 0n;
  };
  const reserve = amt(d.reserve, "reserve");
  const min = amt(d.min, "min");
  const max = amt(d.max, "max");
  if (!errors.max && max !== 0n && max < min) errors.max = "Maximum must be at least the minimum (or empty for no cap).";
  if (d.cooldown < 0 || d.cooldown > 30 * 86400) errors.cooldown = "Cooldown must be 30 days or less.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, policy: { repaymentBps: pctNum, cooldown: d.cooldown, paused: d.paused, operatingReserve: reserve, minExecution: min, maxExecution: max } };
}

function samePolicy(a: Policy, b: Policy) {
  return (
    a.repaymentBps === b.repaymentBps &&
    a.cooldown === b.cooldown &&
    a.paused === b.paused &&
    a.operatingReserve === b.operatingReserve &&
    a.minExecution === b.minExecution &&
    a.maxExecution === b.maxExecution
  );
}

export function PolicyForm({ account, saved, onSaved }: { account: Address; saved: Policy; onSaved?: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [preview, setPreview] = useState("1000");
  const [open, setOpen] = useState(false);
  const savedKey = JSON.stringify(saved, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  useEffect(() => setDraft(toDraft(saved)), [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => parsePolicyDraft(draft), [draft]);
  const dirty = parsed.ok ? !samePolicy(parsed.policy, saved) : true;
  const previewAmount = parseUnits18(preview) ?? 0n;
  const bpsForPreview = parsed.ok ? parsed.policy.repaymentBps : saved.repaymentBps;
  const err = parsed.ok ? {} : parsed.errors;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const changes: Array<[string, string, string]> = [];
  if (parsed.ok) {
    const p = parsed.policy;
    const money = (v: bigint, empty: string) => (v === 0n ? empty : `${formatUnits18(v)} MUSD`);
    if (p.repaymentBps !== saved.repaymentBps) changes.push(["Repayment share", formatBps(saved.repaymentBps), formatBps(p.repaymentBps)]);
    if (p.operatingReserve !== saved.operatingReserve) changes.push(["Operating reserve", money(saved.operatingReserve, "None"), money(p.operatingReserve, "None")]);
    if (p.minExecution !== saved.minExecution) changes.push(["Minimum execution", money(saved.minExecution, "Any"), money(p.minExecution, "Any")]);
    if (p.maxExecution !== saved.maxExecution) changes.push(["Maximum execution", money(saved.maxExecution, "No cap"), money(p.maxExecution, "No cap")]);
    if (p.cooldown !== saved.cooldown) changes.push(["Cooldown", formatDuration(saved.cooldown), formatDuration(p.cooldown)]);
    if (p.paused !== saved.paused) changes.push(["Automation", saved.paused ? "Paused" : "On", p.paused ? "Paused" : "On"]);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed.ok && dirty) setOpen(true);
      }}
      noValidate
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <fieldset>
            <legend className="label">Repayment share of each tracked payment</legend>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Number.isNaN(Number(draft.pct)) ? 0 : Math.min(100, Number(draft.pct))}
                onChange={(e) => set("pct", e.target.value)}
                className="h-11 flex-1 accent-[rgb(var(--copper))]"
                aria-label="Repayment share slider"
                aria-valuetext={`${draft.pct} percent`}
              />
              <div className="relative w-28">
                <input
                  id="pct"
                  inputMode="decimal"
                  className={cx("field num pr-8 text-right", err.pct && "border-rust")}
                  value={draft.pct}
                  onChange={(e) => set("pct", e.target.value)}
                  aria-describedby="pct-hint pct-err"
                  aria-invalid={!!err.pct}
                  aria-label="Repayment share percent"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">%</span>
              </div>
            </div>
            <p id="pct-hint" className="hint">
              Applied once to each payment as it arrives, rounded down to the smallest unit. Changing it does not re-split past payments.
            </p>
            {err.pct && <p id="pct-err" className="mt-1 text-sm text-rust">{err.pct}</p>}
          </fieldset>

          <div>
            <label htmlFor="reserve" className="label">
              Operating cash reserve
            </label>
            <AmountInput id="reserve" value={draft.reserve} onChange={(v) => set("reserve", v)} placeholder="0" error={err.reserve} />
            <p className="hint">Automated repayment waits while operating cash is below this amount, so the business keeps working capital.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="min" className="label">
                Minimum per execution
              </label>
              <AmountInput id="min" value={draft.min} onChange={(v) => set("min", v)} placeholder="Any" error={err.min} />
              <p className="hint">Skip tiny repayments that aren&apos;t worth the gas.</p>
            </div>
            <div>
              <label htmlFor="max" className="label">
                Maximum per execution
              </label>
              <AmountInput id="max" value={draft.max} onChange={(v) => set("max", v)} placeholder="No cap" error={err.max} />
              <p className="hint">Caps a single automated repayment.</p>
            </div>
          </div>

          <fieldset>
            <legend className="label">Cooldown between automated repayments</legend>
            <div className="flex flex-wrap gap-2">
              {COOLDOWNS.map((c) => (
                <label key={c.v} className={cx("btn min-h-[40px] cursor-pointer border", draft.cooldown === c.v ? "border-ink bg-ink text-ivory" : "border-line-strong bg-surface text-ink hover:bg-ivory-deep")}>
                  <input type="radio" name="cooldown" className="sr-only" checked={draft.cooldown === c.v} onChange={() => set("cooldown", c.v)} />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-ivory/60 p-4">
            <div>
              <p id="pause-label" className="text-sm font-medium text-ink">
                Automated repayment
              </p>
              <p className="mt-0.5 text-[13px] text-ink-muted">Pausing stops keepers. You can still repay manually, and payments are still split.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!draft.paused}
              aria-labelledby="pause-label"
              onClick={() => set("paused", !draft.paused)}
              className={cx("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors", draft.paused ? "border-line-strong bg-ivory-deep" : "border-sage bg-sage")}
            >
              <span className={cx("inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform", draft.paused ? "translate-x-1" : "translate-x-6")} />
              <span className="sr-only">{draft.paused ? "Paused" : "On"}</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-ivory/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink">Preview a payment</p>
              <div className="w-36">
                <AmountInput id="preview" value={preview} onChange={setPreview} placeholder="1000" ariaLabel="Hypothetical payment amount" />
              </div>
            </div>
            <AllocationFlow amount={previewAmount} bps={bpsForPreview} compact />
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              Hypothetical. Actual repayment also respects the reserve, limits, cooldown and Mezo&apos;s minimum debt.
            </p>
          </div>

          <div className="rounded-2xl border border-line p-4" aria-live="polite">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Changes</p>
              {dirty && parsed.ok ? <Pill tone="accent">Unsaved</Pill> : <Pill tone="positive">Matches saved policy</Pill>}
            </div>
            {changes.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {changes.map(([k, a, b]) => (
                  <li key={k} className="flex flex-wrap justify-between gap-2">
                    <span className="text-ink-muted">{k}</span>
                    <span className="num">
                      <span className="text-ink-muted line-through">{a}</span> → <span className="font-medium text-ink">{b}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">No pending changes.</p>
            )}
            <div className="mt-4 flex gap-2">
              <button type="submit" className="btn-primary flex-1" disabled={!parsed.ok || !dirty}>
                Review & save
              </button>
              <button type="button" className="btn-ghost" disabled={!dirty} onClick={() => setDraft(toDraft(saved))}>
                Discard
              </button>
            </div>
          </div>
        </div>
      </div>

      <TxDialog
        open={open}
        onOpenChange={setOpen}
        title="Save repayment policy"
        description="Applies to payments received after this transaction. Existing pending repayment is unchanged."
        confirmLabel="Save policy"
        request={parsed.ok ? { address: account, abi: repayAccountAbi, functionName: "setPolicy", args: [parsed.policy] } : null}
        summary={<KeyValue rows={changes.map(([k, a, b]) => [k, <span key={k} className="num">{a} → <strong>{b}</strong></span>])} />}
        onConfirmed={() => onSaved?.()}
        successMessage="Policy saved on-chain."
      />
      {!parsed.ok && <span className="sr-only" role="alert">Fix the highlighted fields to continue.</span>}
    </form>
  );
}

export function AmountInput({ id, value, onChange, placeholder, error, ariaLabel, unit = "MUSD" }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string; ariaLabel?: string; unit?: string }) {
  return (
    <>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className={cx("field num pr-16", error && "border-rust")}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          aria-label={ariaLabel}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-muted">{unit}</span>
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm text-rust">
          {error}
        </p>
      )}
    </>
  );
}

export function PolicySummary({ p }: { p: Policy }) {
  return (
    <KeyValue
      rows={[
        ["Repayment share", <span key="a" className="num font-medium">{formatBps(p.repaymentBps)}</span>],
        ["Operating reserve", p.operatingReserve === 0n ? "None" : <Amount key="b" value={p.operatingReserve} />],
        ["Minimum per execution", p.minExecution === 0n ? "Any amount" : <Amount key="c" value={p.minExecution} />],
        ["Maximum per execution", p.maxExecution === 0n ? "No cap" : <Amount key="d" value={p.maxExecution} />],
        ["Cooldown", formatDuration(p.cooldown)],
        ["Automation", p.paused ? <Pill key="e" tone="warning">Paused</Pill> : <Pill key="e" tone="positive">On</Pill>],
      ]}
    />
  );
}

export function NoticeProspective() {
  return <Notice>Policy changes are prospective: payments already split keep their allocation.</Notice>;
}
