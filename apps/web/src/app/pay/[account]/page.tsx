"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";
import { type Address, type Hex, type TransactionReceipt, parseSignature, parseEventLogs } from "viem";
import { CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  allocate,
  encodeReference,
  formatBps,
  mezoTestnet,
  musdAbi,
  parsePaymentRequest,
  repayAccountAbi,
  repayAccountFactoryAbi,
  shortAddress,
} from "@repay/sdk";
import { ModeProvider } from "@/lib/mode";
import { deployment } from "@/lib/data";
import { describeError, useTransaction } from "@/lib/tx";
import { Logo } from "@/components/Logo";
import { WalletButton } from "@/components/WalletButton";
import { TxSteps } from "@/components/TxDialog";
import { AddressLink, Amount, Card, KeyValue, Notice, Pill, Skeleton, Spinner, TxLink } from "@/components/ui";

export default function PayPage({ params }: { params: { account: string } }) {
  return (
    <ModeProvider mode="live">
      <div className="min-h-screen">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
            <Link href="/" aria-label="Mezo RePay home">
              <Logo />
            </Link>
            <WalletButton compact />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-xl px-4 py-8">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <PayFlow accountParam={params.account} />
          </Suspense>
        </main>
      </div>
    </ModeProvider>
  );
}

function PayFlow({ accountParam }: { accountParam: string }) {
  const search = useSearchParams();
  const parsed = useMemo(() => parsePaymentRequest(accountParam, new URLSearchParams(search.toString())), [accountParam, search]);
  const pub = usePublicClient({ chainId: mezoTestnet.id });
  const { address, isConnected, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const req = parsed.ok ? parsed.value : null;

  const verify = useQuery({
    queryKey: ["isAccount", req?.account],
    enabled: !!req && !!deployment.repay && !!pub,
    queryFn: async () => {
      const ok = await pub!.readContract({ address: deployment.repay!.factory, abi: repayAccountFactoryAbi, functionName: "isAccount", args: [req!.account] });
      if (!ok) return { ok: false as const };
      const policy = await pub!.readContract({ address: req!.account, abi: repayAccountAbi, functionName: "policy" });
      return { ok: true as const, bps: Number(policy.repaymentBps) };
    },
  });
  const musd = useQuery({
    queryKey: ["payerMusd", address, req?.account],
    enabled: !!address && !!req && !!pub,
    queryFn: async () => {
      const [balance, allowance] = await Promise.all([
        pub!.readContract({ address: deployment.protocol.musd, abi: musdAbi, functionName: "balanceOf", args: [address!] }),
        pub!.readContract({ address: deployment.protocol.musd, abi: musdAbi, functionName: "allowance", args: [address!, req!.account] }),
      ]);
      return { balance, allowance };
    },
    refetchInterval: 15_000,
  });
  const gas = useBalance({ address, chainId: mezoTestnet.id, query: { enabled: !!address } });

  const [method, setMethod] = useState<"permit" | "approve">("permit");
  const [signing, setSigning] = useState<"idle" | "awaiting" | "error">("idle");
  const [signError, setSignError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const approveTx = useTransaction({ onConfirmed: () => void musd.refetch() });
  const payTx = useTransaction({ onConfirmed: (r) => setReceipt(r) });

  useEffect(() => {
    setReceipt(null);
  }, [address]);

  if (!parsed.ok) {
    const copy = {
      badAccount: "The account address in this link is not valid.",
      badAmount: "The amount in this link is missing or not valid.",
      badReference: "The reference in this link is too long.",
      badChain: "The network in this link is not valid.",
    }[parsed.error];
    return (
      <Notice tone="danger" title="This payment link is invalid">
        {copy} Ask the sender for a new link.
      </Notice>
    );
  }
  const r = parsed.value;
  if (r.chainId !== mezoTestnet.id) {
    return (
      <Notice tone="danger" title="Unsupported network">
        This link asks for payment on chain {r.chainId}. Mezo RePay only accepts payments on Mezo Testnet (31611).
      </Notice>
    );
  }

  const split = verify.data?.ok ? allocate(r.amount, verify.data.bps) : null;
  const wrongNet = isConnected && chainId !== mezoTestnet.id;
  const insufficient = musd.data && musd.data.balance < r.amount;
  const noGas = gas.data && gas.data.value === 0n;
  const approved = musd.data && musd.data.allowance >= r.amount;
  const refHex = encodeReference(r.reference);
  const busy = payTx.busy || approveTx.busy || signing === "awaiting";
  const canPay = verify.data?.ok && isConnected && !wrongNet && !insufficient && !noGas && !receipt;

  const payWithPermit = async () => {
    if (!wallet || !address || !pub) return;
    setSignError(null);
    setSigning("awaiting");
    try {
      const nonce = await pub.readContract({ address: deployment.protocol.musd, abi: musdAbi, functionName: "nonces", args: [address] });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      // Domain verified on-chain via eip712Domain(): name "Mezo USD", version "1".
      const sig = await wallet.signTypedData({
        account: address,
        domain: { name: "Mezo USD", version: "1", chainId: mezoTestnet.id, verifyingContract: deployment.protocol.musd },
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: { owner: address, spender: r.account, value: r.amount, nonce, deadline },
      });
      setSigning("idle");
      const { v, yParity, r: rr, s } = parseSignature(sig as Hex);
      const vNum = v !== undefined ? Number(v) : yParity + 27;
      await payTx.send({
        address: r.account,
        abi: repayAccountAbi,
        functionName: "payWithPermit",
        args: [r.amount, refHex, deadline, vNum, rr, s],
      });
    } catch (e) {
      setSigning("error");
      setSignError(describeError(e).message);
    }
  };

  const payWithApproval = async () => {
    await payTx.send({ address: r.account, abi: repayAccountAbi, functionName: "pay", args: [r.amount, refHex] });
  };

  const paymentEvent = receipt ? parseEventLogs({ abi: repayAccountAbi, logs: receipt.logs, eventName: "PaymentReceived" })[0] : undefined;

  return (
    <div className="animate-rise space-y-5">
      <div>
        <p className="eyebrow">Payment request</p>
        <h1 className="mt-2 font-display text-[30px] leading-tight tracking-tight text-ink">
          Pay {r.label ? r.label : shortAddress(r.account)}
        </h1>
      </div>

      <Card className="p-5">
        <p className="eyebrow">Amount</p>
        <Amount value={r.amount} className="mt-1 block font-display text-[40px] leading-none tracking-tight" />
        <div className="mt-5">
          <KeyValue
            rows={[
              ["Pay to account", <AddressLink key="a" address={r.account} />],
              ["Network", "Mezo Testnet · 31611"],
              ["Token", <AddressLink key="b" address={deployment.protocol.musd} label="MUSD" />],
              ["Reference", r.reference || <span key="c" className="text-ink-muted">None</span>],
            ]}
          />
        </div>
        <div className="mt-4">
          {verify.isLoading ? (
            <Skeleton className="h-8 w-60" />
          ) : verify.error ? (
            <Notice tone="danger" title="Couldn't verify the recipient">
              The Mezo RPC didn&apos;t respond. Don&apos;t pay until the recipient can be verified.
            </Notice>
          ) : verify.data?.ok ? (
            <Pill tone="positive" icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}>
              Verified RePay account (created by the RePay factory)
            </Pill>
          ) : (
            <Notice tone="danger" title="Not a RePay account">
              <span className="inline-flex items-center gap-1">
                <ShieldAlert className="h-4 w-4" aria-hidden /> This address was not created by the RePay factory. Do not pay through this link.
              </span>
            </Notice>
          )}
        </div>
        {r.label && <p className="mt-3 text-xs text-ink-muted">“{r.label}” is a name supplied in the link, not verified. Check the account address with the recipient.</p>}
      </Card>

      {split && verify.data?.ok && (
        <p className="text-sm leading-relaxed text-ink-muted">
          The recipient routes {formatBps(verify.data.bps)} of payments to repaying their Bitcoin-backed loan: <Amount value={split.toRepayment} /> of this
          payment. You pay exactly <Amount value={r.amount} />; nothing extra.
        </p>
      )}

      {receipt && paymentEvent ? (
        <Card className="p-5" aria-live="polite">
          <div className="flex items-center gap-2 text-sage-deep">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
            <h2 className="text-lg font-semibold">Payment confirmed</h2>
          </div>
          <div className="mt-4">
            <KeyValue
              rows={[
                ["Receipt #", <span key="a" className="num">{paymentEvent.args.paymentId.toString()}</span>],
                ["Paid", <Amount key="b" value={paymentEvent.args.amount} />],
                ["From", <AddressLink key="c" address={paymentEvent.args.payer} />],
                ["To account", <AddressLink key="d" address={r.account as Address} />],
                ["Block", <span key="e" className="num">{receipt.blockNumber.toString()}</span>],
                ["Transaction", <TxLink key="f" hash={receipt.transactionHash} />],
              ]}
            />
          </div>
          <button className="btn-ghost mt-4" onClick={() => { setReceipt(null); payTx.reset(); }}>
            Make another payment
          </button>
          <p className="mt-1 text-xs text-ink-muted">Paying again sends a second, separate payment.</p>
        </Card>
      ) : (
        <Card className="space-y-4 p-5">
          {!isConnected ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-ink-soft">Connect the wallet you&apos;ll pay from.</p>
              <WalletButton />
            </div>
          ) : (
            <>
              {wrongNet && <Notice tone="warning" title="Switch to Mezo Testnet" action={<WalletButton />} />}
              {insufficient && (
                <Notice tone="warning" title="Not enough MUSD">
                  Your wallet has <Amount value={musd.data!.balance} />. This payment needs <Amount value={r.amount} />.
                </Notice>
              )}
              {noGas && <Notice tone="warning" title="No BTC for gas">Get testnet BTC from the Mezo faucet to pay network fees.</Notice>}

              <fieldset>
                <legend className="label">How to authorise</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["permit", "Sign & pay", "One transaction. You sign a permit for exactly this amount."],
                      ["approve", "Approve, then pay", "Two transactions. Exact-amount approval."],
                    ] as const
                  ).map(([id, title, detail]) => (
                    <label key={id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${method === id ? "border-ink bg-ivory" : "border-line"}`}>
                      <input type="radio" name="method" className="mt-1 accent-[rgb(var(--ink))]" checked={method === id} onChange={() => setMethod(id)} disabled={busy} />
                      <span>
                        <span className="block text-sm font-medium text-ink">{title}</span>
                        <span className="block text-[13px] text-ink-muted">{detail}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <TxSteps phase={signing === "awaiting" ? "awaiting-signature" : payTx.state.phase} />

              <div aria-live="polite" className="space-y-2">
                {signing === "awaiting" && <Notice>Sign the permit in your wallet. Signing alone moves no funds.</Notice>}
                {signError && <Notice tone="warning">{signError}</Notice>}
                {approveTx.state.phase === "confirming" && <Notice>Approval confirming… <TxLink hash={approveTx.state.hash} /></Notice>}
                {approveTx.state.error && <Notice tone="warning">{approveTx.state.error}</Notice>}
                {(payTx.state.phase === "submitted" || payTx.state.phase === "confirming") && <Notice>Payment confirming… <TxLink hash={payTx.state.hash} /></Notice>}
                {payTx.state.phase === "slow" && (
                  <Notice tone="warning" title="Still confirming" action={<button className="btn-secondary min-h-[36px]" onClick={() => void payTx.recheck()}>Check again</button>}>
                    No receipt yet. That isn&apos;t a failure. Do not pay again; check the explorer. <TxLink hash={payTx.state.hash} />
                  </Notice>
                )}
                {(payTx.state.phase === "failed" || payTx.state.phase === "rejected") && <Notice tone={payTx.state.phase === "failed" ? "danger" : "warning"}>{payTx.state.error}</Notice>}
              </div>

              {method === "permit" ? (
                <button className="btn-accent w-full" disabled={!canPay || busy || payTx.state.phase === "slow"} onClick={() => void payWithPermit()}>
                  {busy && <Spinner />} Sign & pay <Amount value={r.amount} className="font-semibold" />
                </button>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    className="btn-secondary"
                    disabled={!canPay || busy || !!approved}
                    onClick={() => void approveTx.send({ address: deployment.protocol.musd, abi: musdAbi, functionName: "approve", args: [r.account, r.amount] })}
                  >
                    {approveTx.busy && <Spinner />} {approved ? "1. Approved" : "1. Approve exact amount"}
                  </button>
                  <button className="btn-accent" disabled={!canPay || busy || !approved || payTx.state.phase === "slow"} onClick={() => void payWithApproval()}>
                    {payTx.busy && <Spinner />} 2. Pay
                  </button>
                </div>
              )}
              <p className="text-xs text-ink-muted">
                Wallet MUSD: {musd.data ? <Amount value={musd.data.balance} /> : "…"} · BTC for gas: {gas.data ? <Amount value={gas.data.value} unit="BTC" digits={6} /> : "…"}
              </p>
            </>
          )}
        </Card>
      )}
      <p className="text-center text-xs text-ink-muted">Mezo RePay · testnet. The reference is a label, not proof of an invoice.</p>
    </div>
  );
}
