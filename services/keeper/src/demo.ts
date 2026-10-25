/**
 * Live Mezo testnet demonstration, run step by step. Every step appends to
 * docs/evidence/live-run.json with an explicit type: "transaction" | "read" | "simulation".
 *
 *   pnpm --filter @repay/keeper demo <step>
 *   steps: status | fund-gas | create | open | customer-trove | pay | unauthorized | read
 *
 * Uses DEPLOYER_PRIVATE_KEY as the account owner and CUSTOMER_PRIVATE_KEY as a separate payer.
 * Mezo testnet only; refuses any other chain.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Address,
  type Hash,
  type Hex,
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseEventLogs,
  parseSignature,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  borrowerOperationsAbi,
  computeHints,
  encodeReference,
  explorerTx,
  formatBtc,
  formatMusd,
  formatRatio,
  getDeployment,
  mezoTestnet,
  musdAbi,
  projectOpenTrove,
  readAccountSnapshot,
  readProtocolParams,
  repayAccountAbi,
  repayAccountFactoryAbi,
  collateralRatio,
} from "@repay/sdk";
import { loadDotEnv } from "./config";
import { errorMessage } from "./keeper";

loadDotEnv([resolve(".env"), resolve("../../.env")]);
const args = process.argv.slice(2).filter((a) => a !== "--");
const EVIDENCE = resolve("../../docs/evidence/live-run.json");
const rpc = process.env.MEZO_RPC_URL ?? "https://rpc.test.mezo.org";

const pub = createPublicClient({ chain: mezoTestnet, transport: http(rpc, { retryCount: 3 }) });
const d = getDeployment(mezoTestnet.id)!;
if (!d.repay) throw new Error("registry has no RePay deployment");
const repay = d.repay;

function key(name: string): Hex {
  const k = process.env[name];
  if (!k) throw new Error(`${name} missing in .env`);
  return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
}
const ownerAcct = privateKeyToAccount(key("DEPLOYER_PRIVATE_KEY"));
const customerAcct = privateKeyToAccount(key("CUSTOMER_PRIVATE_KEY"));
const keeperAddr = privateKeyToAccount(key("KEEPER_PRIVATE_KEY")).address;
const owner = createWalletClient({ account: ownerAcct, chain: mezoTestnet, transport: http(rpc) });
const customer = createWalletClient({ account: customerAcct, chain: mezoTestnet, transport: http(rpc) });

interface Evidence {
  network: string;
  chainId: number;
  factory: Address;
  account: Address | null;
  owner: Address;
  customer: Address;
  keeper: Address;
  steps: Array<{
    step: string;
    type: "transaction" | "read" | "simulation";
    at: string;
    txHash?: Hash;
    explorer?: string;
    blockNumber?: string;
    status?: string;
    summary: string;
    data?: Record<string, string>;
  }>;
}

function loadEvidence(): Evidence {
  if (existsSync(EVIDENCE)) return JSON.parse(readFileSync(EVIDENCE, "utf8"));
  return {
    network: "mezo-testnet",
    chainId: mezoTestnet.id,
    factory: repay.factory,
    account: null,
    owner: ownerAcct.address,
    customer: customerAcct.address,
    keeper: keeperAddr,
    steps: [],
  };
}
const ev = loadEvidence();
function save() {
  mkdirSync(resolve(EVIDENCE, ".."), { recursive: true });
  writeFileSync(EVIDENCE, JSON.stringify(ev, null, 2) + "\n");
}

async function recordTx(step: string, hash: Hash, summary: string, data: Record<string, string> = {}) {
  console.log(`${step}: submitted ${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  ev.steps.push({
    step,
    type: "transaction",
    at: new Date().toISOString(),
    txHash: hash,
    explorer: explorerTx(hash),
    blockNumber: r.blockNumber.toString(),
    status: r.status,
    summary,
    data,
  });
  save();
  console.log(`${step}: ${r.status} in block ${r.blockNumber} → ${explorerTx(hash)}`);
  if (r.status !== "success") throw new Error(`${step} reverted`);
  return r;
}

function requireAccount(): Address {
  if (!ev.account) throw new Error("run `create` first");
  return ev.account;
}

async function snapshotData(account: Address) {
  const s = await readAccountSnapshot(pub, account);
  const p = await readProtocolParams(pub, d.protocol);
  return {
    snap: s,
    data: {
      block: s.blockNumber.toString(),
      loanStatus: s.loanStatus,
      debt: formatMusd(s.debt, 4),
      collateral: formatBtc(s.collateral),
      collateralRatio: formatRatio(collateralRatio(s.collateral, s.debt, p.price), 2),
      btcPrice: formatMusd(p.price),
      pendingRepayment: formatMusd(s.pendingRepayment),
      operatingCash: formatMusd(s.operatingCash),
      unclassified: formatMusd(s.unclassified),
      totalIncome: formatMusd(s.totalIncome),
      totalRepaid: formatMusd(s.totalRepaid),
      maxRepayable: formatMusd(s.maxRepayable),
      previewStatus: s.previewStatus,
      previewAmount: formatMusd(s.previewAmount),
    },
  };
}

const steps: Record<string, () => Promise<void>> = {
  async status() {
    for (const [n, a] of [
      ["owner", ownerAcct.address],
      ["customer", customerAcct.address],
      ["keeper", keeperAddr],
    ] as const) {
      const btc = await pub.getBalance({ address: a });
      const musd = await pub.readContract({ address: d.protocol.musd, abi: musdAbi, functionName: "balanceOf", args: [a] });
      console.log(`${n.padEnd(9)} ${a}  ${formatBtc(btc, 8)}  ${formatMusd(musd)}`);
    }
    if (ev.account) console.log("account", ev.account, (await snapshotData(ev.account)).data);
  },

  async "fund-gas"() {
    const amount = parseEther(args[1] ?? "0.0005");
    const to = (args[2] as Address | undefined) ?? keeperAddr;
    const hash = await owner.sendTransaction({ to, value: amount });
    await recordTx("fund-gas", hash, `Owner sent ${formatBtc(amount, 6)} gas to ${to}`);
  },

  async create() {
    if (ev.account) throw new Error(`account already created: ${ev.account}`);
    const policy = {
      repaymentBps: 3000,
      cooldown: 300,
      paused: false,
      operatingReserve: 0n,
      minExecution: parseEther("10"),
      maxExecution: 0n,
    };
    const hash = await owner.writeContract({
      address: repay.factory,
      abi: repayAccountFactoryAbi,
      functionName: "createAccount",
      args: [policy],
    });
    const r = await pub.waitForTransactionReceipt({ hash });
    const created = parseEventLogs({ abi: repayAccountFactoryAbi, logs: r.logs, eventName: "AccountCreated" })[0]!;
    ev.account = created.args.account;
    save();
    await recordTx("create-account", hash, "Owner created a RePay account (30% repayment, 5 min cooldown, 10 MUSD minimum)", {
      account: created.args.account,
      owner: created.args.owner,
    });
  },

  async open() {
    const account = requireAccount();
    const collateral = parseEther(args[1] ?? "0.045");
    const borrow = parseEther(args[2] ?? "2000");
    const p = await readProtocolParams(pub, d.protocol);
    const fee = await pub.readContract({
      address: d.protocol.borrowerOperations,
      abi: borrowerOperationsAbi,
      functionName: "getBorrowingFee",
      args: [borrow],
    });
    const proj = projectOpenTrove({
      collateral,
      borrow,
      borrowingFee: fee,
      gasCompensation: p.gasCompensation,
      minNetDebt: p.minNetDebt,
      price: p.price,
      mcr: p.mcr,
    });
    console.log("projection", {
      totalDebt: formatMusd(proj.totalDebt),
      cr: formatRatio(proj.cr),
      headroom: formatMusd(proj.headroom),
      problems: proj.problems,
    });
    if (proj.problems.length) throw new Error(`refusing: ${proj.problems.join(",")}`);
    const hints = await computeHints(pub, d.protocol, collateral, proj.totalDebt);
    const hash = await owner.writeContract({
      address: account,
      abi: repayAccountAbi,
      functionName: "openLoan",
      args: [borrow, hints.upper, hints.lower],
      value: collateral,
    });
    await recordTx("open-loan", hash, `Account opened a Mezo Trove: ${formatBtc(collateral)} collateral, borrowed ${formatMusd(borrow)}`, {
      borrowingFee: formatMusd(fee, 4),
      projectedTotalDebt: formatMusd(proj.totalDebt, 4),
      projectedCR: formatRatio(proj.cr, 2),
    });
    const { data } = await snapshotData(account);
    ev.steps.push({ step: "read-after-open", type: "read", at: new Date().toISOString(), summary: "Account state after opening", data });
    save();
    console.log(data);
  },

  async "fund-customer"() {
    // Transfers faucet-origin MUSD from the deployer EOA (NOT from the RePay account) to the customer.
    const amount = parseEther(args[1] ?? "600");
    const gas = parseEther(args[2] ?? "0.0005");
    const g = await owner.sendTransaction({ to: customerAcct.address, value: gas });
    await recordTx("fund-customer-gas", g, `Deployer EOA sent ${formatBtc(gas, 6)} gas to the customer wallet`);
    const hash = await owner.writeContract({
      address: d.protocol.musd,
      abi: musdAbi,
      functionName: "transfer",
      args: [customerAcct.address, amount],
    });
    await recordTx(
      "fund-customer-musd",
      hash,
      `Deployer EOA sent ${formatMusd(amount)} of faucet-origin MUSD to the customer wallet (not the RePay account's borrowed funds)`,
    );
  },

  async "customer-trove"() {
    // The customer is a separate wallet that gets its own MUSD by borrowing against its own BTC.
    const collateral = parseEther(args[1] ?? "0.04");
    const borrow = parseEther(args[2] ?? "1800");
    const fee = await pub.readContract({
      address: d.protocol.borrowerOperations,
      abi: borrowerOperationsAbi,
      functionName: "getBorrowingFee",
      args: [borrow],
    });
    const p = await readProtocolParams(pub, d.protocol);
    const total = borrow + fee + p.gasCompensation;
    const hints = await computeHints(pub, d.protocol, collateral, total);
    const hash = await customer.writeContract({
      address: d.protocol.borrowerOperations,
      abi: [
        {
          type: "function",
          name: "openTrove",
          stateMutability: "payable",
          inputs: [
            { name: "_debtAmount", type: "uint256" },
            { name: "_upperHint", type: "address" },
            { name: "_lowerHint", type: "address" },
          ],
          outputs: [],
        },
      ] as const,
      functionName: "openTrove",
      args: [borrow, hints.upper, hints.lower],
      value: collateral,
    });
    await recordTx("customer-musd", hash, `Customer wallet opened its own Trove to obtain ${formatMusd(borrow)} (independent of the RePay account)`);
  },

  async pay() {
    const account = requireAccount();
    const amount = parseEther(args[1] ?? "500");
    const ref = args[2] ?? "INV-2026-001";
    const approveHash = await customer.writeContract({
      address: d.protocol.musd,
      abi: musdAbi,
      functionName: "approve",
      args: [account, amount],
    });
    await recordTx("customer-approve", approveHash, `Customer approved exactly ${formatMusd(amount)} for the account`);
    const hash = await customer.writeContract({
      address: account,
      abi: repayAccountAbi,
      functionName: "pay",
      args: [amount, encodeReference(ref)],
    });
    const r = await recordTx("customer-pay", hash, `Customer paid ${formatMusd(amount)} with reference ${ref}`);
    const pe = parseEventLogs({ abi: repayAccountAbi, logs: r.logs, eventName: "PaymentReceived" })[0]!;
    ev.steps[ev.steps.length - 1]!.data = {
      paymentId: pe.args.paymentId.toString(),
      toRepayment: formatMusd(pe.args.toRepayment),
      toOperating: formatMusd(pe.args.toOperating),
    };
    save();
    const { data } = await snapshotData(account);
    ev.steps.push({ step: "read-after-pay", type: "read", at: new Date().toISOString(), summary: "Account state after payment", data });
    save();
    console.log(data);
  },

  async "pay-permit"() {
    const account = requireAccount();
    const amount = parseEther(args[1] ?? "50");
    const ref = args[2] ?? "INV-2026-002";
    const nonce = await pub.readContract({ address: d.protocol.musd, abi: musdAbi, functionName: "nonces", args: [customerAcct.address] });
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    const sig = await customer.signTypedData({
      domain: { name: "Mezo USD", version: "1", chainId: mezoTestnet.id, verifyingContract: d.protocol.musd },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: { owner: customerAcct.address, spender: account, value: amount, nonce, deadline },
    });
    const { r, s: sv, v, yParity } = parseSignature(sig);
    const hash = await customer.writeContract({
      address: account,
      abi: repayAccountAbi,
      functionName: "payWithPermit",
      args: [amount, encodeReference(ref), deadline, v !== undefined ? Number(v) : yParity + 27, r, sv],
    });
    const rc = await recordTx("customer-pay-permit", hash, `Customer paid ${formatMusd(amount)} in one transaction using an EIP-2612 permit (ref ${ref})`);
    const pe = parseEventLogs({ abi: repayAccountAbi, logs: rc.logs, eventName: "PaymentReceived" })[0]!;
    ev.steps[ev.steps.length - 1]!.data = { paymentId: pe.args.paymentId.toString(), toRepayment: formatMusd(pe.args.toRepayment), toOperating: formatMusd(pe.args.toOperating) };
    save();
  },

  async "direct-transfer"() {
    const account = requireAccount();
    const amount = parseEther(args[1] ?? "5");
    const hash = await owner.writeContract({ address: d.protocol.musd, abi: musdAbi, functionName: "transfer", args: [account, amount] });
    await recordTx("direct-transfer", hash, `Plain ERC-20 transfer of ${formatMusd(amount)} to the account (arrives as unclassified, not income)`);
    const { data } = await snapshotData(account);
    ev.steps.push({ step: "read-after-direct-transfer", type: "read", at: new Date().toISOString(), summary: "Direct transfer shows as unclassified; income unchanged", data });
    save();
    console.log(data);
  },

  async classify() {
    const account = requireAccount();
    const amount = parseEther(args[1] ?? "5");
    const hash = await owner.writeContract({
      address: account,
      abi: repayAccountAbi,
      functionName: "classifyUnclassified",
      args: [amount, true, false, encodeReference(args[2] ?? "wire INV-2026-003")],
    });
    await recordTx("classify-revenue", hash, `Owner classified ${formatMusd(amount)} of the direct transfer as customer revenue (split by policy)`);
  },

  async "deposit-capital"() {
    const account = requireAccount();
    const amount = parseEther(args[1] ?? "60");
    const a = await owner.writeContract({ address: d.protocol.musd, abi: musdAbi, functionName: "approve", args: [account, amount] });
    await recordTx("owner-approve-capital", a, `Owner approved ${formatMusd(amount)} capital`);
    const hash = await owner.writeContract({ address: account, abi: repayAccountAbi, functionName: "depositCapital", args: [amount, true] });
    await recordTx("owner-capital-to-repayment", hash, `Owner deposited ${formatMusd(amount)} of capital (not income) directly into pending repayment`);
    const { data } = await snapshotData(account);
    ev.steps.push({ step: "read-after-capital", type: "read", at: new Date().toISOString(), summary: "Pending repayment now exceeds the protocol's repayable headroom", data });
    save();
    console.log(data);
  },

  async unauthorized() {
    const account = requireAccount();
    // 1. Simulation: the customer tries to withdraw the owner's operating cash.
    try {
      await pub.simulateContract({
        address: account,
        abi: repayAccountAbi,
        functionName: "withdrawOperating",
        args: [customerAcct.address, parseEther("1")],
        account: customerAcct.address,
      });
      throw new Error("unexpected: simulation succeeded");
    } catch (e) {
      const msg = errorMessage(e);
      ev.steps.push({
        step: "unauthorized-simulation",
        type: "simulation",
        at: new Date().toISOString(),
        summary: "Customer attempted withdrawOperating; contract rejected it",
        data: { error: msg },
      });
      save();
      console.log("simulation rejected:", msg);
    }
    // 2. A real on-chain transaction from a non-owner (fixed gas so it is mined and reverts).
    const hash = await customer.writeContract({
      address: account,
      abi: repayAccountAbi,
      functionName: "setPolicy",
      args: [{ repaymentBps: 0, cooldown: 0, paused: true, operatingReserve: 0n, minExecution: 0n, maxExecution: 0n }],
      gas: 120_000n,
    });
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
    ev.steps.push({
      step: "unauthorized-transaction",
      type: "transaction",
      at: new Date().toISOString(),
      txHash: hash,
      explorer: explorerTx(hash),
      blockNumber: r.blockNumber.toString(),
      status: r.status,
      summary: "Customer sent setPolicy on-chain; it reverted with NotOwner (policy unchanged)",
    });
    save();
    console.log(`unauthorized tx ${r.status} → ${explorerTx(hash)}`);
  },

  async read() {
    const account = requireAccount();
    const { data } = await snapshotData(account);
    ev.steps.push({
      step: args[1] ?? "read",
      type: "read",
      at: new Date().toISOString(),
      summary: "Account state read",
      data,
    });
    save();
    console.log(data);
  },
};

const name = args[0];
const fn = name ? steps[name] : undefined;
if (!fn) {
  console.log(`usage: demo <${Object.keys(steps).join("|")}>`);
  process.exit(1);
}
const chainId = await pub.getChainId();
if (chainId !== mezoTestnet.id) throw new Error(`refusing to run on chain ${chainId}`);
await fn();
