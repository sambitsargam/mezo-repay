import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, encodeErrorResult } from "viem";
import { repayAccountAbi } from "@repay/sdk";
import { parsePolicyDraft } from "@/components/PolicyForm";
import { describeError } from "@/lib/tx";
import { exampleActivity, exampleSnapshot } from "@/lib/example";

const E = 10n ** 18n;
const draft = { pct: "30", reserve: "", min: "", max: "", cooldown: 0, paused: false };

describe("policy draft validation mirrors the contract", () => {
  it("parses a valid draft into integer units", () => {
    const r = parsePolicyDraft({ ...draft, pct: "12.5", reserve: "1,000.50", min: "10", max: "250", cooldown: 3600 });
    expect(r).toEqual({
      ok: true,
      policy: { repaymentBps: 1250, cooldown: 3600, paused: false, operatingReserve: 100050n * E / 100n, minExecution: 10n * E, maxExecution: 250n * E },
    });
  });
  it("empty limits mean no reserve / any / no cap", () => {
    const r = parsePolicyDraft(draft);
    expect(r.ok && r.policy.maxExecution).toBe(0n);
  });
  it("rejects max below min, >100%, bad numbers, long cooldown", () => {
    expect(parsePolicyDraft({ ...draft, min: "100", max: "50" })).toMatchObject({ ok: false, errors: { max: expect.any(String) } });
    expect(parsePolicyDraft({ ...draft, pct: "100.5" })).toMatchObject({ ok: false, errors: { pct: expect.any(String) } });
    expect(parsePolicyDraft({ ...draft, pct: "0.333" })).toMatchObject({ ok: false });
    expect(parsePolicyDraft({ ...draft, reserve: "1e3" })).toMatchObject({ ok: false, errors: { reserve: expect.any(String) } });
    expect(parsePolicyDraft({ ...draft, cooldown: 31 * 86400 })).toMatchObject({ ok: false, errors: { cooldown: expect.any(String) } });
  });
});

describe("error descriptions", () => {
  it("detects wallet rejection", () => {
    const e = new UserRejectedRequestError(new Error("nope"));
    expect(describeError(e)).toEqual({ rejected: true, message: "You rejected the request in your wallet." });
  });
  it("maps custom contract errors to plain language", () => {
    const data = encodeErrorResult({ abi: repayAccountAbi, errorName: "NotOwner" });
    const err = new ContractFunctionRevertedError({ abi: repayAccountAbi, data, functionName: "setPolicy" });
    const wrapped = new BaseError("call failed", { cause: err });
    expect(describeError(wrapped).message).toBe("Only the account owner can do this.");
  });
  it("maps RPC failures without claiming a send", () => {
    expect(describeError(new BaseError("HTTP request failed. fetch failed")).message).toMatch(/Nothing was sent/);
  });
});

describe("example data is internally consistent", () => {
  it("balances decompose and totals reconcile", () => {
    const s = exampleSnapshot;
    expect(s.pendingRepayment + s.operatingCash + s.unclassified).toBe(s.musdBalance);
    expect(s.totalAllocated - s.totalRepaid).toBe(s.pendingRepayment);
    expect(s.totalBorrowed + (s.totalIncome - s.totalAllocated) - s.totalWithdrawn).toBe(s.operatingCash);
    const payments = exampleActivity.filter((a) => a.kind === "payment").reduce((t, a) => t + (a.amount ?? 0n), 0n);
    expect(payments).toBe(s.totalIncome);
    const repaid = exampleActivity.filter((a) => a.kind === "repayment").reduce((t, a) => t + (a.amount ?? 0n), 0n);
    expect(repaid).toBe(s.totalRepaid);
  });
});
