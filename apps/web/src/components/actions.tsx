"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { type AccountSnapshot, type ProtocolParams, REPAYMENT_STATUS_COPY, closeAmount, collateralRatio, formatRatio, parseUnits18, repayAccountAbi } from "@repay/sdk";
import { AmountInput } from "./PolicyForm";
import { TxDialog } from "./TxDialog";
import { Amount, Card, CardHeader, KeyValue, Notice } from "./ui";

/** Execute the automated repayment now. Anyone may call it; the contract computes the amount. */
export function ExecuteRepaymentButton({ snap, params, className = "btn-accent" }: { snap: AccountSnapshot; params?: ProtocolParams; className?: string }) {
  const [open, setOpen] = useState(false);
  const ready = snap.previewStatus === "Ready";
  const after = snap.debt - snap.previewAmount;
  const crNow = params ? collateralRatio(snap.collateral, snap.debt, params.price) : null;
  const crAfter = params ? collateralRatio(snap.collateral, after, params.price) : null;
  return (
    <>
      <button className={className} disabled={!ready} onClick={() => setOpen(true)} title={ready ? undefined : REPAYMENT_STATUS_COPY[snap.previewStatus].title}>
        Repay <Amount value={snap.previewAmount} className="font-semibold" unit="MUSD" /> now
      </button>
      <TxDialog
        open={open}
        onOpenChange={setOpen}
        title="Execute repayment"
        description="Applies the pending allocation to this account's Mezo loan, exactly as a keeper would."
        confirmLabel="Repay now"
        request={ready ? { address: snap.address, abi: repayAccountAbi, functionName: "executeRepayment", args: ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"] } : null}
        summary={
          <KeyValue
            rows={[
              ["Repayment (from pending)", <Amount key="a" value={snap.previewAmount} className="font-semibold" />],
              ["Debt now", <Amount key="b" value={snap.debt} />],
              ["Debt after (estimate)", <Amount key="c" value={after} />],
              ["Collateral ratio", <span key="d" className="num">{formatRatio(crNow)} → {formatRatio(crAfter)}</span>],
              ["Operating cash", <span key="e">Unchanged</span>],
            ]}
          />
        }
        warning={<Notice>The contract recomputes the amount when the transaction runs. Interest accrued since this preview can change the final figure slightly.</Notice>}
        successMessage="Repayment applied. Debt and balances have been refreshed from chain."
      />
    </>
  );
}

export function CloseLoanButton({ snap, params }: { snap: AccountSnapshot; params?: ProtocolParams }) {
  const [open, setOpen] = useState(false);
  const gas = params?.gasCompensation ?? 0n;
  const required = closeAmount(snap.debt, gas);
  const available = snap.pendingRepayment + snap.operatingCash;
  const fromPending = required < snap.pendingRepayment ? required : snap.pendingRepayment;
  const fromOperating = required > fromPending ? required - fromPending : 0n;
  const short = available < required ? required - available : 0n;
  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)} disabled={snap.loanStatus !== "active" || !params}>
        Close loan
      </button>
      <TxDialog
        open={open}
        onOpenChange={setOpen}
        title="Close the loan"
        description="Repays all debt and returns the BTC collateral to this account. Only you, the owner, can do this."
        confirmLabel="Close loan"
        destructive
        request={short === 0n ? { address: snap.address, abi: repayAccountAbi, functionName: "closeLoan", args: [] } : null}
        blocker={short > 0n ? `The account needs ${(Number(short / 10n ** 16n) / 100).toFixed(2)} more MUSD to close. Receive more payments or deposit capital.` : null}
        summary={
          <KeyValue
            rows={[
              ["Total debt", <Amount key="a" value={snap.debt} />],
              ["Gas compensation (burned from Mezo's gas pool)", <Amount key="b" value={gas} sign="−" />],
              ["MUSD required", <Amount key="c" value={required} className="font-semibold" />],
              ["From pending repayment", <Amount key="d" value={fromPending} />],
              ["From operating cash", <Amount key="e" value={fromOperating} />],
              ["Collateral returned to account", <Amount key="f" value={snap.collateral} unit="BTC" digits={6} />],
            ]}
          />
        }
        warning={<Notice tone="warning">Closing is blocked by Mezo while the system is in recovery mode. Interest accrues every second, so the required amount may rise slightly before confirmation.</Notice>}
        successMessage="Loan closed. Collateral is now held by the account; withdraw it from the Loan page."
      />
    </>
  );
}

export function WithdrawOperatingCard({ snap }: { snap: AccountSnapshot }) {
  const { address: wallet } = useAccount();
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState(false);
  const amt = parseUnits18(amount);
  const error = amount && amt === null ? "Enter a number." : amt !== null && amt > snap.operatingCash ? "More than available operating cash." : null;
  const valid = amt !== null && amt > 0n && !error && !!wallet;
  const belowReserve = amt !== null && snap.operatingCash - (amt > snap.operatingCash ? snap.operatingCash : amt) < snap.policy.operatingReserve;
  return (
    <Card>
      <CardHeader title="Withdraw operating cash" description="Send MUSD from the account to your wallet" />
      <div className="space-y-3 p-5">
        <p className="text-sm">
          Available: <Amount value={snap.operatingCash} className="font-semibold" />{" "}
          <span className="text-ink-muted">· pending repayment is not withdrawable here</span>
        </p>
        <AmountInput id="withdraw" value={amount} onChange={setAmount} placeholder="0" error={error ?? undefined} ariaLabel="Amount to withdraw" />
        <button className="btn-secondary" disabled={!valid} onClick={() => setOpen(true)}>
          Review withdrawal
        </button>
      </div>
      <TxDialog
        open={open}
        onOpenChange={setOpen}
        title="Withdraw operating cash"
        confirmLabel="Withdraw"
        request={valid ? { address: snap.address, abi: repayAccountAbi, functionName: "withdrawOperating", args: [wallet!, amt!] } : null}
        summary={<KeyValue rows={[["Amount", <Amount key="a" value={amt ?? 0n} />], ["To", "Your connected wallet"], ["Pending repayment", "Unchanged"]]} />}
        warning={belowReserve ? <Notice tone="warning">This takes operating cash below your reserve, so automated repayment will wait until it recovers.</Notice> : undefined}
        successMessage="Withdrawn to your wallet."
      />
    </Card>
  );
}
