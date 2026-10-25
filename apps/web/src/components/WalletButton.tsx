"use client";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { AlertTriangle, LogOut, Wallet } from "lucide-react";
import { mezoTestnet, shortAddress } from "@repay/sdk";
import { useMode } from "@/lib/mode";
import { Spinner } from "./ui";
import { useEffect, useState } from "react";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const mode = useMode();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mode === "example") {
    return <span className="inline-flex min-h-[40px] items-center rounded-xl border border-dashed border-line-strong px-3 text-sm text-ink-muted">Sample owner</span>;
  }
  if (!mounted) return <span className="inline-block h-10 w-32" aria-hidden />;

  if (!isConnected) {
    const injected = connectors[0];
    const hasWallet = typeof window !== "undefined" && !!(window as unknown as { ethereum?: unknown }).ethereum;
    return (
      <div className="flex flex-col items-end">
        <button
          className="btn-primary min-h-[40px]"
          disabled={isPending}
          onClick={() => injected && connect({ connector: injected, chainId: mezoTestnet.id })}
        >
          {isPending ? <Spinner /> : <Wallet className="h-4 w-4" aria-hidden />}
          {compact ? "Connect" : "Connect wallet"}
        </button>
        {!hasWallet && !compact && <span className="mt-1 text-xs text-ink-muted">Needs a browser wallet (e.g. MetaMask)</span>}
        {error && <span role="alert" className="mt-1 max-w-[220px] text-right text-xs text-rust">{/rejected/i.test(error.message) ? "Connection rejected." : "Couldn't connect. Is a wallet installed?"}</span>}
      </div>
    );
  }

  if (chainId !== mezoTestnet.id) {
    return (
      <button className="btn-accent min-h-[40px]" disabled={switching} onClick={() => switchChain({ chainId: mezoTestnet.id })}>
        {switching ? <Spinner /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
        Switch to Mezo Testnet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-line bg-surface px-3 font-mono text-sm text-ink">
        <span className="h-2 w-2 rounded-full bg-sage" aria-hidden />
        <span className="sr-only">Connected wallet </span>
        {shortAddress(address!)}
      </span>
      <button className="btn-ghost min-h-[40px] px-2.5" onClick={() => disconnect()} aria-label="Disconnect wallet">
        <LogOut className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
