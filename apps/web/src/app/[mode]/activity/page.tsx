"use client";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { activityToCsv, explorerTx } from "@repay/sdk";
import { useMode } from "@/lib/mode";
import { useActivity, useSelection } from "@/lib/data";
import { Gate } from "@/components/Gate";
import { ACTIVITY_FILTERS, ActivityRow, NoActivity, matchesFilter } from "@/components/activity";
import { Card, DataError, PageHeader, Skeleton, cx } from "@/components/ui";

export default function ActivityPage() {
  return (
    <Gate need="account">
      <ActivityView />
    </Gate>
  );
}

function ActivityView() {
  const mode = useMode();
  const { account } = useSelection();
  const activity = useActivity(account);
  const [filter, setFilter] = useState<string>("all");
  const items = useMemo(() => (activity.data ?? []).filter((i) => matchesFilter(i, filter)), [activity.data, filter]);

  const exportCsv = () => {
    if (mode === "example" || !activity.data) return;
    const blob = new Blob([activityToCsv(items, explorerTx)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repay-${account?.slice(0, 8)}-${filter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Activity & receipts"
        description="Every entry is an event emitted by this account's contract on Mezo testnet, with its transaction."
        action={
          <button className="btn-secondary" onClick={exportCsv} disabled={mode === "example" || !items.length} title={mode === "example" ? "Not available for example data" : undefined}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </button>
        }
      />
      <div role="tablist" aria-label="Filter activity" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cx("btn min-h-[38px] shrink-0 border px-3", filter === f.id ? "border-ink bg-ink text-ivory" : "border-line bg-surface text-ink-soft hover:bg-ivory-deep")}
          >
            {f.label}
          </button>
        ))}
      </div>
      <Card>
        {activity.error ? (
          <div className="p-5">
            <DataError error={activity.error} onRetry={activity.refetch} what="activity" />
          </div>
        ) : !activity.data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <NoActivity />
        ) : (
          <ul className="divide-y divide-line" aria-label="Activity list">
            {items.map((i, n) => (
              <ActivityRow key={`${i.txHash}-${i.logIndex}`} item={i} index={n} />
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-ink-muted">
        All listed items are confirmed on-chain. Transactions still awaiting confirmation appear in their dialog, not here.
      </p>
    </div>
  );
}
