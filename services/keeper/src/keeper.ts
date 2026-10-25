import {
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  type Account,
  BaseError,
  ContractFunctionRevertedError,
  parseEventLogs,
} from "viem";
import {
  type AccountSnapshot,
  type NetworkDeployment,
  computeHints,
  readAccountSnapshot,
  repayAccountAbi,
  repayAccountFactoryAbi,
  withRetry,
  REPAYMENT_STATUS_COPY,
} from "@repay/sdk";
import { log } from "./log";
import { type KeeperState, saveState } from "./state";

export const DISCOVERY_CHUNK = 10_000n;
export const RECEIPT_TIMEOUT_MS = 120_000;

export type Decision =
  | { action: "execute"; amount: bigint }
  | { action: "skip"; reason: string };

/** Pure decision from on-chain state. The contract re-checks everything; this only avoids wasted gas. */
export function decide(s: AccountSnapshot): Decision {
  if (s.previewStatus !== "Ready" || s.previewAmount === 0n) {
    return { action: "skip", reason: s.previewStatus };
  }
  return { action: "execute", amount: s.previewAmount };
}

export class Keeper {
  private inFlight = new Set<Address>();
  private stopping = false;

  constructor(
    private readonly pub: PublicClient,
    private readonly wallet: (WalletClient & { account: Account }) | null,
    private readonly deployment: NetworkDeployment,
    readonly state: KeeperState,
    private readonly stateDir: string,
    private readonly mode: "live" | "dry-run",
    private readonly only: Address | null,
  ) {}

  stop() {
    this.stopping = true;
  }

  /** Discover accounts from factory AccountCreated events in bounded ranges, checkpointed. */
  async discover(): Promise<void> {
    const repay = this.deployment.repay;
    if (!repay) throw new Error("RePay is not deployed on this network (registry repay=null)");
    const head = await withRetry(() => this.pub.getBlockNumber());
    let from = BigInt(this.state.lastScannedBlock) + 1n;
    if (from < BigInt(repay.deploymentBlock)) from = BigInt(repay.deploymentBlock);
    while (from <= head && !this.stopping) {
      const to = from + DISCOVERY_CHUNK - 1n > head ? head : from + DISCOVERY_CHUNK - 1n;
      const logs = await withRetry(() =>
        this.pub.getLogs({ address: repay.factory, fromBlock: from, toBlock: to }),
      );
      for (const ev of parseEventLogs({ abi: repayAccountFactoryAbi, logs, eventName: "AccountCreated" })) {
        if (!this.state.accounts.includes(ev.args.account)) {
          this.state.accounts.push(ev.args.account);
          log("info", "account discovered", { account: ev.args.account, owner: ev.args.owner });
        }
      }
      this.state.lastScannedBlock = to.toString();
      saveState(this.stateDir, this.state);
      from = to + 1n;
    }
  }

  async scan(): Promise<void> {
    this.state.lastScanAt = new Date().toISOString();
    try {
      await this.discover();
      const targets = this.only ? [this.only] : this.state.accounts;
      for (const account of targets) {
        if (this.stopping) break;
        await this.processAccount(account);
      }
      this.state.lastSuccessfulScanAt = new Date().toISOString();
      this.state.lastError = null;
    } catch (e) {
      this.state.lastError = errorMessage(e);
      log("error", "scan failed", { error: this.state.lastError });
    } finally {
      saveState(this.stateDir, this.state);
    }
  }

  async processAccount(account: Address): Promise<void> {
    if (this.inFlight.has(account)) return; // never two sends for one account from this process
    this.inFlight.add(account);
    try {
      const snap = await withRetry(() => readAccountSnapshot(this.pub, account));
      const decision = decide(snap);
      const status = {
        account,
        owner: snap.owner,
        previewStatus: snap.previewStatus,
        previewAmount: snap.previewAmount.toString(),
        pendingRepayment: snap.pendingRepayment.toString(),
        debt: snap.debt.toString(),
        checkedAt: new Date().toISOString(),
        lastAction: this.state.statuses[account]?.lastAction,
      };
      this.state.statuses[account] = status;
      if (decision.action === "skip") {
        log("info", "waiting", { account, reason: decision.reason, why: REPAYMENT_STATUS_COPY[snap.previewStatus].title });
        return;
      }
      await this.execute(account, snap, decision.amount);
    } finally {
      this.inFlight.delete(account);
    }
  }

  private async execute(account: Address, snap: AccountSnapshot, amount: bigint): Promise<void> {
    const status = this.state.statuses[account]!;
    // Hints for the post-repayment position. Stale hints only cost gas.
    const hints = await computeHints(this.pub, this.deployment.protocol, snap.collateral, snap.debt - amount).catch(
      () => ({ upper: "0x0000000000000000000000000000000000000000" as Address, lower: "0x0000000000000000000000000000000000000000" as Address }),
    );
    const caller = this.wallet?.account.address ?? snap.owner;
    let request;
    try {
      const sim = await this.pub.simulateContract({
        address: account,
        abi: repayAccountAbi,
        functionName: "executeRepayment",
        args: [hints.upper, hints.lower],
        account: caller,
      });
      request = sim.request;
      log("info", "simulation ok", { account, amount, simulatedReturn: sim.result });
    } catch (e) {
      status.lastAction = { kind: "failed", at: new Date().toISOString(), error: errorMessage(e) };
      log("warn", "simulation reverted; not sending", { account, error: errorMessage(e) });
      return;
    }
    if (this.mode === "dry-run" || !this.wallet) {
      status.lastAction = { kind: "simulated", at: new Date().toISOString(), amount: amount.toString() };
      log("info", "dry-run: would execute", { account, amount });
      return;
    }
    const hash: Hash = await this.wallet.writeContract({ ...request, account: this.wallet.account, chain: this.wallet.chain });
    log("info", "submitted", { account, amount, txHash: hash });
    status.lastAction = { kind: "executed", at: new Date().toISOString(), txHash: hash, amount: amount.toString() };
    saveState(this.stateDir, this.state);
    // A null receipt is not a failure; wait with a bounded timeout and never resubmit automatically.
    try {
      const receipt = await this.pub.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS, retryCount: 10 });
      if (receipt.status !== "success") {
        status.lastAction = { kind: "failed", at: new Date().toISOString(), txHash: hash, error: "reverted on-chain" };
        log("error", "execution reverted on-chain", { account, txHash: hash });
        return;
      }
      const ev = parseEventLogs({ abi: repayAccountAbi, logs: receipt.logs, eventName: "RepaymentExecuted" })[0];
      const repaid = ev?.args.amount ?? amount;
      this.state.lastExecution = {
        account,
        txHash: hash,
        amount: repaid.toString(),
        at: new Date().toISOString(),
        blockNumber: receipt.blockNumber.toString(),
      };
      status.lastAction = { kind: "executed", at: new Date().toISOString(), txHash: hash, amount: repaid.toString() };
      log("info", "repayment confirmed", {
        account,
        txHash: hash,
        amount: repaid,
        debtBefore: ev?.args.debtBefore,
        debtAfter: ev?.args.debtAfter,
      });
    } catch (e) {
      log("warn", "receipt not yet available; will re-read state next scan (no resubmission)", {
        account,
        txHash: hash,
        error: errorMessage(e),
      });
    }
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      const args = revert.data?.args?.map((a) => String(a)).join(",");
      return name ? `${name}(${args ?? ""})` : revert.shortMessage;
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}
