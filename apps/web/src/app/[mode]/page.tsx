"use client";
import Link from "next/link";
import { ArrowRight, QrCode } from "lucide-react";
import { REPAYMENT_STATUS_COPY, TROVE_STATUS_LABEL, collateralRatio, formatBps, formatRatio } from "@repay/sdk";
import { basePath, useMode } from "@/lib/mode";
import { useActivity, useProtocol, useSelection, useSnapshot } from "@/lib/data";
import { Gate } from "@/components/Gate";
import { AllocationFlow } from "@/components/AllocationFlow";
import { ActivityRow, NoActivity } from "@/components/activity";
import { ExecuteRepaymentButton } from "@/components/actions";
import { Amount, Card, CardHeader, DataError, Notice, PageHeader, Pill, Skeleton, Stat, AddressLink } from "@/components/ui";
import { CountUp, DebtProgress, LiveIndicator, RatioGauge } from "@/components/motion";

export default function DashboardPage() {
  return (
    <Gate need="account">
      <Dashboard />
    </Gate>
  );
}

function Dashboard() {
  const mode = useMode();
  const base = basePath(mode);
  const { account } = useSelection();
  const snap = useSnapshot(account);
  const params = useProtocol();
  const activity = useActivity(account);
  const s = snap.data;
  const p = params.data;

  if (snap.error) return <DataError error={snap.error} onRetry={snap.refetch} what="the account" />;
  if (!s) return <DashboardSkeleton />;

  const cr = p ? collateralRatio(s.collateral, s.debt, p.price) : null;
  const hasLoan = s.loanStatus === "active";
  const status = REPAYMENT_STATUS_COPY[s.previewStatus];

  let primary: React.ReactNode;
  if (!hasLoan && s.loanStatus === "nonExistent") {
    primary = (
      <Link href={`${base}/setup`} className="btn-accent">
        Open your loan <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    );
  } else if (s.previewStatus === "Ready") {
    primary = <ExecuteRepaymentButton snap={s} params={p} />;
  } else {
    primary = (
      <Link href={`${base}/receive`} className="btn-primary">
        <QrCode className="h-4 w-4" aria-hidden /> Receive a payment
      </Link>
    );
  }

  return (
    <div>
      <PageHeader
        title="Overview"
        description={
          <>
            Account <AddressLink address={s.address} /> · income is split{" "}
            <strong className="font-medium text-ink">{formatBps(s.policy.repaymentBps)} to repayment</strong>.
          </>
        }
        action={primary}
      />

      {s.loanStatus === "closedByLiquidation" && (
        <div className="mb-5">
          <Notice tone="danger" title="This loan was liquidated by Mezo">
            Automation has stopped. Pending repayment is still held by the account; you can release it to operating cash and check for a
            collateral surplus on the Loan page.
          </Notice>
        </div>
      )}
      {s.loanStatus === "closedByRedemption" && (
        <div className="mb-5">
          <Notice tone="warning" title="This loan was fully redeemed">
            MUSD holders redeemed against this Trove. Any remaining collateral can be claimed on the Loan page.
          </Notice>
        </div>
      )}
      {s.unclassified > 0n && (
        <div className="mb-5">
          <Notice
            tone="info"
            title="Unclassified MUSD received"
            action={
              <Link href={`${base}/receive#classify`} className="btn-secondary min-h-[36px]">
                Review transfer
              </Link>
            }
          >
            <Amount value={s.unclassified} /> arrived by direct transfer. It isn&apos;t counted as income or allocated until you classify it.
          </Notice>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="animate-rise p-5 xl:col-span-2" style={{ ["--i" as string]: 0 }}>
          <div className="-mt-1 mb-4 flex justify-end">
            <LiveIndicator updatedAt={snap.updatedAt} />
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-6 min-[420px]:grid-cols-2 sm:grid-cols-3">
            <Stat label="Outstanding debt" emphasis sub={hasLoan ? "Includes accrued interest" : TROVE_STATUS_LABEL[s.loanStatus]}>
              <CountUp value={hasLoan ? s.debt : 0n} />
            </Stat>
            <Stat label="Collateral ratio" emphasis sub={<Amount value={s.collateral} unit="BTC" digits={6} />}>
              <span className="num">{hasLoan ? (p ? formatRatio(cr) : <Skeleton className="h-7 w-20" />) : "—"}</span>
            </Stat>
            <Stat label="Pending repayment" emphasis sub={status.title}>
              <CountUp value={s.pendingRepayment} className="text-copper-deep" />
            </Stat>
            <Stat label="Operating cash" sub={s.policy.operatingReserve > 0n ? <>Reserve <Amount value={s.policy.operatingReserve} /></> : "No reserve set"}>
              <CountUp value={s.operatingCash} />
            </Stat>
            <Stat label="Tracked income" sub={`${s.paymentCount} payment${s.paymentCount === 1 ? "" : "s"}`}>
              <CountUp value={s.totalIncome} />
            </Stat>
            <Stat label="Total repaid" sub="Burned against the Trove">
              <CountUp value={s.totalRepaid} className="text-sage-deep" />
            </Stat>
          </dl>
          {hasLoan && p && (
            <div className="mt-6 grid gap-6 border-t border-line pt-5 md:grid-cols-2">
              <div>
                <p className="eyebrow mb-3">Collateral health</p>
                <RatioGauge ratio={cr} mcr={p.mcr} ccr={p.ccr} />
              </div>
              <div>
                <p className="eyebrow mb-3">Debt paydown</p>
                <DebtProgress debt={s.debt} repaid={s.totalRepaid} floor={p.minNetDebt + p.gasCompensation} />
              </div>
            </div>
          )}
        </Card>

        <Card className="animate-rise flex flex-col" style={{ ["--i" as string]: 1 }}>
          <CardHeader title="Next repayment" description="Read from the contract's own preview" />
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div>
              <Pill tone={s.previewStatus === "Ready" ? "positive" : s.previewStatus === "AtMinimumDebt" || s.previewStatus === "ReserveShortfall" ? "warning" : "neutral"}>
                {status.title}
              </Pill>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{status.detail}</p>
            </div>
            {s.previewStatus === "Ready" && (
              <p className="text-sm text-ink-muted">
                Eligible now: <Amount value={s.previewAmount} className="font-medium text-ink" />
              </p>
            )}
            {hasLoan && (
              <p className="text-sm text-ink-muted">
                Repayable before Mezo&apos;s minimum debt: <Amount value={s.maxRepayable} className="font-medium text-ink" />
              </p>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              <Link href={`${base}/automation`} className="btn-secondary min-h-[40px]">
                Automation status
              </Link>
              <Link href={`${base}/policy`} className="btn-ghost min-h-[40px]">
                Edit policy
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <Card className="animate-rise mt-5" style={{ ["--i" as string]: 2 }}>
        <CardHeader title="How income is split" description="Every tracked payment is divided once, when it arrives. Repeated keeper runs never re-split it." />
        <div className="p-5">
          <AllocationFlow
            amount={s.totalIncome > 0n ? s.totalIncome : 1000n * 10n ** 18n}
            bps={s.policy.repaymentBps}
            caption={
              s.totalIncome > 0n
                ? "Applied to all tracked income at the current share. Earlier payments keep the share that applied when they arrived."
                : "Illustration for 1,000 MUSD at your current share. No income received yet."
            }
          />
        </div>
      </Card>

      <Card className="animate-rise mt-5" style={{ ["--i" as string]: 3 }}>
        <CardHeader
          title="Recent activity"
          action={
            <Link href={`${base}/activity`} className="btn-ghost min-h-[36px] text-sm">
              All activity <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
        {activity.error ? (
          <div className="p-5">
            <DataError error={activity.error} onRetry={activity.refetch} what="activity" />
          </div>
        ) : !activity.data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : activity.data.length === 0 ? (
          <NoActivity />
        ) : (
          <ul className="divide-y divide-line">
            {activity.data.slice(0, 6).map((i, n) => (
              <ActivityRow key={`${i.txHash}-${i.logIndex}`} item={i} index={n} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <Skeleton className="h-9 w-48" />
      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card className="h-56 p-5 xl:col-span-2">
          <Skeleton className="h-6 w-40" />
        </Card>
        <Card className="h-56 p-5">
          <Skeleton className="h-6 w-32" />
        </Card>
      </div>
    </div>
  );
}
