"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import type { TransactionReceipt } from "viem";
import { type TxRequest, useTransaction, type TxPhase } from "@/lib/tx";
import { useMode } from "@/lib/mode";
import { Notice, Spinner, TxLink, cx } from "./ui";
import { useToast } from "./toast";

const STEPS: Array<{ key: TxPhase; label: string }> = [
  { key: "review", label: "Review" },
  { key: "awaiting-signature", label: "Awaiting signature" },
  { key: "submitted", label: "Submitted" },
  { key: "confirming", label: "Confirming" },
  { key: "confirmed", label: "Confirmed" },
];

function stepIndex(p: TxPhase): number {
  if (p === "switching") return 0;
  if (p === "slow") return 3;
  if (p === "failed" || p === "rejected") return -1;
  return STEPS.findIndex((s) => s.key === p);
}

export function TxSteps({ phase }: { phase: TxPhase }) {
  const idx = stepIndex(phase);
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Transaction progress">
      {STEPS.map((s, i) => {
        const done = idx > i || phase === "confirmed";
        const current = idx === i && phase !== "confirmed";
        return (
          <li key={s.key} className="min-w-0" aria-current={current ? "step" : undefined}>
            <div className="h-1 overflow-hidden rounded-full bg-line">
              <div
                className={cx("h-full rounded-full transition-[width,background-color] duration-500", done ? "w-full bg-sage" : current ? "flow-stripes w-full bg-copper" : "w-0")}
              />
            </div>
            <p className={cx("mt-1.5 truncate text-[11px]", current ? "font-medium text-ink" : done ? "text-sage-deep" : "text-ink-muted")}>
              {done && <Check className="animate-pop mr-0.5 inline h-3 w-3" aria-hidden />}
              {s.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export interface TxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  summary: React.ReactNode;
  confirmLabel: string;
  request: TxRequest | null;
  blocker?: string | null;
  warning?: React.ReactNode;
  onConfirmed?: (r: TransactionReceipt) => void;
  successMessage?: React.ReactNode;
  destructive?: boolean;
}

export function TxDialog(props: TxDialogProps) {
  const mode = useMode();
  const toast = useToast();
  const tx = useTransaction({
    onConfirmed: (r) => {
      toast({ title: `${props.title}: confirmed`, hash: r.transactionHash });
      props.onConfirmed?.(r);
    },
  });
  const { phase, hash, error, replacedBy } = tx.state;
  const close = (o: boolean) => {
    if (!o && tx.busy) return; // keep the dialog while a transaction is in flight
    if (!o) tx.reset();
    props.onOpenChange(o);
  };
  const done = phase === "confirmed";
  return (
    <Dialog.Root open={props.open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className="animate-toast fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-lift focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(520px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6"
          onInteractOutside={(e) => tx.busy && e.preventDefault()}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-ink">{props.title}</Dialog.Title>
              {props.description && <Dialog.Description className="mt-1 text-sm text-ink-muted">{props.description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <button className="btn-ghost -mr-2 -mt-1 min-h-[40px] px-2" aria-label="Close" disabled={tx.busy}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5">
            <TxSteps phase={phase} />
          </div>

          <div className="mt-5 rounded-xl border border-line bg-ivory/60 px-4 py-1">{props.summary}</div>

          <div className="mt-4 space-y-3" aria-live="polite">
            {mode === "example" && <Notice tone="warning" title="Example data">This is a read-only example. No transaction will be sent.</Notice>}
            {props.warning && phase === "review" && props.warning}
            {props.blocker && phase === "review" && <Notice tone="warning">{props.blocker}</Notice>}
            {tx.accountChanged && <Notice tone="warning">Your wallet account changed while this transaction was in progress. It continues for the original account.</Notice>}
            {phase === "switching" && <Notice>Switch your wallet to Mezo Testnet to continue.</Notice>}
            {phase === "awaiting-signature" && <Notice>Confirm the transaction in your wallet.</Notice>}
            {(phase === "submitted" || phase === "confirming") && (
              <Notice>
                Waiting for Mezo testnet to confirm. <TxLink hash={hash} />
              </Notice>
            )}
            {phase === "slow" && (
              <Notice
                tone="warning"
                title="Still confirming"
                action={
                  <button className="btn-secondary min-h-[36px]" onClick={() => void tx.recheck()}>
                    Check again
                  </button>
                }
              >
                The network hasn&apos;t returned a receipt yet. That isn&apos;t a failure. Don&apos;t resubmit; check the explorer. <TxLink hash={hash} />
              </Notice>
            )}
            {replacedBy && <Notice>Your wallet replaced the transaction. Tracking the replacement.</Notice>}
            {phase === "rejected" && <Notice tone="warning">{error}</Notice>}
            {phase === "failed" && (
              <Notice tone="danger" title="Not completed">
                {error} {hash && <TxLink hash={hash} />}
              </Notice>
            )}
            {done && <SuccessMark />}
            {done && (
              <Notice tone="positive" title="Confirmed on Mezo testnet">
                {props.successMessage} <TxLink hash={hash} />
              </Notice>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {done ? (
              <button className="btn-primary" onClick={() => close(false)}>
                Done
              </button>
            ) : (
              <>
                <Dialog.Close asChild>
                  <button className="btn-secondary" disabled={tx.busy}>
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  className={props.destructive ? "btn-accent" : "btn-primary"}
                  disabled={tx.busy || !props.request || !!props.blocker || mode === "example" || phase === "slow"}
                  onClick={() => props.request && void tx.send(props.request)}
                >
                  {tx.busy && <Spinner />}
                  {phase === "failed" || phase === "rejected" ? "Try again" : props.confirmLabel}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SuccessMark() {
  return (
    <div className="flex justify-center py-2" aria-hidden>
      <svg viewBox="0 0 52 52" className="animate-pop h-14 w-14">
        <circle cx="26" cy="26" r="24" fill="rgb(var(--sage-wash))" stroke="rgb(var(--sage))" strokeWidth="2" />
        <path d="M15 27 l7 7 l15 -16" fill="none" stroke="rgb(var(--sage-deep))" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="animate-draw" style={{ ["--len" as string]: 40 }} />
      </svg>
    </div>
  );
}
