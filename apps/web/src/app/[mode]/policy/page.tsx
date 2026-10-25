"use client";
import { useState } from "react";
import { repayAccountAbi } from "@repay/sdk";
import { useSelection, useSnapshot } from "@/lib/data";
import { Gate } from "@/components/Gate";
import { PolicyForm, PolicySummary } from "@/components/PolicyForm";
import { TxDialog } from "@/components/TxDialog";
import { Card, CardHeader, DataError, KeyValue, Notice, PageHeader, Skeleton } from "@/components/ui";

export default function PolicyPage() {
  return (
    <Gate need="account">
      <Policy />
    </Gate>
  );
}

function Policy() {
  const { account } = useSelection();
  const snap = useSnapshot(account);
  const [pauseOpen, setPauseOpen] = useState(false);
  const s = snap.data;
  if (snap.error) return <DataError error={snap.error} onRetry={snap.refetch} what="the policy" />;
  return (
    <div className="animate-rise">
      <PageHeader
        title="Repayment policy"
        description="Decide how much of each payment goes to the loan, and when automation may act. Only your wallet can change this."
        action={
          s && (
            <button className={s.policy.paused ? "btn-accent" : "btn-secondary"} onClick={() => setPauseOpen(true)}>
              {s.policy.paused ? "Resume automation" : "Pause automation"}
            </button>
          )
        }
      />
      {s?.policy.paused && (
        <div className="mb-5">
          <Notice tone="warning" title="Automation is paused">
            Payments are still split into pending repayment, but no keeper can repay until you resume. Manual repayment still works.
          </Notice>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Edit policy" description="Changes apply to future payments only" />
          <div className="p-5">{s ? <PolicyForm account={s.address} saved={s.policy} onSaved={() => snap.refetch()} /> : <Skeleton className="h-64 w-full" />}</div>
        </Card>
        <Card>
          <CardHeader title="Saved on-chain" description="Current contract state" />
          <div className="px-5 py-2">{s ? <PolicySummary p={s.policy} /> : <Skeleton className="h-40 w-full" />}</div>
          <div className="border-t border-line px-5 py-4 text-[13px] leading-relaxed text-ink-muted">
            <p className="font-medium text-ink">Exact rules</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Each tracked payment P adds floor(P × share) to pending repayment; the rest is operating cash.</li>
              <li>Automated repayment uses pending funds only, never operating cash.</li>
              <li>It waits while operating cash is below the reserve.</li>
              <li>It is capped by the maximum and by Mezo&apos;s minimum debt; any remainder stays pending.</li>
            </ul>
          </div>
        </Card>
      </div>
      {s && (
        <TxDialog
          open={pauseOpen}
          onOpenChange={setPauseOpen}
          title={s.policy.paused ? "Resume automation" : "Pause automation"}
          confirmLabel={s.policy.paused ? "Resume" : "Pause"}
          request={{ address: s.address, abi: repayAccountAbi, functionName: "setPaused", args: [!s.policy.paused] }}
          summary={<KeyValue rows={[["Automated repayment", s.policy.paused ? "Paused → On" : "On → Paused"], ["Payment splitting", "Unchanged"], ["Manual repayment", "Always available"]]} />}
          onConfirmed={() => snap.refetch()}
          successMessage={s.policy.paused ? "Automation resumed." : "Automation paused."}
        />
      )}
    </div>
  );
}
