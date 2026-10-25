import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getDeployment, mezoTestnet } from "@repay/sdk";
import { loadDotEnv, readConfig } from "./config";
import { Keeper } from "./keeper";
import { initLog, log } from "./log";
import { loadState } from "./state";
import { startServer } from "./server";

loadDotEnv([resolve(".env"), resolve("../../.env")]);
const cfg = readConfig(process.argv.slice(2));
initLog(cfg.stateDir);

const pub = createPublicClient({ chain: mezoTestnet, transport: http(cfg.rpcUrl, { retryCount: 3, timeout: 20_000 }) });
const chainId = await pub.getChainId();
if (!cfg.allowedChainIds.includes(chainId)) {
  log("error", "network not allowlisted; refusing to run", { chainId });
  process.exit(1);
}
const deployment = getDeployment(chainId);
if (!deployment?.repay) {
  log("error", "no RePay deployment in registry for this chain", { chainId });
  process.exit(1);
}

const account = cfg.privateKey ? privateKeyToAccount(cfg.privateKey) : null;
const wallet = account ? createWalletClient({ account, chain: mezoTestnet, transport: http(cfg.rpcUrl) }) : null;

const state = loadState(cfg.stateDir, () => ({
  chainId,
  factory: deployment.repay!.factory,
  lastScannedBlock: String(deployment.repay!.deploymentBlock - 1),
  accounts: [],
  lastScanAt: null,
  lastSuccessfulScanAt: null,
  lastExecution: null,
  mode: cfg.mode,
  keeperAddress: account?.address ?? null,
  statuses: {},
  lastError: null,
  startedAt: new Date().toISOString(),
}));

const keeper = new Keeper(pub, wallet, deployment, state, cfg.stateDir, cfg.mode, cfg.account);
log("info", "keeper starting", {
  chainId,
  mode: cfg.mode,
  keeper: account?.address ?? "(none: read-only)",
  factory: deployment.repay.factory,
  only: cfg.account,
});
if (account) {
  const bal = await pub.getBalance({ address: account.address });
  if (bal === 0n) log("warn", "keeper wallet has no BTC for gas", { keeper: account.address });
}

if (cfg.once) {
  await keeper.scan();
  process.exit(state.lastError ? 1 : 0);
}

const server = startServer(cfg.port, () => keeper.state, cfg.pollSeconds);
log("info", "status endpoint listening", { url: `http://localhost:${cfg.port}/status` });

let timer: NodeJS.Timeout | null = null;
let running: Promise<void> | null = null;
const tick = async () => {
  running = keeper.scan();
  await running;
  running = null;
  timer = setTimeout(tick, cfg.pollSeconds * 1000);
};
void tick();

const shutdown = async (sig: string) => {
  log("info", "shutting down", { signal: sig });
  keeper.stop();
  if (timer) clearTimeout(timer);
  if (running) await running; // let an in-flight scan finish so no receipt is orphaned
  server.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
