import { describe, expect, it } from "vitest";
import type { AccountSnapshot } from "@repay/sdk";
import { decide } from "../src/keeper";
import { readConfig } from "../src/config";

const base: AccountSnapshot = {
  address: "0x1111111111111111111111111111111111111111",
  owner: "0x2222222222222222222222222222222222222222",
  policy: { repaymentBps: 3000, cooldown: 0, paused: false, operatingReserve: 0n, minExecution: 0n, maxExecution: 0n },
  musdBalance: 0n,
  pendingRepayment: 150n,
  operatingCash: 0n,
  unclassified: 0n,
  totalIncome: 0n,
  totalAllocated: 0n,
  totalRepaid: 0n,
  totalBorrowed: 0n,
  totalCapital: 0n,
  totalWithdrawn: 0n,
  totalReleased: 0n,
  paymentCount: 0,
  lastExecutionAt: 0,
  loanStatus: "active",
  debt: 0n,
  collateral: 0n,
  maxRepayable: 0n,
  btcBalance: 0n,
  collateralSurplus: 0n,
  previewAmount: 150n,
  previewStatus: "Ready",
  guard: { triggerRatio: 0n, targetRatio: 0n },
  collateralBuffer: 0n,
  price: 0n,
  ratio: 0n,
  guardRepay: 0n,
  guardTopUp: 0n,
  guardStatus: "Disabled",
  totalProtectRepaid: 0n,
  totalProtectTopUp: 0n,
  blockNumber: 1n,
};

describe("decide", () => {
  it("executes only when the contract preview is Ready", () => {
    expect(decide(base)).toEqual({ action: "execute", amount: 150n });
    for (const s of ["Paused", "Cooldown", "AtMinimumDebt", "ReserveShortfall", "NothingPending"] as const) {
      expect(decide({ ...base, previewStatus: s, previewAmount: 0n })).toEqual({ action: "skip", reason: s });
    }
  });
  it("protects before routine repayment when the guard can act", () => {
    const risky = { ...base, guardStatus: "Protectable" as const, guardRepay: 150n, guardTopUp: 10n };
    expect(decide(risky)).toEqual({ action: "protect", repay: 150n, topUp: 10n });
    expect(decide({ ...risky, previewStatus: "Cooldown", previewAmount: 0n }).action).toBe("protect");
  });
  it("does not protect when the guard is healthy, off, or has nothing to use", () => {
    for (const g of ["Healthy", "Disabled", "NoResources", "PriceUnavailable"] as const) {
      expect(decide({ ...base, guardStatus: g }).action).toBe("execute");
    }
    expect(decide({ ...base, guardStatus: "Protectable", guardRepay: 0n, guardTopUp: 0n }).action).toBe("execute");
  });
  it("never executes a zero amount", () => {
    expect(decide({ ...base, previewAmount: 0n }).action).toBe("skip");
  });
});

describe("config", () => {
  it("defaults to dry-run and refuses live without key", () => {
    expect(readConfig([], {}).mode).toBe("dry-run");
    expect(() => readConfig(["--live"], {})).toThrow(/requires KEEPER_PRIVATE_KEY/);
  });
  it("rejects malformed keys and accounts", () => {
    expect(() => readConfig([], { KEEPER_PRIVATE_KEY: "0x1234" })).toThrow(/malformed/);
    expect(() => readConfig(["--account", "nope"], {})).toThrow(/not an address/);
  });
  it("--dry-run overrides env live", () => {
    const k = "0x" + "11".repeat(32);
    expect(readConfig(["--dry-run"], { KEEPER_MODE: "live", KEEPER_PRIVATE_KEY: k }).mode).toBe("dry-run");
  });
  it("only allows Mezo testnet", () => {
    expect(readConfig([], {}).allowedChainIds).toEqual([31611]);
  });
});
