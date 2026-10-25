"use client";
import { Bot, ShieldCheck } from "lucide-react";
import { REPAYMENT_STATUS_COPY, formatDuration } from "@repay/sdk";
import { useMode } from "@/lib/mode";
import { useKeeper, useProtocol, useSelection, useSnapshot } from "@/lib/data";
import { EXAMPLE_NOW } from "@/lib/example";
import { Gate } from "@/components/Gate";
import { ExecuteRepaymentButton } from "@/components/actions";
import { Amount, Card, CardHeader, DataError, KeyValue, Notice, PageHeader, Pill, Skeleton, TxLink } from "@/components/ui";

function ago(iso: string | null, now: number): string {
  if (!iso) return "Never";
  const s = Math.max(0, Math.round(now - Date.parse(iso) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export default function AutomationPage() {
  return (
    <Gate need="account">
      <Automation />
    </Gate>
  );
}

function Automation() {
  const mode = useMode();
  const { account } = useSelection();
  const snap = useSnapshot(account);
  const params = useProtocol();
  const keeper = useKeeper(account);
  const s = snap.data;
  const k = keeper.data;
  const now = mode === "example" ? EXAMPLE_NOW : Date.now() / 1000;
  if (snap.error) return <DataError error={snap.error} onRetry={snap.refetch} what="the account" />;
  if (!s || !k) return <Skeleton className="h-64 w-full" />;

  const fresh = k.reachable && k.lastSuccessfulScanAt && k.pollSeconds ? now - Date.parse(k.lastSuccessfulScanAt) / 1000 < k.pollSeconds * 3 : false;
  let keeperPill: React.ReactNode;
  if (!k.configured) keeperPill = <Pill tone="neutral">Not configured</Pill>;
  else if (!k.reachable) keeperPill = <Pill tone="danger">Keeper unreachable</Pill>;
  else if (!fresh) keeperPill = <Pill tone="warning">Keeper stale</Pill>;
  else if (k.mode === "dry-run") keeperPill = <Pill tone="warning">Keeper in dry-run (not sending)</Pill>;
  else keeperPill = <Pill tone="positive">Keeper scanning</Pill>;

  const status = REPAYMENT_STATUS_COPY[s.previewStatus];
  const cooldownLeft = s.lastExecutionAt && s.policy.cooldown ? Math.max(0, s.lastExecutionAt + s.policy.cooldown - Math.floor(now)) : 0;

  return (
    <div className="animate-rise">
      <PageHeader title="Automation" description="Who repays, when, and why a repayment might be waiting." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Is automation set up?" action={keeperPill} />
          <div className="space-y-4 p-5">
            {!k.configured ? (
              <Notice title="No keeper is connected to this app">
                The contract allows anyone to trigger a repayment, but this deployment has no keeper status endpoint configured, so RePay can&apos;t confirm
                that anything is scanning. Use manual execution below, or run the keeper service from the repository.
              </Notice>
            ) : !k.reachable ? (
              <Notice tone="danger" title="The keeper status endpoint didn't respond">
                {k.error ?? "Unknown error."} Automated repayments may not run. Manual execution still works.
              </Notice>
            ) : null}
            <KeyValue
              rows={[
                ["Policy allows automation", s.policy.paused ? <Pill key="a" tone="warning">Paused by owner</Pill> : <Pill key="a" tone="positive">Yes</Pill>],
                ["Last successful keeper scan", k.configured ? ago(k.lastSuccessfulScanAt, now) : "Unknown (no keeper status)"],
                ["Keeper last checked this account", k.accountStatus ? ago(k.accountStatus.checkedAt, now) : "—"],
                ["Last repayment by anyone (on-chain)", s.lastExecutionAt ? ago(new Date(s.lastExecutionAt * 1000).toISOString(), now) : "Never"],
                ["Keeper's last repayment (any account)", k.lastExecutionAt ? ago(k.lastExecutionAt, now) : "Never"],
                ["Cooldown", formatDuration(s.policy.cooldown) + (cooldownLeft ? ` · ${formatDuration(cooldownLeft)} left` : "")],
              ]}
            />
            {k.accountStatus?.lastAction?.txHash && (
              <p className="text-sm text-ink-muted">
                Keeper&apos;s last action here: {k.accountStatus.lastAction.kind} <TxLink hash={k.accountStatus.lastAction.txHash} />
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Right now" />
          <div className="space-y-4 p-5">
            <div>
              <Pill tone={s.previewStatus === "Ready" ? "positive" : "warning"}>{status.title}</Pill>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{status.detail}</p>
            </div>
            <KeyValue
              rows={[
                ["Pending repayment", <Amount key="a" value={s.pendingRepayment} />],
                ["Eligible now", <Amount key="b" value={s.previewAmount} className="font-semibold" />],
                ["Operating cash / reserve", <span key="c"><Amount value={s.operatingCash} /> / <Amount value={s.policy.operatingReserve} /></span>],
                ["Repayable before minimum debt", <Amount key="d" value={s.maxRepayable} />],
              ]}
            />
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Manual fallback</p>
              <ExecuteRepaymentButton snap={s} params={params.data} />
              <p className="mt-2 text-[13px] text-ink-muted">Runs the same bounded function a keeper would. You pay the gas.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="What a keeper can and cannot do" description="Enforced by the account contract, not by this app or the keeper" />
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-sage-deep">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Can
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              <li>Call <code className="font-mono text-xs">executeRepayment</code> on any account</li>
              <li>Repay that account&apos;s own Trove from its pending allocation</li>
              <li>Only within your policy and Mezo&apos;s minimum debt</li>
            </ul>
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-rust">
              <Bot className="h-4 w-4" aria-hidden /> Cannot
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              <li>Borrow more, withdraw collateral or close the loan</li>
              <li>Change the owner or policy, or pause/resume</li>
              <li>Touch operating cash or send funds anywhere</li>
              <li>Take a fee (keeper fee is zero; the keeper operator pays gas)</li>
            </ul>
          </div>
        </div>
        <p className="border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          Keeper execution is not guaranteed. RePay does not provide liquidation protection.
        </p>
      </Card>
    </div>
  );
}
