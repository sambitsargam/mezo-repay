"use client";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import {
  type Abi,
  type Address,
  type Hash,
  type TransactionReceipt,
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { mezoTestnet } from "@repay/sdk";
import { useMode } from "./mode";

export type TxPhase =
  | "review"
  | "switching"
  | "awaiting-signature"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "slow"
  | "failed"
  | "rejected";

export interface TxState {
  phase: TxPhase;
  hash?: Hash;
  receipt?: TransactionReceipt;
  error?: string;
  replacedBy?: Hash;
}

export interface TxRequest {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

const ERROR_COPY: Record<string, string> = {
  NotOwner: "Only the account owner can do this.",
  RepaymentNotReady: "Repayment isn't ready right now. The latest state has been reloaded.",
  ExceedsRepayableDebt: "This would take the loan below Mezo's minimum debt. Lower the amount or close the loan.",
  InsufficientOperatingCash: "Not enough operating cash for this amount.",
  InsufficientPending: "Not enough pending repayment for this amount.",
  InsufficientUnclassified: "Not enough unclassified MUSD for this amount.",
  InsufficientFundsToClose: "The account doesn't hold enough MUSD to close the loan.",
  InvalidPolicy: "The policy values aren't valid. Check the maximum is at least the minimum.",
  LoanActive: "This account already has an active loan.",
  LoanNotActive: "This account has no active loan.",
  ZeroAmount: "Enter an amount greater than zero.",
  ERC20InsufficientAllowance: "The approval is lower than the payment amount. Approve again.",
  ERC20InsufficientBalance: "Your wallet doesn't have enough MUSD.",
};

/** Turns any wallet/RPC/contract error into plain language. Exported for tests. */
export function describeError(e: unknown): { rejected: boolean; message: string } {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return { rejected: true, message: "You rejected the request in your wallet." };
    if (e.walk((x) => x instanceof InsufficientFundsError))
      return { rejected: false, message: "Not enough BTC in your wallet to pay for gas. Get testnet BTC from the faucet." };
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && ERROR_COPY[name]) return { rejected: false, message: ERROR_COPY[name]! };
      if (revert.reason) return { rejected: false, message: `The contract rejected this: ${revert.reason}` };
      return { rejected: false, message: revert.shortMessage };
    }
    if (/user rejected|user denied|rejected the request/i.test(e.message)) return { rejected: true, message: "You rejected the request in your wallet." };
    if (/fetch|network|timeout|HTTP request failed/i.test(e.message))
      return { rejected: false, message: "The Mezo RPC didn't respond. Nothing was sent; try again shortly." };
    return { rejected: false, message: e.shortMessage };
  }
  if (e instanceof Error && /rejected|denied/i.test(e.message)) return { rejected: true, message: "You rejected the request in your wallet." };
  return { rejected: false, message: e instanceof Error ? e.message : "Something went wrong." };
}

/**
 * One transaction, one state machine. A lock prevents double submission; a slow receipt is reported
 * as "still confirming" (never as failure) and is never resubmitted automatically.
 */
export function useTransaction(opts: { onConfirmed?: (r: TransactionReceipt) => void } = {}) {
  const mode = useMode();
  const [state, setState] = useState<TxState>({ phase: "review" });
  const lock = useRef(false);
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const pub = usePublicClient({ chainId: mezoTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const qc = useQueryClient();
  const startedFor = useRef<Address | undefined>(undefined);

  const reset = useCallback(() => {
    if (lock.current) return;
    setState({ phase: "review" });
  }, []);

  const send = useCallback(
    async (req: TxRequest) => {
      if (mode !== "live") {
        setState({ phase: "failed", error: "Example mode is read-only. Connect a wallet in the live app to transact." });
        return;
      }
      if (lock.current) return;
      lock.current = true;
      startedFor.current = address;
      try {
        if (!address || !wallet || !pub) throw new Error("Connect a wallet first.");
        if (chainId !== mezoTestnet.id) {
          setState({ phase: "switching" });
          await switchChainAsync({ chainId: mezoTestnet.id });
        }
        // Simulate first so contract errors surface before the wallet prompt.
        const { request } = await pub.simulateContract({
          address: req.address,
          abi: req.abi as Abi,
          functionName: req.functionName,
          args: req.args as unknown[],
          value: req.value,
          account: address,
        });
        setState({ phase: "awaiting-signature" });
        const hash = await wallet.writeContract({ ...request, account: address, chain: mezoTestnet } as never);
        setState({ phase: "submitted", hash });
        setState({ phase: "confirming", hash });
        let replacedBy: Hash | undefined;
        try {
          const receipt = await pub.waitForTransactionReceipt({
            hash,
            timeout: 90_000,
            retryCount: 12,
            onReplaced: (r) => {
              replacedBy = r.transaction.hash;
            },
          });
          if (receipt.status !== "success") {
            setState({ phase: "failed", hash: receipt.transactionHash, receipt, error: "The transaction was mined but reverted. No funds moved.", replacedBy });
          } else {
            setState({ phase: "confirmed", hash: receipt.transactionHash, receipt, replacedBy });
            opts.onConfirmed?.(receipt);
          }
        } catch (e) {
          if (e instanceof WaitForTransactionReceiptTimeoutError || (e instanceof BaseError && /receipt|timed out/i.test(e.message))) {
            setState({ phase: "slow", hash });
          } else throw e;
        }
        await qc.invalidateQueries();
      } catch (e) {
        const d = describeError(e);
        setState({ phase: d.rejected ? "rejected" : "failed", error: d.message });
        void qc.invalidateQueries({ queryKey: ["snapshot"] });
      } finally {
        lock.current = false;
      }
    },
    [mode, address, wallet, pub, chainId, switchChainAsync, qc, opts],
  );

  /** Re-check a slow transaction's receipt. Never resubmits. */
  const recheck = useCallback(async () => {
    if (!state.hash || !pub || lock.current) return;
    lock.current = true;
    const hash = state.hash;
    setState({ phase: "confirming", hash });
    try {
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status === "success") {
        setState({ phase: "confirmed", hash, receipt });
        opts.onConfirmed?.(receipt);
      } else setState({ phase: "failed", hash, receipt, error: "The transaction was mined but reverted. No funds moved." });
      await qc.invalidateQueries();
    } catch {
      setState({ phase: "slow", hash });
    } finally {
      lock.current = false;
    }
  }, [state.hash, pub, qc, opts]);

  const busy = ["switching", "awaiting-signature", "submitted", "confirming"].includes(state.phase);
  const accountChanged = !!startedFor.current && !!address && startedFor.current !== address && busy;
  return { state, send, reset, recheck, busy, accountChanged };
}
