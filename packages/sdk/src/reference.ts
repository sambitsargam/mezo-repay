import { type Hex, hexToString, stringToHex } from "viem";

export const MAX_REFERENCE_BYTES = 31;
const ZERO = `0x${"0".repeat(64)}` as Hex;

/** Encodes a short payment reference (≤31 UTF-8 bytes) into bytes32. A reference is a label, not proof. */
export function encodeReference(ref: string): Hex {
  const trimmed = ref.trim();
  if (!trimmed) return ZERO;
  const bytes = new TextEncoder().encode(trimmed);
  if (bytes.length > MAX_REFERENCE_BYTES) throw new RangeError("reference too long");
  return stringToHex(trimmed, { size: 32 });
}

export function decodeReference(ref: Hex): string {
  if (/^0x0*$/.test(ref)) return "";
  return hexToString(ref, { size: 32 }).replace(/\0+$/, "");
}

export function referenceByteLength(ref: string): number {
  return new TextEncoder().encode(ref.trim()).length;
}
