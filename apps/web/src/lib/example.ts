import type { AccountSnapshot, ActivityItem, ProtocolParams } from "@repay/sdk";

/**
 * Deterministic sample data for "Explore example". Never fetched, never mixed with live data,
 * and carries no transaction hashes, so no explorer links can be generated from it.
 */
const E = 10n ** 18n;
const m = (whole: number, cents = 0) => BigInt(whole) * E + (BigInt(cents) * E) / 100n;

export const EXAMPLE_ACCOUNT = "0x0000000000000000000000000000000000000E01" as const;
export const EXAMPLE_OWNER = "0x0000000000000000000000000000000000000E02" as const;
export const EXAMPLE_NOW = 1_792_900_000; // fixed timestamp so renders are stable

export const exampleParams: ProtocolParams = {
  price: m(80_000),
  minNetDebt: m(1800),
  gasCompensation: m(200),
  mcr: (11n * E) / 10n,
  ccr: (15n * E) / 10n,
  interestRateBps: 100,
  recoveryMode: false,
  borrowingFeeOn1000: m(1),
};

export const exampleSnapshot: AccountSnapshot = {
  address: EXAMPLE_ACCOUNT,
  owner: EXAMPLE_OWNER,
  policy: { repaymentBps: 3000, cooldown: 3600, paused: false, operatingReserve: m(500), minExecution: m(25), maxExecution: m(1000) },
  musdBalance: m(2_974, 0),
  pendingRepayment: m(126),
  operatingCash: m(2_848),
  unclassified: 0n,
  totalIncome: m(4_420),
  totalAllocated: m(1_326),
  totalRepaid: m(1_200),
  totalBorrowed: m(3_000),
  totalCapital: 0n,
  totalWithdrawn: m(3_246),
  totalReleased: 0n,
  paymentCount: 6,
  lastExecutionAt: EXAMPLE_NOW - 5_400,
  loanStatus: "active",
  debt: m(2_006, 41),
  collateral: (8n * E) / 100n,
  maxRepayable: m(6, 41),
  btcBalance: 0n,
  collateralSurplus: 0n,
  previewAmount: 0n,
  previewStatus: "AtMinimumDebt",
  blockNumber: 0n,
};

type Ex = Omit<ActivityItem, "txHash"> & { txHash: never | `0x${string}` };

function ex(i: number, kind: ActivityItem["kind"], eventName: string, amount: bigint | null, reference = "", ago = 0): Ex {
  return {
    kind,
    eventName,
    // A clearly fake marker; the UI checks `mode` and never renders explorer links in example mode.
    txHash: `0x${"e".repeat(63)}${i.toString(16)}` as `0x${string}`,
    blockNumber: BigInt(1000 - i),
    logIndex: 0,
    account: EXAMPLE_ACCOUNT,
    amount,
    reference,
    actor: null,
    detail: {},
    timestamp: EXAMPLE_NOW - ago,
  };
}

export const exampleActivity: ActivityItem[] = [
  ex(1, "repayment", "RepaymentExecuted", m(300), "", 5_400),
  ex(2, "payment", "PaymentReceived", m(1_000), "INV-0412 Studio retainer", 9_000),
  ex(3, "withdrawal", "OperatingWithdrawn", m(1_200), "", 86_400),
  ex(4, "payment", "PaymentReceived", m(620), "INV-0411", 172_800),
  ex(5, "repayment", "RepaymentExecuted", m(500), "", 176_400),
  ex(6, "policy", "PolicyUpdated", null, "", 259_200),
  ex(7, "payment", "PaymentReceived", m(1_400), "INV-0410 Brand sprint", 345_600),
  ex(8, "repayment", "RepaymentExecuted", m(400), "", 349_200),
  ex(9, "payment", "PaymentReceived", m(500), "INV-0409", 432_000),
  ex(10, "payment", "PaymentReceived", m(600), "INV-0408", 518_400),
  ex(11, "payment", "PaymentReceived", m(300), "Consulting call", 604_800),
  ex(12, "withdrawal", "OperatingWithdrawn", m(2_046), "", 640_000),
  ex(13, "loanOpened", "LoanOpened", m(3_000), "", 691_200),
] as ActivityItem[];

export const exampleKeeper = {
  configured: true,
  lastSuccessfulScanAt: new Date((EXAMPLE_NOW - 40) * 1000).toISOString(),
  lastExecutionAt: new Date((EXAMPLE_NOW - 5_400) * 1000).toISOString(),
  pollSeconds: 60,
};
