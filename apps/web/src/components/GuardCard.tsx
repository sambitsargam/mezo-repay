"use client";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ShieldCheck } from "lucide-react";
import { type AccountSnapshot, GUARD_STATUS_COPY, bpsToRatio, formatRatio, parseUnits18, ratioToBps, repayAccountAbi } from "@repay/sdk";
import { AmountInput } from "./PolicyForm";
import { TxDialog } from "./TxDialog";
import { Amount, Card, CardHeader, KeyValue, Notice, Pill, cx } from "./ui";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const MCR_PCT = 110;

const tone = {
  Disabled: "neutral",
  NoActiveLoan: "neutral",
  PriceUnavailable: "warning",
  Healthy: "positive",
  Protectable: "danger",
  NoResources: "danger",
} as const;

/** Parse a whole-or-decimal percent ("160", "162.5") into basis points of 100%. */
function pctToBps(v: string): number | null {
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(v.trim())) return null;
  return Math.round(Number(v) * 100);
}

export function validateGuardDraft(trigger: string, target: string): { error: string | null; triggerRatio: bigint; targetRatio: bigint } {
  const t = pctToBps(trigger);
  const g = pctToBps(target);
  if (t === null || g === null) return { error: "Enter percentages like 160.", triggerRatio: 0n, targetRatio: 0n };
  if (t <= MCR_PCT * 100) return { error: `Trigger must be above Mezo's ${MCR_PCT}% liquidation line.`, triggerRatio: 0n, targetRatio: 0n };
  if (g < t) return { error: "Target must be at least the trigger.", triggerRatio: 0n, targetRatio: 0n };
  if (g > 100_000) return { error: "Target can be at most 1000%.", triggerRatio: 0n, targetRatio: 0n };
  return { error: null, triggerRatio: bpsToRatio(t), targetRatio: bpsToRatio(g) };
}

/**
 * Collateral guard: when the Trove's ratio falls below the owner's trigger, anyone (normally the keeper)
 * can call `protect`, which applies pending MUSD to the debt first and then adds buffer BTC as collateral.
 */
export function GuardCard({ snap }: { snap: AccountSnapshot }) {
  const { address: wallet } = useAccount();
  const on = snap.guard.triggerRatio > 0n;
  const [trigger, setTrigger] = useState("");
  const [target, setTarget] = useState("");
  useEffect(() => {
    setTrigger(on ? String(ratioToBps(snap.guard.triggerRatio) / 100) : "160");
    setTarget(on ? String(ratioToBps(snap.guard.targetRatio) / 100) : "180");
  }, [on, snap.guard.triggerRatio, snap.guard.targetRatio]);
  const draft = validateGuardDraft(trigger, target);
  const [fund, setFund] = useState("");
  const fundAmt = parseUnits18(fund);
  const [dialog, setDialog] = useState<null | "save" | "off" | "fund" | "withdraw" | "protect">(null);
  const copy = GUARD_STATUS_COPY[snap.guardStatus];
  const canProtect = snap.guardStatus === "Protectable";

  const request =
    dialog === "save" && !draft.error
      ? { address: snap.address, abi: repayAccountAbi, functionName: "setGuard", args: [{ triggerRatio: draft.triggerRatio, targetRatio: draft.targetRatio }] }
      : dialog === "off"
        ? { address: snap.address, abi: repayAccountAbi, functionName: "setGuard", args: [{ triggerRatio: 0n, targetRatio: 0n }] }
        : dialog === "fund" && fundAmt && fundAmt > 0n
          ? { address: snap.address, abi: repayAccountAbi, functionName: "fundBuffer", args: [], value: fundAmt }
          : dialog === "withdraw" && wallet && snap.collateralBuffer > 0n
            ? { address: snap.address, abi: repayAccountAbi, functionName: "withdrawBuffer", args: [wallet, snap.collateralBuffer] }
            : dialog === "protect" && canProtect
              ? { address: snap.address, abi: repayAccountAbi, functionName: "protect", args: [ZERO, ZERO] }
              : null;

  return (
    <Card className="mt-5" id="guard">
      <CardHeader
        title="Collateral guard"
        description="If BTC falls and the ratio drops below your trigger, pending MUSD repays debt first, then buffer BTC tops up collateral."
        action={
          <Pill tone={tone[snap.guardStatus]} icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}>
            {copy.title}
          </Pill>
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-4">
          <KeyValue
            rows={[
              ["Collateral ratio now", <span key="r" className="num font-semibold">{snap.ratio > 0n ? formatRatio(snap.ratio) : "—"}</span>],
              ["Trigger → target", on ? <span key="t" className="num">{formatRatio(snap.guard.triggerRatio, 0)} → {formatRatio(snap.guard.targetRatio, 0)}</span> : "Off"],
              ["BTC buffer for top-ups", <Amount key="b" value={snap.collateralBuffer} unit="BTC" digits={6} />],
              ["Protected so far", <span key="p"><Amount value={snap.totalProtectRepaid} /> repaid · <Amount value={snap.totalProtectTopUp} unit="BTC" digits={6} /> added</span>],
            ]}
          />
          <p className="text-[13px] leading-relaxed text-ink-muted">{copy.detail}</p>
          {canProtect && (
            <Notice tone="danger" title="Protection available now">
              Would repay <Amount value={snap.guardRepay} className="font-semibold" /> from pending and add{" "}
              <Amount value={snap.guardTopUp} unit="BTC" digits={6} className="font-semibold" /> from the buffer. Anyone can trigger it; the keeper does so automatically.
            </Notice>
          )}
          <button className={cx(canProtect ? "btn-primary" : "btn-secondary")} disabled={!canProtect} onClick={() => setDialog("protect")}>
            Protect now
          </button>
        </div>

        <div className="space-y-4 rounded-xl border border-line p-4">
          <p className="text-sm font-medium text-ink">Settings (owner)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="g-trigger" className="label">
                Trigger %
              </label>
              <input id="g-trigger" inputMode="decimal" className={cx("field num", draft.error && "border-rust")} value={trigger} onChange={(e) => setTrigger(e.target.value)} />
            </div>
            <div>
              <label htmlFor="g-target" className="label">
                Target %
              </label>
              <input id="g-target" inputMode="decimal" className={cx("field num", draft.error && "border-rust")} value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </div>
          {draft.error && <p className="text-sm text-rust">{draft.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={!!draft.error} onClick={() => setDialog("save")}>
              {on ? "Update guard" : "Turn guard on"}
            </button>
            {on && (
              <button className="btn-ghost" onClick={() => setDialog("off")}>
                Turn off
              </button>
            )}
          </div>
          <div className="border-t border-line pt-4">
            <label htmlFor="g-fund" className="label">
              Add BTC to the buffer
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <AmountInput id="g-fund" unit="BTC" value={fund} onChange={setFund} placeholder="0.005" />
              </div>
              <button className="btn-secondary" disabled={!fundAmt || fundAmt === 0n} onClick={() => setDialog("fund")}>
                Fund
              </button>
            </div>
            {snap.collateralBuffer > 0n && (
              <button className="btn-ghost mt-2 px-0 text-xs" disabled={!wallet} onClick={() => setDialog("withdraw")}>
                Withdraw the whole buffer to my wallet
              </button>
            )}
          </div>
        </div>
      </div>
      <TxDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={
          dialog === "protect" ? "Protect the loan" : dialog === "fund" ? "Fund the guard buffer" : dialog === "withdraw" ? "Withdraw the buffer" : dialog === "off" ? "Turn the guard off" : "Save guard settings"
        }
        confirmLabel="Confirm"
        request={request}
        summary={
          <KeyValue
            rows={
              dialog === "protect"
                ? [
                    ["Repay from pending", <Amount key="a" value={snap.guardRepay} />],
                    ["Add from buffer", <Amount key="b" value={snap.guardTopUp} unit="BTC" digits={6} />],
                    ["Operating cash", "Unchanged"],
                  ]
                : dialog === "fund"
                  ? [["BTC from your wallet", <Amount key="a" value={fundAmt ?? 0n} unit="BTC" digits={6} />]]
                  : dialog === "withdraw"
                    ? [["BTC to your wallet", <Amount key="a" value={snap.collateralBuffer} unit="BTC" digits={6} />]]
                    : dialog === "off"
                      ? [["Guard", "Off"]]
                      : [
                          ["Trigger", formatRatio(draft.triggerRatio, 1)],
                          ["Target", formatRatio(draft.targetRatio, 1)],
                        ]
            }
          />
        }
        warning={
          dialog === "save" ? (
            <Notice>
              The guard reduces liquidation risk but cannot remove it: it only uses pending MUSD and the buffer you fund. A fast BTC drop can still pass the
              110% line before anyone calls protect.
            </Notice>
          ) : undefined
        }
        successMessage="Done. Figures refreshed from chain."
      />
    </Card>
  );
}
