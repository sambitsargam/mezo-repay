/**
 * Pure integer accounting helpers. All amounts are bigint base units (MUSD and BTC both 18 decimals).
 * These mirror RePayAccount.sol exactly; the contract remains the source of truth.
 */
export const BPS = 10_000n;
export const WAD = 10n ** 18n;

export interface Allocation {
  toRepayment: bigint;
  toOperating: bigint;
}

/** floor(amount * bps / 10_000) to repayment, remainder to operating cash. */
export function allocate(amount: bigint, repaymentBps: number | bigint): Allocation {
  const bps = BigInt(repaymentBps);
  if (amount < 0n) throw new RangeError("amount must be non-negative");
  if (bps < 0n || bps > BPS) throw new RangeError("repaymentBps must be within 0..10000");
  const toRepayment = (amount * bps) / BPS;
  return { toRepayment, toOperating: amount - toRepayment };
}

/** Maximum protocol-valid partial repayment: net debt must stay >= minNetDebt. */
export function maxRepayable(totalDebt: bigint, gasCompensation: bigint, minNetDebt: bigint): bigint {
  const floor = gasCompensation + minNetDebt;
  return totalDebt > floor ? totalDebt - floor : 0n;
}

/** Amount required to close: total debt minus gas compensation (burned from the GasPool). */
export function closeAmount(totalDebt: bigint, gasCompensation: bigint): bigint {
  return totalDebt > gasCompensation ? totalDebt - gasCompensation : 0n;
}

/** Collateral ratio as a WAD fraction (1.5e18 = 150%). Returns null when debt is zero. */
export function collateralRatio(collateral: bigint, debt: bigint, price: bigint): bigint | null {
  if (debt === 0n) return null;
  return (collateral * price) / debt;
}

/** Nominal ICR used for sorted-list hints: coll * 1e20 / debt. */
export function nominalCR(collateral: bigint, debt: bigint): bigint {
  if (debt === 0n) return 2n ** 256n - 1n;
  return (collateral * 10n ** 20n) / debt;
}

/** Projected Trove after opening: mirrors BorrowerOperations._openTrove. */
export function projectOpenTrove(params: {
  collateral: bigint;
  borrow: bigint;
  borrowingFee: bigint;
  gasCompensation: bigint;
  minNetDebt: bigint;
  price: bigint;
  mcr: bigint;
}) {
  const netDebt = params.borrow + params.borrowingFee;
  const totalDebt = netDebt + params.gasCompensation;
  const cr = collateralRatio(params.collateral, totalDebt, params.price);
  const headroom = maxRepayable(totalDebt, params.gasCompensation, params.minNetDebt);
  const problems: string[] = [];
  if (netDebt < params.minNetDebt) problems.push("belowMinDebt");
  if (cr !== null && cr < params.mcr) problems.push("belowMcr");
  // liquidation price: price at which CR == MCR
  const liquidationPrice = params.collateral === 0n ? 0n : (totalDebt * params.mcr) / params.collateral;
  return { netDebt, totalDebt, cr, headroom, liquidationPrice, problems };
}

/** Mirrors RePayAccount.Status. Ordered exactly like the Solidity enum. */
export const REPAYMENT_STATUS = [
  "Ready",
  "Paused",
  "NoActiveLoan",
  "NothingPending",
  "Cooldown",
  "ReserveShortfall",
  "AtMinimumDebt",
  "BelowMinExecution",
] as const;
export type RepaymentStatus = (typeof REPAYMENT_STATUS)[number];

export function repaymentStatus(code: number): RepaymentStatus {
  const s = REPAYMENT_STATUS[code];
  if (!s) throw new RangeError(`unknown repayment status ${code}`);
  return s;
}

/** Plain-language explanation for each waiting reason. */
export const REPAYMENT_STATUS_COPY: Record<RepaymentStatus, { title: string; detail: string }> = {
  Ready: { title: "Ready to repay", detail: "Pending repayment can be applied to the loan now." },
  Paused: { title: "Automation paused", detail: "You paused automated repayment. You can still repay manually." },
  NoActiveLoan: { title: "No active loan", detail: "This account has no open Trove, so there is nothing to repay." },
  NothingPending: { title: "Nothing pending", detail: "No income is waiting to be repaid. New tracked payments will add to it." },
  Cooldown: { title: "Cooling down", detail: "The policy's cooldown since the last automated repayment has not elapsed." },
  ReserveShortfall: {
    title: "Operating cash below reserve",
    detail: "Automated repayment waits until operating cash is back above your reserve.",
  },
  AtMinimumDebt: {
    title: "Waiting for enough MUSD to close the loan",
    detail:
      "Mezo requires at least the minimum net debt on an open loan. Further repayment needs a full close, which you control.",
  },
  BelowMinExecution: {
    title: "Below minimum execution",
    detail: "Pending repayment is smaller than the policy's minimum execution amount.",
  },
};

/** Mirrors RePayAccount.GuardStatus. Ordered exactly like the Solidity enum. */
export const GUARD_STATUS = ["Disabled", "NoActiveLoan", "PriceUnavailable", "Healthy", "Protectable", "NoResources"] as const;
export type GuardStatus = (typeof GUARD_STATUS)[number];

export function guardStatus(code: number): GuardStatus {
  const s = GUARD_STATUS[code];
  if (!s) throw new RangeError(`unknown guard status ${code}`);
  return s;
}

export const GUARD_STATUS_COPY: Record<GuardStatus, { title: string; detail: string }> = {
  Disabled: { title: "Guard off", detail: "Set a trigger ratio to let RePay protect the loan when the BTC price falls." },
  NoActiveLoan: { title: "No active loan", detail: "The guard only acts on an open Trove." },
  PriceUnavailable: { title: "Price unavailable", detail: "Mezo's price feed did not answer. The guard waits for a fresh price." },
  Healthy: { title: "Above trigger", detail: "The collateral ratio is above your trigger. Nothing to do." },
  Protectable: {
    title: "Below trigger: protect now",
    detail: "Pending MUSD is applied to the debt first, then buffer BTC is added as collateral, aiming for your target ratio.",
  },
  NoResources: {
    title: "Below trigger, nothing to protect with",
    detail: "No pending MUSD and no buffer BTC. Fund the buffer or add collateral yourself.",
  },
};

/** Mirrors RePayAccount.CloseStatus. Ordered exactly like the Solidity enum. */
export const CLOSE_STATUS = ["Ready", "Disabled", "Paused", "NoActiveLoan", "InsufficientPending"] as const;
export type CloseStatus = (typeof CLOSE_STATUS)[number];

export function closeStatus(code: number): CloseStatus {
  const s = CLOSE_STATUS[code];
  if (!s) throw new RangeError(`unknown close status ${code}`);
  return s;
}

export const CLOSE_STATUS_COPY: Record<CloseStatus, { title: string; detail: string }> = {
  Ready: { title: "Ready to close", detail: "Pending repayment covers the full payoff. The keeper (or anyone) can close the loan now; collateral returns to the account." },
  Disabled: { title: "Auto-close off", detail: "Turn it on to let income retire the last 1,800 MUSD and close the loan automatically." },
  Paused: { title: "Paused", detail: "Automation is paused in your policy. You can still close the loan yourself." },
  NoActiveLoan: { title: "No active loan", detail: "There is no open Trove to close." },
  InsufficientPending: { title: "Saving toward payoff", detail: "Pending repayment keeps growing from income. When it covers the payoff, the loan closes automatically." },
};

/** Share of the payoff already set aside, in basis points (capped at 10000). */
export function payoffProgressBps(pending: bigint, required: bigint): number {
  if (required === 0n) return 0;
  if (pending >= required) return 10_000;
  return Number((pending * 10_000n) / required);
}

/** Ratio as basis points of 100% (1e18 → 10000). */
export function ratioToBps(ratio: bigint): number {
  return Number((ratio * 10_000n) / WAD);
}

export function bpsToRatio(bps: number): bigint {
  return (BigInt(Math.round(bps)) * WAD) / 10_000n;
}

export const TROVE_STATUS = ["nonExistent", "active", "closedByOwner", "closedByLiquidation", "closedByRedemption"] as const;
export type TroveStatus = (typeof TROVE_STATUS)[number];

export function troveStatus(code: number): TroveStatus {
  const s = TROVE_STATUS[code];
  if (!s) throw new RangeError(`unknown trove status ${code}`);
  return s;
}

export const TROVE_STATUS_LABEL: Record<TroveStatus, string> = {
  nonExistent: "No loan",
  active: "Active",
  closedByOwner: "Closed",
  closedByLiquidation: "Liquidated",
  closedByRedemption: "Redeemed",
};
