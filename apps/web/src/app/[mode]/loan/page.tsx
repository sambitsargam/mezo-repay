"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { TROVE_STATUS_LABEL, collateralRatio, formatBps, formatRatio, parseUnits18, repayAccountAbi } from "@repay/sdk";
import { useProtocol, useSelection, useSnapshot } from "@/lib/data";
import { Gate } from "@/components/Gate";
import { OpenLoanForm } from "@/components/OpenLoanForm";
import { AmountInput } from "@/components/PolicyForm";
import { TxDialog } from "@/components/TxDialog";
import { CloseLoanButton, ExecuteRepaymentButton } from "@/components/actions";
import { RatioGauge } from "@/components/motion";
import { Amount, Card, CardHeader, DataError, KeyValue, Notice, PageHeader, Pill, Skeleton, Stat, cx } from "@/components/ui";

export default function LoanPage() {
  return (
    <Gate need="account">
      <Loan />
    </Gate>
  );
}

function Loan() {
  const { account } = useSelection();
  const snap = useSnapshot(account);
  const params = useProtocol();
  const s = snap.data;
  const p = params.data;
  if (snap.error) return <DataError error={snap.error} onRetry={snap.refetch} what="the loan" />;
  if (!s) return <Skeleton className="h-64 w-full" />;
  const active = s.loanStatus === "active";
  const cr = p ? collateralRatio(s.collateral, s.debt, p.price) : null;
  const liq = s.collateral > 0n && p ? (s.debt * p.mcr) / s.collateral : null;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Loan"
        description="The Bitcoin-backed Mezo Trove owned by this account. Figures are read live from Mezo's TroveManager."
        action={<Pill tone={active ? "positive" : s.loanStatus === "closedByLiquidation" ? "danger" : "neutral"}>{TROVE_STATUS_LABEL[s.loanStatus]}</Pill>}
      />
      {params.error && <div className="mb-5"><DataError error={params.error} onRetry={params.refetch} what="Mezo protocol parameters" /></div>}

      {!active && s.loanStatus === "nonExistent" && (
        <Card>
          <CardHeader title="Open a loan" description="Deposit BTC and borrow MUSD into this account" />
          <div className="p-5">
            <OpenLoanForm account={s.address} params={p} onOpened={() => snap.refetch()} />
          </div>
        </Card>
      )}

      {active && (
        <>
          <Card className="animate-rise p-5">
            <dl className="grid grid-cols-1 gap-6 min-[420px]:grid-cols-2 md:grid-cols-4">
              <Stat label="Debt incl. interest" emphasis>
                <Amount value={s.debt} />
              </Stat>
              <Stat label="Collateral" emphasis>
                <Amount value={s.collateral} unit="BTC" digits={6} />
              </Stat>
              <Stat label="Collateral ratio" emphasis sub={p ? `Minimum ${formatRatio(p.mcr, 0)}` : undefined}>
                <span className="num">{formatRatio(cr)}</span>
              </Stat>
              <Stat label="Liquidation below" emphasis sub="BTC price, at 110% MCR">
                <Amount value={liq} unit="USD" />
              </Stat>
            </dl>
            {p && (
              <div className="mt-6 border-t border-line pt-5">
                <RatioGauge ratio={cr} mcr={p.mcr} ccr={p.ccr} />
              </div>
            )}
          </Card>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Repay" description="Reduce debt from pending repayment or operating cash" />
              <div className="space-y-4 p-5">
                <KeyValue
                  rows={[
                    ["Pending repayment", <Amount key="a" value={s.pendingRepayment} />],
                    ["Operating cash", <Amount key="b" value={s.operatingCash} />],
                    ["Max partial repayment now", <Amount key="c" value={s.maxRepayable} className="font-semibold" />],
                  ]}
                />
                {s.maxRepayable === 0n && (
                  <Notice tone="warning" title="Waiting for enough MUSD to close the loan">
                    The loan is at Mezo&apos;s minimum net debt{p ? ` (${(p.minNetDebt / 10n ** 18n).toString()} MUSD)` : ""}. Partial repayments are not possible; close the loan
                    in full when the account holds enough MUSD.
                  </Notice>
                )}
                <div className="flex flex-wrap gap-2">
                  <ExecuteRepaymentButton snap={s} params={p} className="btn-primary" />
                </div>
                <ManualRepay address={s.address} pending={s.pendingRepayment} operating={s.operatingCash} max={s.maxRepayable} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Collateral & closing" />
              <div className="space-y-5 p-5">
                <AddCollateral address={s.address} />
                <div className="border-t border-line pt-5">
                  <p className="text-sm font-medium text-ink">Close the loan</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                    Repays everything except Mezo&apos;s gas compensation (which Mezo burns from its gas pool) and returns the BTC to this account. Owner only.
                  </p>
                  <div className="mt-3">
                    <CloseLoanButton snap={s} params={p} />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {(s.loanStatus === "closedByOwner" || s.loanStatus === "closedByLiquidation" || s.loanStatus === "closedByRedemption") && (
        <div className="space-y-5">
          {s.loanStatus === "closedByLiquidation" && (
            <Notice tone="danger" title="Liquidated">
              Mezo liquidated this Trove. Its collateral was used to cover the debt. MUSD held by the account is unaffected.
            </Notice>
          )}
          <Card>
            <CardHeader title="Recover assets" description="Funds left in the account after the loan ended" />
            <div className="space-y-4 p-5">
              <KeyValue
                rows={[
                  ["BTC held by account", <Amount key="a" value={s.btcBalance} unit="BTC" digits={6} />],
                  ["Collateral surplus claimable from Mezo", <Amount key="b" value={s.collateralSurplus} unit="BTC" digits={6} />],
                  ["Pending repayment (can be released)", <Amount key="c" value={s.pendingRepayment} />],
                  ["Operating cash", <Amount key="d" value={s.operatingCash} />],
                ]}
              />
              <RecoveryActions address={s.address} btc={s.btcBalance} surplus={s.collateralSurplus} pending={s.pendingRepayment} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Open a new loan" />
            <div className="p-5">
              <OpenLoanForm account={s.address} params={p} onOpened={() => snap.refetch()} />
            </div>
          </Card>
        </div>
      )}

      {p && (
        <Card className="mt-5">
          <CardHeader title="Mezo protocol parameters" description="Read live; governable by Mezo and may change" />
          <div className="grid gap-x-8 px-5 py-2 md:grid-cols-2">
            <KeyValue
              rows={[
                ["BTC price (oracle)", <Amount key="a" value={p.price} unit="USD" />],
                ["Minimum net debt", <Amount key="b" value={p.minNetDebt} digits={0} />],
                ["Gas compensation", <Amount key="c" value={p.gasCompensation} digits={0} />],
              ]}
            />
            <KeyValue
              rows={[
                ["Interest (new loans)", `${formatBps(p.interestRateBps)} / year, simple`],
                ["Minimum collateral ratio", formatRatio(p.mcr, 0)],
                ["System mode", <span key="d" className={cx(p.recoveryMode && "font-medium text-rust")}>{p.recoveryMode ? "Recovery mode" : "Normal"}</span>],
              ]}
            />
          </div>
          <p className="border-t border-line px-5 py-3 text-[13px] text-ink-muted">
            Risk: if BTC falls so the ratio drops below 110%, anyone can liquidate the Trove and the collateral is lost. RePay does not monitor or prevent
            liquidation, and never sells collateral to make repayments.
          </p>
        </Card>
      )}
    </div>
  );
}

function ManualRepay({ address, pending, operating, max }: { address: `0x${string}`; pending: bigint; operating: bigint; max: bigint }) {
  const [amount, setAmount] = useState("");
  const [fromPending, setFromPending] = useState(true);
  const [open, setOpen] = useState(false);
  const amt = parseUnits18(amount);
  const source = fromPending ? pending : operating;
  const error = amt === null && amount ? "Enter a number." : amt !== null && amt > source ? "More than the selected balance." : amt !== null && amt > max ? "Would go below Mezo's minimum debt." : null;
  const valid = amt !== null && amt > 0n && !error;
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-sm font-medium text-ink">Manual repayment</p>
      <p className="mt-0.5 text-[13px] text-ink-muted">Ignores automation limits and pause, but not Mezo&apos;s minimum debt.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <AmountInput id="manual" value={amount} onChange={setAmount} placeholder="0" error={error ?? undefined} ariaLabel="Manual repayment amount" />
        <select className="field" value={fromPending ? "p" : "o"} onChange={(e) => setFromPending(e.target.value === "p")} aria-label="Repay from">
          <option value="p">From pending</option>
          <option value="o">From operating cash</option>
        </select>
      </div>
      <button className="btn-secondary mt-3" disabled={!valid} onClick={() => setOpen(true)}>
        Review repayment
      </button>
      <TxDialog
        open={open}
        onOpenChange={setOpen}
        title="Repay from account"
        confirmLabel="Repay"
        request={valid ? { address, abi: repayAccountAbi, functionName: "ownerRepay", args: [amt!, fromPending, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"] } : null}
        summary={<KeyValue rows={[["Amount", <Amount key="a" value={amt ?? 0n} />], ["Source", fromPending ? "Pending repayment" : "Operating cash"]]} />}
        successMessage="Repayment applied."
      />
    </div>
  );
}

function AddCollateral({ address }: { address: `0x${string}` }) {
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState(false);
  const amt = parseUnits18(amount);
  const valid = amt !== null && amt > 0n;
  return (
    <div>
      <p className="text-sm font-medium text-ink">Add collateral</p>
      <p className="mt-0.5 text-[13px] text-ink-muted">Sends BTC from your wallet to the Trove, raising the collateral ratio.</p>
      <div className="mt-3 flex gap-2">
        <div className="flex-1">
          <AmountInput id="addcoll" unit="BTC" value={amount} onChange={setAmount} placeholder="0.01" ariaLabel="BTC to add" />
        </div>
        <button className="btn-secondary" disabled={!valid} onClick={() => setOpen(true)}>
          Add
        </button>
      </div>
      <TxDialog
        open={open}
        onOpenChange={setOpen}
        title="Add collateral"
        confirmLabel="Add collateral"
        request={valid ? { address, abi: repayAccountAbi, functionName: "addCollateral", args: ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"], value: amt! } : null}
        summary={<KeyValue rows={[["BTC from your wallet", <Amount key="a" value={amt ?? 0n} unit="BTC" digits={6} />]]} />}
        successMessage="Collateral added."
      />
    </div>
  );
}

function RecoveryActions({ address, btc, surplus, pending }: { address: `0x${string}`; btc: bigint; surplus: bigint; pending: bigint }) {
  const { address: wallet } = useAccount();
  const [which, setWhich] = useState<null | "claim" | "btc" | "release">(null);
  const req =
    which === "claim"
      ? { address, abi: repayAccountAbi, functionName: "claimCollateralSurplus", args: [] }
      : which === "btc" && wallet
        ? { address, abi: repayAccountAbi, functionName: "withdrawBtc", args: [wallet, btc] }
        : which === "release"
          ? { address, abi: repayAccountAbi, functionName: "releasePending", args: [pending] }
          : null;
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" disabled={surplus === 0n} onClick={() => setWhich("claim")}>
        Claim surplus
      </button>
      <button className="btn-secondary" disabled={btc === 0n || !wallet} onClick={() => setWhich("btc")}>
        Withdraw BTC to wallet
      </button>
      <button className="btn-secondary" disabled={pending === 0n} onClick={() => setWhich("release")}>
        Release pending to operating
      </button>
      <TxDialog
        open={which !== null}
        onOpenChange={(o) => !o && setWhich(null)}
        title={which === "claim" ? "Claim collateral surplus" : which === "btc" ? "Withdraw BTC" : "Release pending repayment"}
        confirmLabel="Confirm"
        request={req}
        summary={
          <KeyValue
            rows={[
              [
                "Amount",
                which === "release" ? <Amount key="a" value={pending} /> : <Amount key="a" value={which === "claim" ? surplus : btc} unit="BTC" digits={6} />,
              ],
              ["Destination", which === "btc" ? "Your connected wallet" : "This account"],
            ]}
          />
        }
        successMessage="Done."
      />
    </div>
  );
}
