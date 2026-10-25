import type { Address, Hash } from "viem";
import raw from "./deployments.json";

export interface ProtocolAddresses {
  source: string;
  musd: Address;
  borrowerOperations: Address;
  troveManager: Address;
  hintHelpers: Address;
  sortedTroves: Address;
  priceFeed: Address;
  collSurplusPool: Address;
  interestRateManager: Address;
}

export interface RePayDeployment {
  factory: Address;
  implementation: Address;
  deploymentBlock: number;
  deploymentTx: Hash;
  deployer: Address;
  sourceCommit: string;
  compiler: string;
  verified: "sourcify-exact-match" | "unverified" | "unknown";
  verification?: { sourcify?: { factory: string; implementation: string; url: string }; blockscout?: string };
  deployedAt: string;
}

export interface NetworkDeployment {
  network: string;
  chainId: number;
  explorer: string;
  protocol: ProtocolAddresses;
  /** null until RePay contracts are deployed to this network. Never filled with placeholders. */
  repay: RePayDeployment | null;
}

/** Shared deployment registry used by the web app, keeper, smoke tests, and docs. */
export const deployments = raw as unknown as Record<string, NetworkDeployment>;

export function getDeployment(chainId: number): NetworkDeployment | undefined {
  return deployments[String(chainId)];
}
