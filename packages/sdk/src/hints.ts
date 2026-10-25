import type { Address, PublicClient } from "viem";
import { hintHelpersAbi, sortedTrovesAbi } from "./abi/mezo";
import { nominalCR } from "./accounting";
import type { ProtocolAddresses } from "./deployments";

export interface Hints {
  upper: Address;
  lower: Address;
}

export const ZERO_HINTS: Hints = {
  upper: "0x0000000000000000000000000000000000000000",
  lower: "0x0000000000000000000000000000000000000000",
};

/**
 * Computes SortedTroves insert hints for a Trove with the given collateral and principal-based debt.
 * Hints only affect gas: SortedTroves falls back to a list search when they are stale.
 */
export async function computeHints(
  client: PublicClient,
  protocol: Pick<ProtocolAddresses, "hintHelpers" | "sortedTroves">,
  collateral: bigint,
  debt: bigint,
  seed = 42n,
): Promise<Hints> {
  if (debt === 0n) return ZERO_HINTS;
  const nicr = nominalCR(collateral, debt);
  const [approx] = await client.readContract({
    address: protocol.hintHelpers,
    abi: hintHelpersAbi,
    functionName: "getApproxHint",
    args: [nicr, 15n, seed],
  });
  const [upper, lower] = await client.readContract({
    address: protocol.sortedTroves,
    abi: sortedTrovesAbi,
    functionName: "findInsertPosition",
    args: [nicr, approx, approx],
  });
  return { upper, lower };
}
