"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Wallet, PlusCircle } from "lucide-react";
import { basePath, useMode } from "@/lib/mode";
import { deployment, useNetwork, useSelection } from "@/lib/data";
import { WalletButton } from "./WalletButton";
import { Card, EmptyState, Notice, Skeleton, DataError } from "./ui";

/**
 * Renders children only when the live prerequisites exist. Each missing prerequisite gets an
 * explanation instead of a blank or fake screen. Example mode always passes.
 */
export function Gate({ need, children }: { need: "wallet" | "account"; children: React.ReactNode }) {
  const mode = useMode();
  const net = useNetwork();
  const sel = useSelection();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (mode === "example") return <>{children}</>;
  if (!mounted || net.status === "reconnecting" || net.status === "connecting") {
    return (
      <Card className="p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-3 h-4 w-72" />
      </Card>
    );
  }
  if (!deployment.repay) {
    return (
      <Notice tone="warning" title="RePay contracts are not deployed on this network">
        The deployment registry has no RePay factory for Mezo testnet, so there is nothing live to show.
      </Notice>
    );
  }
  if (!net.isConnected) {
    return (
      <Card>
        <EmptyState
          icon={<Wallet className="h-5 w-5" aria-hidden />}
          title="Connect a wallet to see your live account"
          action={
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <WalletButton />
              <Link href="/example" className="btn-secondary min-h-[40px]">
                Explore example instead
              </Link>
            </div>
          }
        >
          RePay reads balances, policy and loan state directly from Mezo testnet. Nothing is shown until a wallet is connected.
        </EmptyState>
      </Card>
    );
  }
  if (net.wrongNetwork) {
    return (
      <Notice tone="warning" title="Your wallet is on a different network" action={<WalletButton />}>
        RePay runs on Mezo Testnet (chain 31611). Switch networks to read and manage your account.
      </Notice>
    );
  }
  if (need === "wallet") return <>{children}</>;
  if (sel.loading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-3 h-4 w-80" />
      </Card>
    );
  }
  if (sel.error) return <DataError error={sel.error} onRetry={sel.refresh} what="your accounts" />;
  if (!sel.account) {
    return (
      <Card>
        <EmptyState
          icon={<PlusCircle className="h-5 w-5" aria-hidden />}
          title="No RePay account for this wallet yet"
          action={
            <Link href={`${basePath(mode)}/setup`} className="btn-accent">
              Start guided setup
            </Link>
          }
        >
          Create an account to open a Bitcoin-backed loan it owns and start routing income to repayment. Existing wallet-owned Mezo loans
          can&apos;t be imported.
        </EmptyState>
      </Card>
    );
  }
  return <>{children}</>;
}
