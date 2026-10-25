import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Address, Hash } from "viem";

export interface AccountStatus {
  account: Address;
  owner: Address;
  previewStatus: string;
  previewAmount: string;
  pendingRepayment: string;
  debt: string;
  checkedAt: string;
  lastAction?: { kind: "executed" | "simulated" | "skipped" | "failed"; at: string; txHash?: Hash; amount?: string; error?: string };
}

export interface KeeperState {
  chainId: number;
  factory: Address | null;
  lastScannedBlock: string; // discovery checkpoint
  accounts: Address[];
  lastScanAt: string | null;
  lastSuccessfulScanAt: string | null;
  lastExecution: { account: Address; txHash: Hash; amount: string; at: string; blockNumber: string } | null;
  mode: "live" | "dry-run";
  keeperAddress: Address | null;
  statuses: Record<string, AccountStatus>;
  lastError: string | null;
  startedAt: string;
}

export function loadState(dir: string, init: () => KeeperState): KeeperState {
  const p = join(dir, "state.json");
  if (!existsSync(p)) return init();
  try {
    const s = JSON.parse(readFileSync(p, "utf8")) as KeeperState;
    const fresh = init();
    // reset when network or factory changed
    if (s.chainId !== fresh.chainId || s.factory !== fresh.factory) return fresh;
    return { ...s, mode: fresh.mode, keeperAddress: fresh.keeperAddress, startedAt: fresh.startedAt };
  } catch {
    return init();
  }
}

/** Atomic write (tmp + rename) so a crash never leaves a half-written checkpoint. */
export function saveState(dir: string, s: KeeperState) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "state.json");
  writeFileSync(p + ".tmp", JSON.stringify(s, null, 2));
  renameSync(p + ".tmp", p);
}
