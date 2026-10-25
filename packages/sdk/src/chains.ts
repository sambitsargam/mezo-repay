import { defineChain } from "viem";

/** Mezo testnet. Chain id and RPC verified 2026-10-25 (see docs/RESEARCH.md). */
export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" } },
  testnet: true,
});

export const SUPPORTED_CHAIN_IDS = [mezoTestnet.id] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export function isSupportedChain(id: number | undefined): id is SupportedChainId {
  return id !== undefined && (SUPPORTED_CHAIN_IDS as readonly number[]).includes(id);
}

export function explorerTx(hash: string): string {
  return `${mezoTestnet.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${mezoTestnet.blockExplorers.default.url}/address/${address}`;
}
