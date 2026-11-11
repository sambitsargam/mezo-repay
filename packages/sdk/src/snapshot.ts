import type { Address, PublicClient } from "viem";
import { repayAccountAbi } from "./abi/RePayAccount";
import { borrowerOperationsAbi, interestRateManagerAbi, priceFeedAbi, troveManagerAbi } from "./abi/mezo";
import { closeStatus, guardStatus, repaymentStatus, troveStatus, type CloseStatus, type GuardStatus, type RepaymentStatus, type TroveStatus } from "./accounting";
import type { ProtocolAddresses } from "./deployments";

export interface Policy {
  repaymentBps: number;
  cooldown: number;
  paused: boolean;
  operatingReserve: bigint;
  minExecution: bigint;
  maxExecution: bigint;
}

export interface Guard {
  /** 1e18 = 100%. 0 = guard off. */
  triggerRatio: bigint;
  targetRatio: bigint;
}

export interface AccountSnapshot {
  address: Address;
  owner: Address;
  policy: Policy;
  musdBalance: bigint;
  pendingRepayment: bigint;
  operatingCash: bigint;
  unclassified: bigint;
  totalIncome: bigint;
  totalAllocated: bigint;
  totalRepaid: bigint;
  totalBorrowed: bigint;
  totalCapital: bigint;
  totalWithdrawn: bigint;
  totalReleased: bigint;
  paymentCount: number;
  lastExecutionAt: number;
  loanStatus: TroveStatus;
  debt: bigint;
  collateral: bigint;
  maxRepayable: bigint;
  btcBalance: bigint;
  collateralSurplus: bigint;
  previewAmount: bigint;
  previewStatus: RepaymentStatus;
  guard: Guard;
  collateralBuffer: bigint;
  /** BTC price from Mezo's feed (0 if unavailable). */
  price: bigint;
  /** Collateral ratio, 1e18 = 100% (0 if no loan or no price). */
  ratio: bigint;
  guardRepay: bigint;
  guardTopUp: bigint;
  guardStatus: GuardStatus;
  totalProtectRepaid: bigint;
  totalProtectTopUp: bigint;
  /** Owner opted in to keeper-executed close (v3+; false on older accounts). */
  autoClose: boolean;
  /** MUSD needed to close the loan now (debt minus Mezo's gas compensation). */
  closeRequired: bigint;
  closeStatus: CloseStatus;
  /** Contract version ("2" accounts have no auto-close). */
  version: number;
  blockNumber: bigint;
}

type SnapshotFn = Extract<(typeof repayAccountAbi)[number], { type: "function"; name: "snapshot" }>;
const V3_ONLY = new Set(["autoClose", "closeRequired", "closeStatus"]);
/** v2 accounts return the same struct without the three auto-close fields. */
const legacySnapshotAbi = repayAccountAbi
  .filter((e): e is SnapshotFn => e.type === "function" && (e as { name?: string }).name === "snapshot")
  .map((e) => ({
    ...e,
    outputs: e.outputs.map((o) => ({ ...o, components: (o as { components: readonly { name: string }[] }).components.filter((c) => !V3_ONLY.has(c.name)) })),
  }));

export async function readAccountSnapshot(client: PublicClient, address: Address): Promise<AccountSnapshot> {
  const blockNumber = await client.getBlockNumber();
  let version = 3;
  let s: Awaited<ReturnType<typeof readV3>> & { autoClose?: boolean; closeRequired?: bigint; closeStatus?: number };
  try {
    s = await readV3(client, address, blockNumber);
  } catch (err) {
    // Older accounts return a shorter struct; decode it with the legacy shape.
    const legacy = (await client
      .readContract({ address, abi: legacySnapshotAbi as unknown as typeof repayAccountAbi, functionName: "snapshot", blockNumber })
      .catch(() => {
        throw err;
      })) as typeof s;
    s = { ...legacy, autoClose: false, closeRequired: 0n, closeStatus: 1 };
    version = 2;
  }
  return {
    address,
    owner: s.owner,
    policy: {
      repaymentBps: Number(s.policy.repaymentBps),
      cooldown: Number(s.policy.cooldown),
      paused: s.policy.paused,
      operatingReserve: s.policy.operatingReserve,
      minExecution: s.policy.minExecution,
      maxExecution: s.policy.maxExecution,
    },
    musdBalance: s.musdBalance,
    pendingRepayment: s.pendingRepayment,
    operatingCash: s.operatingCash,
    unclassified: s.unclassified,
    totalIncome: s.totalIncome,
    totalAllocated: s.totalAllocated,
    totalRepaid: s.totalRepaid,
    totalBorrowed: s.totalBorrowed,
    totalCapital: s.totalCapital,
    totalWithdrawn: s.totalWithdrawn,
    totalReleased: s.totalReleased,
    paymentCount: Number(s.paymentCount),
    lastExecutionAt: Number(s.lastExecutionAt),
    loanStatus: troveStatus(s.loanStatus),
    debt: s.debt,
    collateral: s.collateral,
    maxRepayable: s.maxRepayable,
    btcBalance: s.btcBalance,
    collateralSurplus: s.collateralSurplus,
    previewAmount: s.previewAmount,
    previewStatus: repaymentStatus(s.previewStatus),
    guard: { triggerRatio: BigInt(s.guard.triggerRatio), targetRatio: BigInt(s.guard.targetRatio) },
    collateralBuffer: s.collateralBuffer,
    price: s.price,
    ratio: s.ratio,
    guardRepay: s.guardRepay,
    guardTopUp: s.guardTopUp,
    guardStatus: guardStatus(s.guardStatus),
    totalProtectRepaid: s.totalProtectRepaid,
    totalProtectTopUp: s.totalProtectTopUp,
    autoClose: s.autoClose ?? false,
    closeRequired: s.closeRequired ?? 0n,
    closeStatus: closeStatus(Number(s.closeStatus ?? 1)),
    version,
    blockNumber,
  };
}

function readV3(client: PublicClient, address: Address, blockNumber: bigint) {
  return client.readContract({ address, abi: repayAccountAbi, functionName: "snapshot", blockNumber });
}

export interface ProtocolParams {
  price: bigint;
  minNetDebt: bigint;
  gasCompensation: bigint;
  mcr: bigint;
  ccr: bigint;
  interestRateBps: number;
  recoveryMode: boolean;
  borrowingFeeOn1000: bigint;
}

export async function readProtocolParams(client: PublicClient, p: ProtocolAddresses): Promise<ProtocolParams> {
  const [price, minNetDebt, gasCompensation, mcr, ccr, interestRate, fee] = await Promise.all([
    client.readContract({ address: p.priceFeed, abi: priceFeedAbi, functionName: "fetchPrice" }),
    client.readContract({ address: p.borrowerOperations, abi: borrowerOperationsAbi, functionName: "minNetDebt" }),
    client.readContract({ address: p.troveManager, abi: troveManagerAbi, functionName: "MUSD_GAS_COMPENSATION" }),
    client.readContract({ address: p.troveManager, abi: troveManagerAbi, functionName: "MCR" }),
    client.readContract({ address: p.troveManager, abi: troveManagerAbi, functionName: "CCR" }),
    client.readContract({ address: p.interestRateManager, abi: interestRateManagerAbi, functionName: "interestRate" }),
    client.readContract({
      address: p.borrowerOperations,
      abi: borrowerOperationsAbi,
      functionName: "getBorrowingFee",
      args: [1000n * 10n ** 18n],
    }),
  ]);
  const recoveryMode = await client.readContract({
    address: p.troveManager,
    abi: troveManagerAbi,
    functionName: "checkRecoveryMode",
    args: [price],
  });
  return {
    price,
    minNetDebt,
    gasCompensation,
    mcr,
    ccr,
    interestRateBps: Number(interestRate),
    recoveryMode,
    borrowingFeeOn1000: fee,
  };
}
