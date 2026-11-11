"use client";
import { useState } from "react";
import { Flag } from "lucide-react";
import { type AccountSnapshot, CLOSE_STATUS_COPY, payoffProgressBps, repayAccountAbi } from "@repay/sdk";
import { TxDialog } from "./TxDialog";
import { Amount, Card, CardHeader, KeyValue, Notice, Pill, cx } from "./ui";

const tone = {
  Ready: "positive",
  Disabled: "neutral",
  Paused: "warning",
  NoActiveLoan: "neutral",
  InsufficientPending: "accent",
} as const;

/**
 * Auto-close: partial repayment stops at Mezo's 1,800 MUSD minimum net debt. With the owner's opt-in,
 * income keeps accumulating in pending repayment, and once it covers the full payoff anyone (normally
 * the keeper) can call `executeClose`. Only pending MUSD is used; operating cash is never touched.
 */
export function AutoCloseCard({ snap }: { snap: AccountSnapshot }) {
  const [dialog, setDialog] = useState<null | "on" | "off" | "close">(null);
  if (snap.version < 3) {
    return (
      <Card className="mt-5" id="auto-close">
        <CardHeader title="Auto-close" description="Lets income retire the last 1,800 MUSD and close the loan automatically." />
        <div className="p-5">
          <Notice>This account was created with contract v{snap.version}, which has no auto-close. Accounts created from the current factory have it.</Notice>
        </div>
      </Card>
    );
  }
  const copy = CLOSE_STATUS_COPY[snap.closeStatus];
  const progress = payoffProgressBps(snap.pendingRepayment, snap.closeRequired);
  const ready = snap.closeStatus === "Ready";
  const remaining = snap.closeRequired > snap.pendingRepayment ? snap.closeRequired - snap.pendingRepayment : 0n;
  const share = snap.policy.repaymentBps;
  // Income still needed at the current repayment share (rounded up), for a plain-language estimate.
  const incomeNeeded = share > 0 ? (remaining * 10_000n + BigInt(share) - 1n) / BigInt(share) : 0n;

  const request =
    dialog === "on" || dialog === "off"
      ? { address: snap.address, abi: repayAccountAbi, functionName: "setAutoClose", args: [dialog === "on"] }
      : dialog === "close" && ready
        ? { address: snap.address, abi: repayAccountAbi, functionName: "executeClose", args: [] }
        : null;

  return (
    <Card className="mt-5" id="auto-close">
      <CardHeader
        title="Auto-close"
        description="Partial repayment stops at Mezo's 1,800 MUSD minimum. With auto-close on, income keeps saving toward the payoff and the keeper closes the loan when it's covered."
        action={
          <Pill tone={tone[snap.closeStatus]} icon={<Flag className="h-3.5 w-3.5" aria-hidden />}>
            {copy.title}
          </Pill>
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-4">
          {snap.loanStatus === "active" && (
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink-muted">Saved toward payoff</span>
                <span className="num font-semibold text-ink" data-testid="payoff-progress">
                  {(progress / 100).toFixed(progress % 100 === 0 ? 0 : 1)}%
                </span>
              </div>
              <div
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-ivory-deep"
                role="progressbar"
                aria-label="Saved toward payoff"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress / 100)}
              >
                <div className={cx("h-full rounded-full transition-all", ready ? "bg-sage" : "bg-copper")} style={{ width: `${progress / 100}%` }} />
              </div>
            </div>
          )}
          <KeyValue
            rows={[
              ["Payoff now (debt minus gas compensation)", <Amount key="r" value={snap.closeRequired} />],
              ["Pending repayment", <Amount key="p" value={snap.pendingRepayment} />],
              ["Still to set aside", <Amount key="s" value={remaining} />],
              [
                "Income needed at your share",
                share > 0 ? <Amount key="i" value={incomeNeeded} /> : <span key="i">Repayment share is 0%</span>,
              ],
            ]}
          />
          <p className="text-[13px] leading-relaxed text-ink-muted">{copy.detail}</p>
          {ready && (
            <Notice tone="positive" title="Pending covers the payoff">
              Closing repays <Amount value={snap.closeRequired} className="font-semibold" /> from pending only and returns the collateral to this account. Anyone can trigger it; the keeper does so
              automatically.
            </Notice>
          )}
          <button className={cx(ready ? "btn-primary" : "btn-secondary")} disabled={!ready} onClick={() => setDialog("close")}>
            Close from pending now
          </button>
        </div>
        <div className="space-y-4 rounded-xl border border-line p-4">
          <p className="text-sm font-medium text-ink">Setting (owner)</p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            When on, a keeper may close the loan as soon as pending repayment covers the payoff. It can only spend pending MUSD, never operating cash, and the BTC stays in this account for
            you to withdraw. Pausing your policy also pauses auto-close.
          </p>
          <button className="btn-secondary" onClick={() => setDialog(snap.autoClose ? "off" : "on")}>
            {snap.autoClose ? "Turn auto-close off" : "Turn auto-close on"}
          </button>
        </div>
      </div>
      <TxDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === "close" ? "Close the loan from pending" : dialog === "on" ? "Turn auto-close on" : "Turn auto-close off"}
        confirmLabel="Confirm"
        request={request}
        summary={
          <KeyValue
            rows={
              dialog === "close"
                ? [
                    ["Repay from pending", <Amount key="a" value={snap.closeRequired} />],
                    ["Operating cash", "Unchanged"],
                    ["Collateral", "Returns to this account"],
                  ]
                : [["Auto-close", dialog === "on" ? "On" : "Off"]]
            }
          />
        }
        warning={
          dialog === "on" ? (
            <Notice>Closing ends the loan: to borrow again you open a new Trove and pay Mezo&apos;s borrowing fee again. Turn this off any time before the payoff is covered.</Notice>
          ) : undefined
        }
        successMessage="Done. Figures refreshed from chain."
      />
    </Card>
  );
}
