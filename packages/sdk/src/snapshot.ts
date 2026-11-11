import type { Address, PublicClient } from "viem";
import { repayAccountAbi } from "./abi/RePayAccount";
import { borrowerOperationsAbi, interestRateManagerAbi, priceFeedAbi, troveManagerAbi } from "./abi/mezo";
import { guardStatus, repaymentStatus, troveStatus, type GuardStatus, type RepaymentStatus, type TroveStatus } from "./accounting";
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
  blockNumber: bigint;
}

export async function readAccountSnapshot(client: PublicClient, address: Address): Promise<AccountSnapshot> {
  const blockNumber = await client.getBlockNumber();
  const s = await client.readContract({ address, abi: repayAccountAbi, functionName: "snapshot", blockNumber });
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
    blockNumber,
  };
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
