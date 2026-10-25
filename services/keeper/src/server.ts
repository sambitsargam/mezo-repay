import { createServer, type Server } from "node:http";
import type { KeeperState } from "./state";

/** Minimal read-only status endpoint. Exposes no keys and accepts no commands. */
export function startServer(port: number, getState: () => KeeperState, pollSeconds: number): Server {
  const server = createServer((req, res) => {
    const headers = {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    };
    if (req.method !== "GET") {
      res.writeHead(405, headers).end(JSON.stringify({ error: "method not allowed" }));
      return;
    }
    const s = getState();
    if (req.url === "/health") {
      const last = s.lastSuccessfulScanAt ? Date.parse(s.lastSuccessfulScanAt) : 0;
      const healthy = Date.now() - last < pollSeconds * 3 * 1000;
      res.writeHead(healthy ? 200 : 503, headers).end(JSON.stringify({ ok: healthy, lastSuccessfulScanAt: s.lastSuccessfulScanAt }));
      return;
    }
    if (req.url === "/status" || req.url === "/") {
      res.writeHead(200, headers).end(JSON.stringify({ ...s, pollSeconds }));
      return;
    }
    res.writeHead(404, headers).end(JSON.stringify({ error: "not found" }));
  });
  server.listen(port);
  return server;
}
