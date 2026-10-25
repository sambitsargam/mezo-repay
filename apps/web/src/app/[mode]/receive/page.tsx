"use client";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Info } from "lucide-react";
import { MAX_REFERENCE_BYTES, allocate, buildPaymentPath, encodeReference, formatBps, mezoTestnet, parseUnits18, referenceByteLength, repayAccountAbi } from "@repay/sdk";
import { useMode } from "@/lib/mode";
import { useSelection, useSnapshot } from "@/lib/data";
import { Gate } from "@/components/Gate";
import { AmountInput } from "@/components/PolicyForm";
import { TxDialog } from "@/components/TxDialog";
import { AddressLink, Amount, Card, CardHeader, CopyButton, KeyValue, Notice, PageHeader, Pill, cx } from "@/components/ui";

export default function ReceivePage() {
  return (
    <Gate need="account">
      <Receive />
    </Gate>
  );
}

function Receive() {
  const mode = useMode();
  const { account } = useSelection();
  const snap = useSnapshot(account);
  const [amount, setAmount] = useState("500");
  const [reference, setReference] = useState("INV-001");
  const [label, setLabel] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const amt = parseUnits18(amount);
  const refBytes = referenceByteLength(reference);
  const refError = refBytes > MAX_REFERENCE_BYTES ? `Reference is ${refBytes} bytes; the limit is ${MAX_REFERENCE_BYTES}.` : null;
  const amtError = amount.trim() && (amt === null || amt === 0n) ? "Enter an amount greater than zero." : null;
  const valid = !!account && amt !== null && amt > 0n && !refError;
  const link = useMemo(
    () => (valid ? `${origin}${buildPaymentPath({ account: account!, amount: amt!, reference: reference.trim(), chainId: mezoTestnet.id, label: label.trim() || undefined })}` : ""),
    [valid, origin, account, amt, reference, label],
  );
  const bps = snap.data?.policy.repaymentBps ?? 0;
  const split = amt ? allocate(amt, bps) : null;

  return (
    <div className="animate-rise">
      <PageHeader title="Receive MUSD" description="Create a payment link for a customer. Tracked payments are split by your policy the moment they land." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card>
          <CardHeader title="Payment link" description="Amount, optional reference, and who it's from" />
          <div className="space-y-5 p-5">
            <div>
              <label htmlFor="amount" className="label">
                Amount
              </label>
              <AmountInput id="amount" value={amount} onChange={setAmount} placeholder="500" error={amtError ?? undefined} />
            </div>
            <div>
              <label htmlFor="ref" className="label">
                Reference <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input id="ref" className={cx("field", refError && "border-rust")} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-001" aria-describedby="ref-hint" aria-invalid={!!refError} />
              <p id="ref-hint" className="hint">
                Recorded on-chain with the payment ({refBytes}/{MAX_REFERENCE_BYTES} bytes). A label for your books, not proof of an invoice.
              </p>
              {refError && <p className="mt-1 text-sm text-rust">{refError}</p>}
            </div>
            <div>
              <label htmlFor="label" className="label">
                Your business name <span className="font-normal text-ink-muted">(optional, shown to payer)</span>
              </label>
              <input id="label" className="field" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Northwind Studio" />
              <p className="hint">Display only. The payer page always shows the real account address too.</p>
            </div>
            {split && (
              <div className="rounded-xl border border-line bg-ivory/60 p-4 text-sm">
                When paid: <Amount value={split.toRepayment} className="font-medium text-copper-deep" /> to repayment ({formatBps(bps)}) and{" "}
                <Amount value={split.toOperating} className="font-medium text-sage-deep" /> to operating cash, under the current policy.
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Share" action={<Pill tone={mode === "example" ? "warning" : "neutral"}>{mode === "example" ? "Example" : "Mezo Testnet"}</Pill>} />
          <div className="flex flex-1 flex-col items-center gap-4 p-5">
            {valid && mode === "live" ? (
              <>
                <div className="rounded-xl border border-line bg-white p-3" role="img" aria-label="QR code for the payment link">
                  <QRCodeSVG value={link} size={196} level="M" marginSize={0} aria-hidden />
                </div>
                <div className="w-full">
                  <p className="eyebrow">Link</p>
                  <p className="mt-1 break-all rounded-lg border border-line bg-ivory px-3 py-2 font-mono text-xs text-ink-soft">{link}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CopyButton value={link} label="Copy link" />
                    <a href={link} target="_blank" rel="noreferrer" className="btn-ghost min-h-[36px] px-2.5 text-xs">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open payer page
                    </a>
                  </div>
                </div>
              </>
            ) : mode === "example" ? (
              <p className="py-10 text-center text-sm text-ink-muted">Payment links point to real accounts, so none is generated for example data.</p>
            ) : (
              <p className="py-10 text-center text-sm text-ink-muted">Enter a valid amount to generate a link.</p>
            )}
            <div className="w-full border-t border-line pt-4">
              <KeyValue
                rows={[
                  ["Account", account ? <AddressLink key="a" address={account} /> : "—"],
                  ["Network", "Mezo Testnet · 31611"],
                  ["Token", "MUSD"],
                ]}
              />
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Tracked payment vs. direct transfer" />
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="rounded-xl border border-sage/30 bg-sage-wash/50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-sage-deep">
              <Info className="h-4 w-4" aria-hidden /> Through the payment link
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              The payer approves the exact amount and calls the account&apos;s <code className="font-mono text-xs">pay</code> function. The payment is recorded as
              income with its reference and split immediately.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-ivory/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Info className="h-4 w-4" aria-hidden /> Plain MUSD transfer to the address
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              A normal ERC-20 transfer doesn&apos;t notify the contract. The MUSD arrives as <strong>unclassified</strong> and isn&apos;t income or repayment until you
              classify it below.
            </p>
            {account && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="break-all font-mono text-xs text-ink-soft">{account}</span>
                {mode === "live" && <CopyButton value={account} label="Copy address" />}
              </div>
            )}
          </div>
        </div>
      </Card>

      <div id="classify" className="scroll-mt-24">
        {snap.data && <ClassifyCard address={snap.data.address} unclassified={snap.data.unclassified} bps={bps} />}
      </div>
    </div>
  );
}

function ClassifyCard({ address, unclassified, bps }: { address: `0x${string}`; unclassified: bigint; bps: number }) {
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"revenue" | "capital-op" | "capital-repay">("revenue");
  const [ref, setRef] = useState("");
  const [open, setOpen] = useState(false);
  const amt = parseUnits18(amount);
  const tooMuch = amt !== null && amt > unclassified;
  const refOk = referenceByteLength(ref) <= MAX_REFERENCE_BYTES;
  const valid = amt !== null && amt > 0n && !tooMuch && refOk;
  const kinds = [
    { id: "revenue", label: "Customer revenue", detail: `Counted as income and split ${formatBps(bps)} to repayment.` },
    { id: "capital-op", label: "Owner capital → operating cash", detail: "Not income. Added to operating cash." },
    { id: "capital-repay", label: "Owner capital → repayment", detail: "Not income. Added in full to pending repayment." },
  ] as const;
  return (
    <Card className="mt-5">
      <CardHeader title="Classify unclassified MUSD" description="Only you can decide what a direct transfer was. RePay never guesses." />
      <div className="p-5">
        {unclassified === 0n ? (
          <p className="text-sm text-ink-muted">Nothing unclassified. All MUSD in this account is tracked.</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <p className="text-sm">
                Unclassified balance: <Amount value={unclassified} className="font-semibold" />
              </p>
              <div>
                <label htmlFor="cls-amt" className="label">
                  Amount to classify
                </label>
                <AmountInput id="cls-amt" value={amount} onChange={setAmount} placeholder="0" error={tooMuch ? "More than the unclassified balance." : undefined} />
              </div>
              <div>
                <label htmlFor="cls-ref" className="label">
                  Reference <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <input id="cls-ref" className="field" value={ref} onChange={(e) => setRef(e.target.value)} />
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="label">Treat it as</legend>
              {kinds.map((k) => (
                <label key={k.id} className={cx("flex cursor-pointer gap-3 rounded-xl border p-3", kind === k.id ? "border-ink bg-ivory" : "border-line")}>
                  <input type="radio" name="cls" className="mt-1 accent-[rgb(var(--ink))]" checked={kind === k.id} onChange={() => setKind(k.id)} />
                  <span>
                    <span className="block text-sm font-medium text-ink">{k.label}</span>
                    <span className="block text-[13px] text-ink-muted">{k.detail}</span>
                  </span>
                </label>
              ))}
              <button className="btn-primary mt-2 w-full" disabled={!valid} onClick={() => setOpen(true)}>
                Review classification
              </button>
            </fieldset>
          </div>
        )}
      </div>
      <TxDialog
        open={open}
        onOpenChange={setOpen}
        title="Classify transfer"
        confirmLabel="Classify"
        request={
          valid && refOk
            ? { address, abi: repayAccountAbi, functionName: "classifyUnclassified", args: [amt!, kind === "revenue", kind === "capital-repay", encodeReference(ref)] }
            : null
        }
        summary={<KeyValue rows={[["Amount", <Amount key="a" value={amt ?? 0n} />], ["Classified as", kinds.find((k) => k.id === kind)!.label]]} />}
        warning={<Notice>A classification is your statement about the funds. It can&apos;t be undone, but released or withdrawn amounts are tracked separately.</Notice>}
        successMessage="Transfer classified."
      />
    </Card>
  );
}
