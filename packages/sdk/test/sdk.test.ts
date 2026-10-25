import { describe, expect, it } from "vitest";
import {
  allocate,
  maxRepayable,
  closeAmount,
  collateralRatio,
  projectOpenTrove,
  formatUnits18,
  formatMusd,
  formatRatio,
  formatBps,
  parseUnits18,
  percentToBps,
  encodeReference,
  decodeReference,
  buildPaymentPath,
  parsePaymentRequest,
  repaymentStatus,
  REPAYMENT_STATUS_COPY,
  activityToCsv,
  getDeployment,
  type ActivityItem,
} from "../src";

const E18 = 10n ** 18n;

describe("allocation", () => {
  it("matches the 500 MUSD / 30% example", () => {
    expect(allocate(500n * E18, 3000)).toEqual({ toRepayment: 150n * E18, toOperating: 350n * E18 });
  });
  it("floors and conserves every unit", () => {
    for (const [amt, bps] of [
      [1n, 3333],
      [7n, 1],
      [999_999n, 9999],
      [10n ** 24n + 7n, 2500],
    ] as const) {
      const a = allocate(amt, bps);
      expect(a.toRepayment).toBe((amt * BigInt(bps)) / 10_000n);
      expect(a.toRepayment + a.toOperating).toBe(amt);
    }
  });
  it("rejects invalid bps", () => {
    expect(() => allocate(1n, 10_001)).toThrow();
    expect(() => allocate(1n, -1)).toThrow();
  });
});

describe("protocol math", () => {
  const gas = 200n * E18;
  const min = 1800n * E18;
  it("max repayable respects minimum net debt", () => {
    expect(maxRepayable(26024n * E18 / 10n, gas, min)).toBe(6024n * E18 / 10n);
    expect(maxRepayable(2000n * E18, gas, min)).toBe(0n);
    expect(maxRepayable(1900n * E18, gas, min)).toBe(0n);
  });
  it("close amount excludes gas compensation", () => {
    expect(closeAmount(26024n * E18 / 10n, gas)).toBe(24024n * E18 / 10n);
  });
  it("collateral ratio", () => {
    expect(collateralRatio(E18, 40_000n * E18, 80_000n * E18)).toBe(2n * E18);
    expect(collateralRatio(E18, 0n, 1n)).toBeNull();
  });
  it("projects an open trove like BorrowerOperations", () => {
    const p = projectOpenTrove({
      collateral: 8n * E18 / 100n,
      borrow: 2400n * E18,
      borrowingFee: 24n * E18 / 10n,
      gasCompensation: gas,
      minNetDebt: min,
      price: 80_000n * E18,
      mcr: 11n * E18 / 10n,
    });
    expect(p.netDebt).toBe(24024n * E18 / 10n);
    expect(p.totalDebt).toBe(26024n * E18 / 10n);
    expect(p.problems).toEqual([]);
    expect(formatRatio(p.cr)).toBe("245.9%");
  });
  it("flags below-minimum and below-MCR", () => {
    const p = projectOpenTrove({
      collateral: E18 / 1000n,
      borrow: 1000n * E18,
      borrowingFee: E18,
      gasCompensation: gas,
      minNetDebt: min,
      price: 80_000n * E18,
      mcr: 11n * E18 / 10n,
    });
    expect(p.problems).toContain("belowMinDebt");
    expect(p.problems).toContain("belowMcr");
  });
});

describe("formatting and parsing", () => {
  it("formats with grouping and truncation", () => {
    expect(formatUnits18(1234567n * E18 + 999n * 10n ** 15n)).toBe("1,234,567.99");
    expect(formatMusd(0n)).toBe("0.00 MUSD");
    expect(formatUnits18(-E18)).toBe("-1.00");
    expect(formatBps(3000)).toBe("30%");
    expect(formatBps(1250)).toBe("12.5%");
    expect(formatBps(1205)).toBe("12.05%");
  });
  it("parses decimals without floating point", () => {
    expect(parseUnits18("0.1")).toBe(E18 / 10n);
    expect(parseUnits18("1,000.5")).toBe(10005n * E18 / 10n);
    expect(parseUnits18(".5")).toBe(E18 / 2n);
    expect(parseUnits18("0.000000000000000001")).toBe(1n);
    expect(parseUnits18("0.0000000000000000001")).toBeNull();
    expect(parseUnits18("1e18")).toBeNull();
    expect(parseUnits18("-1")).toBeNull();
    expect(parseUnits18("")).toBeNull();
  });
  it("percent to bps", () => {
    expect(percentToBps("30")).toBe(3000);
    expect(percentToBps("12.5")).toBe(1250);
    expect(percentToBps("100")).toBe(10000);
    expect(percentToBps("100.01")).toBeNull();
    expect(percentToBps("abc")).toBeNull();
  });
});

describe("references and payment links", () => {
  it("round-trips references", () => {
    expect(decodeReference(encodeReference("INV-2026-014"))).toBe("INV-2026-014");
    expect(decodeReference(encodeReference(""))).toBe("");
    expect(() => encodeReference("x".repeat(32))).toThrow();
  });
  it("builds and parses a payment link", () => {
    const path = buildPaymentPath({
      account: "0x1111111111111111111111111111111111111111",
      amount: 500n * E18 + 5n * 10n ** 17n,
      reference: "INV 7",
      chainId: 31611,
    });
    expect(path).toBe("/pay/0x1111111111111111111111111111111111111111?amount=500.5&ref=INV+7&chain=31611");
    const [p, q] = path.split("?");
    const parsed = parsePaymentRequest(p!.replace("/pay/", ""), new URLSearchParams(q));
    expect(parsed.ok && parsed.value.amount).toBe(500n * E18 + 5n * 10n ** 17n);
    expect(parsed.ok && parsed.value.reference).toBe("INV 7");
  });
  it("whole-number amounts have no trailing dot", () => {
    const path = buildPaymentPath({
      account: "0x1111111111111111111111111111111111111111",
      amount: 500n * E18,
      reference: "",
      chainId: 31611,
    });
    expect(path).toContain("amount=500&");
  });
  it("rejects malformed links", () => {
    expect(parsePaymentRequest("0xnope", new URLSearchParams("amount=1")).ok).toBe(false);
    const a = "0x1111111111111111111111111111111111111111";
    expect(parsePaymentRequest(a, new URLSearchParams("amount=0"))).toEqual({ ok: false, error: "badAmount" });
    expect(parsePaymentRequest(a, new URLSearchParams(`amount=1&ref=${"y".repeat(40)}`))).toEqual({
      ok: false,
      error: "badReference",
    });
  });
});

describe("status copy", () => {
  it("covers every status in Solidity order", () => {
    expect(repaymentStatus(0)).toBe("Ready");
    expect(repaymentStatus(6)).toBe("AtMinimumDebt");
    expect(REPAYMENT_STATUS_COPY.AtMinimumDebt.title).toBe("Waiting for enough MUSD to close the loan");
    expect(() => repaymentStatus(8)).toThrow();
  });
});

describe("csv", () => {
  it("escapes and neutralises formulas", () => {
    const item: ActivityItem = {
      kind: "payment",
      eventName: "PaymentReceived",
      txHash: "0xabc",
      blockNumber: 1n,
      logIndex: 0,
      account: "0x1111111111111111111111111111111111111111",
      amount: 5n,
      reference: '=HYPERLINK("x")',
      actor: null,
      detail: {},
      timestamp: 0,
    };
    const csv = activityToCsv([item], (h) => `https://e/tx/${h}`);
    expect(csv.split("\n")[1]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe("registry", () => {
  it("has verified protocol addresses for Mezo testnet", () => {
    const d = getDeployment(31611)!;
    expect(d.protocol.musd).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
    expect(getDeployment(31612)).toBeUndefined();
  });
});
