"use client";
import { useEffect, useState } from "react";
import { useAccount, useBalance, usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";
import { type Hints, type ProtocolParams, ZERO_HINTS, computeHints, formatBps, formatRatio, mezoTestnet, parseUnits18, projectOpenTrove, repayAccountAbi } from "@repay/sdk";
import { deployment } from "@/lib/data";
import { useMode } from "@/lib/mode";
import { AmountInput } from "./PolicyForm";
import { TxDialog } from "./TxDialog";
import { Amount, KeyValue, Notice, Skeleton } from "./ui";

const WAD = 10n ** 18n;

export function OpenLoanForm({ account, params, onOpened }: { account: Address; params: ProtocolParams | undefined; onOpened?: () => void }) {
  const mode = useMode();
  const { address } = useAccount();
  const bal = useBalance({ address, chainId: mezoTestnet.id, query: { enabled: mode === "live" && !!address } });
  const pub = usePublicClient({ chainId: mezoTestnet.id }) as unknown as PublicClient;
  const [coll, setColl] = useState("0.05");
  const [borrow, setBorrow] = useState("2000");
  const [open, setOpen] = useState(false);
  const [hints, setHints] = useState<Hints>(ZERO_HINTS);

  const collateral = parseUnits18(coll);
  const borrowAmt = parseUnits18(borrow);
  const fee = params && borrowAmt !== null ? (borrowAmt * params.borrowingFeeOn1000) / (1000n * WAD) : null;
  const proj =
    params && collateral !== null && borrowAmt !== null && fee !== null
      ? projectOpenTrove({ collateral, borrow: borrowAmt, borrowingFee: params.recoveryMode ? 0n : fee, gasCompensation: params.gasCompensation, minNetDebt: params.minNetDebt, price: params.price, mcr: params.mcr })
      : null;

  const gasBuffer = WAD / 10_000n; // 0.0001 BTC left for gas
  const balance = bal.data?.value;
  const problems: string[] = [];
  if (collateral === null || collateral === 0n) problems.push("Enter a BTC collateral amount.");
  if (borrowAmt === null || borrowAmt === 0n) problems.push("Enter an amount to borrow.");
  if (proj?.problems.includes("belowMinDebt") && params) problems.push(`Mezo requires at least ${(params.minNetDebt / WAD).toString()} MUSD of net debt (borrowed amount + fee).`);
  if (proj?.problems.includes("belowMcr")) problems.push("Collateral ratio would be below Mezo's 110% minimum. Add collateral or borrow less.");
  if (params?.recoveryMode && proj?.cr !== null && proj && params && proj.cr! < params.ccr) problems.push("Mezo is in recovery mode: new loans need at least 150% collateral ratio.");
  if (mode === "live" && balance !== undefined && collateral !== null && collateral + gasBuffer > balance) problems.push("Your wallet doesn't have enough testnet BTC for this collateral plus gas.");

  const risky = proj?.cr !== null && proj?.cr !== undefined && proj.cr < (16n * WAD) / 10n && !problems.length;

  useEffect(() => {
    if (!open || mode !== "live" || !proj || collateral === null) return;
    let cancelled = false;
    computeHints(pub, deployment.protocol, collateral, proj.totalDebt)
      .then((h) => !cancelled && setHints(h))
      .catch(() => !cancelled && setHints(ZERO_HINTS));
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!params) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        <div>
          <label htmlFor="coll" className="label">
            BTC collateral
          </label>
          <AmountInput id="coll" unit="BTC" value={coll} onChange={setColl} placeholder="0.05" />
          <p className="hint">
            Sent from your wallet into the account&apos;s Trove.{" "}
            {mode === "live" && balance !== undefined && (
              <>
                Wallet balance: <Amount value={balance} unit="BTC" digits={6} />.
              </>
            )}
          </p>
        </div>
        <div>
          <label htmlFor="borrow" className="label">
            Borrow MUSD
          </label>
          <AmountInput id="borrow" value={borrow} onChange={setBorrow} placeholder="2000" />
          <p className="hint">Borrowed MUSD lands in the account as operating cash. It is never counted as income or split to repayment.</p>
        </div>
        <Notice>
          The RePay account, not your wallet, owns this Trove. Only you, as the account owner, can borrow more, withdraw collateral or close it.
          Keepers can only repay it from income set aside for repayment.
        </Notice>
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-ivory/60 px-4 py-1">
          <KeyValue
            rows={[
              ["Borrowed to account", <Amount key="a" value={borrowAmt ?? 0n} />],
              [`Borrowing fee (${formatBps(Number((params.borrowingFeeOn1000 * 10_000n) / (1000n * WAD)))})`, <Amount key="b" value={params.recoveryMode ? 0n : fee ?? 0n} />],
              ["Gas compensation (refundable on close)", <Amount key="c" value={params.gasCompensation} />],
              ["Total debt", <Amount key="d" value={proj?.totalDebt ?? 0n} className="font-semibold" />],
              ["Collateral ratio", <span key="e" className="num font-semibold">{formatRatio(proj?.cr ?? null)}</span>],
              ["Liquidation below BTC price", <Amount key="f" value={proj?.liquidationPrice ?? 0n} unit="USD" />],
              ["Current BTC price (Mezo oracle)", <Amount key="g" value={params.price} unit="USD" />],
              ["Interest rate (simple, fixed at open)", <span key="h" className="num">{formatBps(params.interestRateBps)} / year</span>],
              ["Repayable before minimum debt", <Amount key="i" value={proj?.headroom ?? 0n} />],
            ]}
          />
        </div>
        {problems.length > 0 && (
          <Notice tone="warning" title="Can't open yet">
            <ul className="list-disc space-y-1 pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Notice>
        )}
        {risky && <Notice tone="warning">Below 160% collateral ratio a modest BTC price drop could bring this loan near liquidation. RePay does not protect against liquidation.</Notice>}
        {proj && proj.headroom === 0n && !problems.length && (
          <Notice tone="warning">At this size the loan sits at Mezo&apos;s minimum debt, so partial repayments can&apos;t reduce it. Income would wait until there is enough to close the loan.</Notice>
        )}
        <button className="btn-accent w-full" disabled={problems.length > 0 || mode === "example"} onClick={() => setOpen(true)}>
          Review loan
        </button>
      </div>
      <TxDialog
        open={open}
        onOpenChange={setOpen}
        title="Open a Mezo loan for this account"
        description="Your wallet sends BTC collateral; the account opens and owns the Trove."
        confirmLabel="Open loan"
        request={
          proj && collateral !== null && borrowAmt !== null && !problems.length
            ? { address: account, abi: repayAccountAbi, functionName: "openLoan", args: [borrowAmt, hints.upper, hints.lower], value: collateral }
            : null
        }
        summary={
          <KeyValue
            rows={[
              ["Collateral from your wallet", <Amount key="a" value={collateral ?? 0n} unit="BTC" digits={6} />],
              ["MUSD to account (operating cash)", <Amount key="b" value={borrowAmt ?? 0n} />],
              ["Total debt incl. fee and gas compensation", <Amount key="c" value={proj?.totalDebt ?? 0n} className="font-semibold" />],
              ["Collateral ratio", <span key="d" className="num">{formatRatio(proj?.cr ?? null)}</span>],
            ]}
          />
        }
        onConfirmed={() => onOpened?.()}
        successMessage="Loan opened. The account now owns a Mezo Trove."
      />
    </div>
  );
}
