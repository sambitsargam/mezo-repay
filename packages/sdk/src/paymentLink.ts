import { type Address, getAddress, isAddress } from "viem";
import { parseUnits18, formatUnits18 } from "./format";
import { MAX_REFERENCE_BYTES, referenceByteLength } from "./reference";

export interface PaymentRequest {
  account: Address;
  amount: bigint;
  reference: string;
  chainId: number;
  label?: string;
}

/** Path + query for the public payer page: /pay/<account>?amount=500&ref=INV-1&chain=31611 */
export function buildPaymentPath(req: PaymentRequest): string {
  const params = new URLSearchParams();
  params.set("amount", formatUnits18(req.amount, 18).replace(/,/g, "").replace(/\.?0+$/, ""));
  if (req.reference) params.set("ref", req.reference);
  if (req.label) params.set("to", req.label);
  params.set("chain", String(req.chainId));
  return `/pay/${req.account}?${params.toString()}`;
}

export type PaymentLinkError = "badAccount" | "badAmount" | "badReference" | "badChain";

export function parsePaymentRequest(
  account: string,
  search: URLSearchParams,
): { ok: true; value: PaymentRequest } | { ok: false; error: PaymentLinkError } {
  if (!isAddress(account)) return { ok: false, error: "badAccount" };
  const amount = parseUnits18(search.get("amount") ?? "");
  if (amount === null || amount === 0n) return { ok: false, error: "badAmount" };
  const reference = search.get("ref") ?? "";
  if (referenceByteLength(reference) > MAX_REFERENCE_BYTES) return { ok: false, error: "badReference" };
  const chainId = Number(search.get("chain") ?? "31611");
  if (!Number.isInteger(chainId)) return { ok: false, error: "badChain" };
  const label = search.get("to")?.slice(0, 60) || undefined;
  return { ok: true, value: { account: getAddress(account), amount, reference, chainId, label } };
}
