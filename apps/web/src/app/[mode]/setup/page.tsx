"use client";
import { useState } from "react";
import Link from "next/link";
import { parseEventLogs } from "viem";
import { Check, Lock } from "lucide-react";
import { formatBps, repayAccountFactoryAbi } from "@repay/sdk";
import { basePath, useMode } from "@/lib/mode";
import { deployment, useNetwork, useProtocol, useSelection, useSnapshot } from "@/lib/data";
import { WalletButton } from "@/components/WalletButton";
import { TxDialog } from "@/components/TxDialog";
import { OpenLoanForm } from "@/components/OpenLoanForm";
import { PolicyForm } from "@/components/PolicyForm";
import { AddressLink, Card, KeyValue, Notice, PageHeader, cx } from "@/components/ui";

const DEFAULT_POLICY = { repaymentBps: 3000, cooldown: 3600, paused: false, operatingReserve: 0n, minExecution: 10n * 10n ** 18n, maxExecution: 0n };

function Step({ n, title, done, active, locked, children }: { n: number; title: string; done: boolean; active: boolean; locked?: boolean; children?: React.ReactNode }) {
  return (
    <li className={cx("card overflow-hidden", active && "ring-1 ring-copper/40")}>
      <div className="flex items-center gap-3 px-5 py-4">
        <span
          className={cx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
            done ? "border-sage bg-sage text-white" : active ? "border-copper bg-copper-wash text-copper-deep" : "border-line-strong text-ink-muted",
          )}
          aria-hidden
        >
          {done ? <Check className="h-4 w-4" /> : locked ? <Lock className="h-3.5 w-3.5" /> : n}
        </span>
        <h2 className="text-[15px] font-semibold text-ink">
          <span className="sr-only">Step {n}: </span>
          {title}
          <span className="sr-only">{done ? " (complete)" : active ? " (current)" : " (not started)"}</span>
        </h2>
      </div>
      {active && children && <div className="border-t border-line px-5 py-5">{children}</div>}
    </li>
  );
}

export default function SetupPage() {
  const mode = useMode();
  const base = basePath(mode);
  const net = useNetwork();
  const sel = useSelection();
  const snap = useSnapshot(sel.account);
  const params = useProtocol();
  const [createOpen, setCreateOpen] = useState(false);
  const [policyDone, setPolicyDone] = useState(false);
  const [forceNew, setForceNew] = useState(false);

  const connected = net.isConnected && !net.wrongNetwork;
  const hasAccount = !!sel.account && !forceNew;
  const loanStatus = snap.data?.loanStatus;
  const hasLoan = hasAccount && loanStatus === "active";
  const policyStepDone = hasLoan && policyDone;
  const current = !connected ? 1 : !hasAccount ? 2 : !hasLoan ? 3 : !policyStepDone ? 4 : 5;

  return (
    <div className="mx-auto max-w-4xl animate-rise">
      <PageHeader title="Guided setup" description="Five steps from a wallet to a payment link. Every amount is shown before you sign, and each step is a real Mezo testnet transaction." />
      {mode === "example" && (
        <div className="mb-5">
          <Notice tone="warning" title="Example data">Setup is shown with sample values. Open the live app to create a real account.</Notice>
        </div>
      )}
      <ol className="space-y-3">
        <Step n={1} title="Connect wallet" done={connected} active={current === 1}>
          <p className="mb-4 text-sm text-ink-muted">Use a browser wallet on Mezo Testnet. You need testnet BTC for collateral and gas.</p>
          <WalletButton />
        </Step>

        <Step n={2} title="Create your RePay account" done={hasAccount} active={current === 2} locked={!connected}>
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-soft">
              A RePay account is a small contract that only your wallet controls. It will own the Mezo loan, receive customer payments and hold your
              operating cash. The factory that creates it has no admin powers over it.
            </p>
            {sel.accounts.length > 0 && forceNew && (
              <Notice>
                You already have {sel.accounts.length} account{sel.accounts.length > 1 ? "s" : ""}.{" "}
                <button className="font-medium underline" onClick={() => setForceNew(false)}>
                  Use the existing one
                </button>
              </Notice>
            )}
            <button className="btn-accent" onClick={() => setCreateOpen(true)} disabled={mode === "example"}>
              Create account
            </button>
          </div>
          <TxDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            title="Create RePay account"
            description="Starts with a conservative default policy you can change in step 4."
            confirmLabel="Create account"
            request={deployment.repay ? { address: deployment.repay.factory, abi: repayAccountFactoryAbi, functionName: "createAccount", args: [DEFAULT_POLICY] } : null}
            summary={
              <KeyValue
                rows={[
                  ["Owner", "Your connected wallet (fixed)"],
                  ["Repayment share", formatBps(DEFAULT_POLICY.repaymentBps)],
                  ["Cooldown", "1 hour"],
                  ["Minimum per execution", "10 MUSD"],
                  ["Cost", "Gas only"],
                ]}
              />
            }
            onConfirmed={(r) => {
              const ev = parseEventLogs({ abi: repayAccountFactoryAbi, logs: r.logs, eventName: "AccountCreated" })[0];
              if (ev) sel.select(ev.args.account);
              setForceNew(false);
              sel.refresh();
            }}
            successMessage="Account created."
          />
        </Step>

        <Step n={3} title="Open a test loan" done={hasLoan} active={current === 3} locked={!hasAccount}>
          {sel.account && (
            <>
              <p className="mb-4 text-sm text-ink-muted">
                Account <AddressLink address={sel.account} /> will deposit your BTC into Mezo and borrow MUSD.
              </p>
              {loanStatus && loanStatus !== "nonExistent" && loanStatus !== "active" && (
                <div className="mb-4">
                  <Notice tone="info">This account&apos;s previous loan is {loanStatus === "closedByOwner" ? "closed" : loanStatus.replace("closedBy", "closed by ").toLowerCase()}. You can open a new one.</Notice>
                </div>
              )}
              <OpenLoanForm account={sel.account} params={params.data} onOpened={() => snap.refetch()} />
            </>
          )}
        </Step>

        <Step n={4} title="Set your repayment policy" done={policyStepDone} active={current === 4} locked={!hasLoan}>
          {sel.account && snap.data && (
            <>
              <PolicyForm account={sel.account} saved={snap.data.policy} onSaved={() => setPolicyDone(true)} />
              <div className="mt-4 flex justify-end">
                <button className="btn-ghost" onClick={() => setPolicyDone(true)}>
                  Keep current policy and continue
                </button>
              </div>
            </>
          )}
        </Step>

        <Step n={5} title="Create a payment link" done={false} active={current === 5} locked={!policyStepDone}>
          <p className="mb-4 text-sm text-ink-muted">Share a link with a customer. Their payment is split by your policy the moment it lands.</p>
          <Link href={`${base}/receive`} className="btn-accent">
            Create payment link
          </Link>
        </Step>
      </ol>
      {hasAccount && sel.accounts.length > 0 && current >= 3 && (
        <p className="mt-6 text-center text-sm text-ink-muted">
          Need a separate account for another business?{" "}
          <button className="font-medium text-copper-deep underline underline-offset-2" onClick={() => setForceNew(true)} disabled={mode === "example"}>
            Create another account
          </button>
        </p>
      )}
    </div>
  );
}
