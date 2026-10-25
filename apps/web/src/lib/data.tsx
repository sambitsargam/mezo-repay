"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";
import {
  type AccountSnapshot,
  type ActivityItem,
  type ProtocolParams,
  getDeployment,
  mezoTestnet,
  readAccountSnapshot,
  readActivity,
  readProtocolParams,
  repayAccountFactoryAbi,
} from "@repay/sdk";
import { useMode } from "./mode";
import { EXAMPLE_ACCOUNT, EXAMPLE_OWNER, exampleActivity, exampleKeeper, exampleParams, exampleSnapshot } from "./example";

export const deployment = getDeployment(mezoTestnet.id)!;

export interface Loadable<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  updatedAt: number;
}

function usePub(): PublicClient {
  return usePublicClient({ chainId: mezoTestnet.id }) as unknown as PublicClient;
}

/** Network state for the connected wallet. */
export function useNetwork() {
  const mode = useMode();
  const { address, isConnected, status, chainId: walletChain } = useAccount();
  const appChain = useChainId();
  if (mode === "example") {
    return { address: EXAMPLE_OWNER as Address, isConnected: true, wrongNetwork: false, status: "connected" as const };
  }
  const wrongNetwork = isConnected && walletChain !== undefined && walletChain !== mezoTestnet.id;
  return { address, isConnected, wrongNetwork, status, appChain };
}

/** RePay accounts owned by the connected wallet, from the factory. */
export function useOwnedAccounts(): Loadable<Address[]> {
  const mode = useMode();
  const pub = usePub();
  const { address } = useAccount();
  const q = useQuery({
    queryKey: ["owned", address],
    enabled: mode === "live" && !!address && !!deployment.repay,
    queryFn: async () =>
      (await pub.readContract({
        address: deployment.repay!.factory,
        abi: repayAccountFactoryAbi,
        functionName: "accountsOf",
        args: [address!],
      })) as Address[],
  });
  if (mode === "example") return { data: [EXAMPLE_ACCOUNT], isLoading: false, error: null, refetch: () => {}, updatedAt: 0 };
  return { data: q.data, isLoading: q.isLoading, error: q.error, refetch: () => void q.refetch(), updatedAt: q.dataUpdatedAt };
}

// ---------------------------------------------------------------------------------------------
// Selected account

interface SelectionCtx {
  account: Address | undefined;
  accounts: Address[];
  loading: boolean;
  error: Error | null;
  select: (a: Address) => void;
  refresh: () => void;
}
const Selection = createContext<SelectionCtx | null>(null);

export function AccountSelectionProvider({ children }: { children: React.ReactNode }) {
  const mode = useMode();
  const { address } = useAccount();
  const owned = useOwnedAccounts();
  const [chosen, setChosen] = useState<Address | undefined>(undefined);
  const storageKey = address ? `repay:selected:${address.toLowerCase()}` : null;

  useEffect(() => {
    setChosen(undefined);
    if (!storageKey) return;
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v) setChosen(v as Address);
    } catch {
      /* storage unavailable */
    }
  }, [storageKey]);

  const accounts = useMemo(() => owned.data ?? [], [owned.data]);
  const account = useMemo(() => {
    if (mode === "example") return EXAMPLE_ACCOUNT as Address;
    if (chosen && accounts.some((a) => a.toLowerCase() === chosen.toLowerCase())) return chosen;
    return accounts[accounts.length - 1];
  }, [mode, chosen, accounts]);

  const select = useCallback(
    (a: Address) => {
      setChosen(a);
      try {
        if (storageKey) window.localStorage.setItem(storageKey, a);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  return (
    <Selection.Provider
      value={{ account, accounts, loading: owned.isLoading, error: owned.error, select, refresh: owned.refetch }}
    >
      {children}
    </Selection.Provider>
  );
}

export function useSelection(): SelectionCtx {
  const c = useContext(Selection);
  if (!c) throw new Error("AccountSelectionProvider missing");
  return c;
}

// ---------------------------------------------------------------------------------------------
// Chain data

export function useSnapshot(account?: Address): Loadable<AccountSnapshot> {
  const mode = useMode();
  const pub = usePub();
  const q = useQuery({
    queryKey: ["snapshot", account],
    enabled: mode === "live" && !!account,
    queryFn: () => readAccountSnapshot(pub, account!),
    refetchInterval: 15_000,
  });
  if (mode === "example") return { data: exampleSnapshot, isLoading: false, error: null, refetch: () => {}, updatedAt: 0 };
  return { data: q.data, isLoading: q.isLoading && !!account, error: q.error, refetch: () => void q.refetch(), updatedAt: q.dataUpdatedAt };
}

export function useProtocol(): Loadable<ProtocolParams> {
  const mode = useMode();
  const pub = usePub();
  const q = useQuery({
    queryKey: ["protocol"],
    enabled: mode === "live",
    queryFn: () => readProtocolParams(pub, deployment.protocol),
    refetchInterval: 30_000,
  });
  if (mode === "example") return { data: exampleParams, isLoading: false, error: null, refetch: () => {}, updatedAt: 0 };
  return { data: q.data, isLoading: q.isLoading, error: q.error, refetch: () => void q.refetch(), updatedAt: q.dataUpdatedAt };
}

export function useActivity(account?: Address): Loadable<ActivityItem[]> {
  const mode = useMode();
  const pub = usePub();
  const q = useQuery({
    queryKey: ["activity", account],
    enabled: mode === "live" && !!account && !!deployment.repay,
    queryFn: () => readActivity(pub, account!, BigInt(deployment.repay!.deploymentBlock), undefined, { withTimestamps: true }),
    refetchInterval: 30_000,
  });
  if (mode === "example") return { data: exampleActivity, isLoading: false, error: null, refetch: () => {}, updatedAt: 0 };
  return { data: q.data, isLoading: q.isLoading && !!account, error: q.error, refetch: () => void q.refetch(), updatedAt: q.dataUpdatedAt };
}

export interface KeeperView {
  configured: boolean;
  reachable: boolean;
  lastSuccessfulScanAt: string | null;
  lastExecutionAt: string | null;
  pollSeconds: number | null;
  mode?: string;
  accountStatus?: { previewStatus: string; checkedAt: string; lastAction?: { kind: string; at: string; txHash?: string; error?: string } };
  error?: string;
}

const KEEPER_URL = process.env.NEXT_PUBLIC_KEEPER_STATUS_URL || "";

/** Keeper status comes only from the keeper's own status endpoint. No endpoint → "not configured". */
export function useKeeper(account?: Address): Loadable<KeeperView> {
  const mode = useMode();
  const q = useQuery({
    queryKey: ["keeper", account],
    enabled: mode === "live" && !!KEEPER_URL,
    queryFn: async (): Promise<KeeperView> => {
      try {
        const res = await fetch(`${KEEPER_URL.replace(/\/$/, "")}/status`, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const s = await res.json();
        const st = account ? s.statuses?.[account] : undefined;
        return {
          configured: true,
          reachable: true,
          lastSuccessfulScanAt: s.lastSuccessfulScanAt ?? null,
          lastExecutionAt: s.lastExecution?.at ?? null,
          pollSeconds: s.pollSeconds ?? null,
          mode: s.mode,
          accountStatus: st,
        };
      } catch (e) {
        return {
          configured: true,
          reachable: false,
          lastSuccessfulScanAt: null,
          lastExecutionAt: null,
          pollSeconds: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
    refetchInterval: 30_000,
  });
  if (mode === "example") {
    return { data: { ...exampleKeeper, reachable: true, mode: "example" }, isLoading: false, error: null, refetch: () => {}, updatedAt: 0 };
  }
  if (!KEEPER_URL) {
    return {
      data: { configured: false, reachable: false, lastSuccessfulScanAt: null, lastExecutionAt: null, pollSeconds: null },
      isLoading: false,
      error: null,
      refetch: () => {},
      updatedAt: 0,
    };
  }
  return { data: q.data, isLoading: q.isLoading, error: q.error, refetch: () => void q.refetch(), updatedAt: q.dataUpdatedAt };
}
