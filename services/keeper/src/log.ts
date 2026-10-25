import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

let logFile: string | null = null;

export function initLog(stateDir: string) {
  mkdirSync(stateDir, { recursive: true });
  logFile = join(stateDir, "keeper.log.jsonl");
}

const SECRET = /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g;

/** JSON-lines log. Redacts anything shaped like a 32-byte private key that is not a known hash field. */
export function log(level: "info" | "warn" | "error", msg: string, data: Record<string, unknown> = {}) {
  const entry = { t: new Date().toISOString(), level, msg, ...data };
  const line = JSON.stringify(entry, (k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "string" && !/hash|Hash|tx/.test(k)) return v.replace(SECRET, "0x[redacted]");
    return v;
  });
  (level === "error" ? console.error : console.log)(line);
  if (logFile) appendFileSync(logFile, line + "\n");
}
