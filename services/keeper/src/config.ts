import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Address, type Hex, getAddress, isAddress } from "viem";
import { SUPPORTED_CHAIN_IDS } from "@repay/sdk";

export interface KeeperConfig {
  rpcUrl: string;
  privateKey: Hex | null;
  mode: "live" | "dry-run";
  pollSeconds: number;
  port: number;
  stateDir: string;
  account: Address | null;
  once: boolean;
  allowedChainIds: readonly number[];
}

/** Minimal .env loader (no dependency). Existing process env wins. */
export function loadDotEnv(paths: string[]): void {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith("#")) continue;
      const [, k, v] = m;
      if (k && process.env[k] === undefined) process.env[k] = v!.replace(/^["']|["']$/g, "");
    }
  }
}

export function readConfig(argv: string[], env = process.env): KeeperConfig {
  const flag = (name: string) => argv.includes(`--${name}`);
  const opt = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const rawKey = env.KEEPER_PRIVATE_KEY?.trim();
  const privateKey = rawKey ? ((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex) : null;
  if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("KEEPER_PRIVATE_KEY is malformed");
  let mode: "live" | "dry-run" = (env.KEEPER_MODE ?? "dry-run") === "live" ? "live" : "dry-run";
  if (flag("dry-run")) mode = "dry-run";
  if (flag("live")) mode = "live";
  if (mode === "live" && !privateKey) throw new Error("live mode requires KEEPER_PRIVATE_KEY");
  const accountRaw = opt("account") ?? env.KEEPER_ACCOUNT;
  if (accountRaw && !isAddress(accountRaw)) throw new Error("KEEPER_ACCOUNT is not an address");
  return {
    rpcUrl: env.MEZO_RPC_URL ?? "https://rpc.test.mezo.org",
    privateKey,
    mode,
    pollSeconds: Math.max(10, Number(env.KEEPER_POLL_SECONDS ?? 60)),
    port: Number(env.KEEPER_PORT ?? 8787),
    stateDir: resolve(env.KEEPER_STATE_DIR ?? "./state"),
    account: accountRaw ? getAddress(accountRaw) : null,
    once: flag("once"),
    allowedChainIds: SUPPORTED_CHAIN_IDS,
  };
}
