import { WAD } from "./accounting";

/** Formats an 18-decimal bigint with fixed fraction digits, truncating (never rounding up). */
export function formatUnits18(value: bigint, fractionDigits = 2): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / WAD;
  const frac = abs % WAD;
  const fracStr = frac.toString().padStart(18, "0").slice(0, fractionDigits);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = fractionDigits > 0 ? `${wholeStr}.${fracStr}` : wholeStr;
  return negative ? `-${body}` : body;
}

export function formatMusd(value: bigint, fractionDigits = 2): string {
  return `${formatUnits18(value, fractionDigits)} MUSD`;
}

export function formatBtc(value: bigint, fractionDigits = 6): string {
  return `${formatUnits18(value, fractionDigits)} BTC`;
}

/** WAD ratio → "152.3%". */
export function formatRatio(ratio: bigint | null, fractionDigits = 1): string {
  if (ratio === null) return "—";
  return `${formatUnits18(ratio * 100n, fractionDigits)}%`;
}

export function formatBps(bps: number | bigint): string {
  const b = BigInt(bps);
  const whole = b / 100n;
  const frac = b % 100n;
  return frac === 0n ? `${whole}%` : `${whole}.${frac.toString().padStart(2, "0").replace(/0$/, "")}%`;
}

/**
 * Parses a user-entered decimal string into 18-decimal base units. Rejects anything that is not a
 * plain non-negative decimal with at most 18 fraction digits. Never uses floating point.
 */
export function parseUnits18(input: string): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{0,18})?$/.test(s) && !/^\.\d{1,18}$/.test(s)) return null;
  const [w = "0", f = ""] = s.split(".");
  return BigInt(w || "0") * WAD + BigInt((f + "0".repeat(18)).slice(0, 18));
}

export function percentToBps(input: string): number | null {
  const s = input.trim();
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(s)) return null;
  const [w = "0", f = ""] = s.split(".");
  const bps = Number(w) * 100 + Number((f + "00").slice(0, 2));
  return bps <= 10_000 ? bps : null;
}

export function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "none";
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}
