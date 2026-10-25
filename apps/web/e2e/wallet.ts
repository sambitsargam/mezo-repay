import type { Page } from "@playwright/test";

/**
 * Injects a minimal EIP-1193 wallet. It exposes an address and chain, supports chain switching and
 * account changes, and REJECTS every signature/transaction with code 4001. No private key exists.
 */
export async function injectWallet(page: Page, opts: { address: string; chainId: number }) {
  await page.addInitScript(({ address, chainId }) => {
    type Listener = (...a: unknown[]) => void;
    const listeners: Record<string, Listener[]> = {};
    const state = { address, chainId, connected: false };
    const emit = (ev: string, ...a: unknown[]) => (listeners[ev] ?? []).forEach((l) => l(...a));
    const rpc = async (method: string, params: unknown[]) => {
      const r = await fetch("https://rpc.test.mezo.org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const j = await r.json();
      if (j.error) throw j.error;
      return j.result;
    };
    const provider = {
      isMetaMask: true,
      async request({ method, params = [] }: { method: string; params?: unknown[] }) {
        switch (method) {
          case "eth_requestAccounts":
            state.connected = true;
            return [state.address];
          case "eth_accounts":
            return state.connected ? [state.address] : [];
          case "eth_chainId":
            return "0x" + state.chainId.toString(16);
          case "net_version":
            return String(state.chainId);
          case "wallet_switchEthereumChain": {
            const id = parseInt((params[0] as { chainId: string }).chainId, 16);
            state.chainId = id;
            emit("chainChanged", "0x" + id.toString(16));
            return null;
          }
          case "wallet_requestPermissions":
          case "wallet_getPermissions":
            return [{ parentCapability: "eth_accounts" }];
          case "eth_sendTransaction":
          case "personal_sign":
          case "eth_signTypedData_v4":
          case "eth_sign":
            throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          default:
            return rpc(method, params);
        }
      },
      on(ev: string, l: Listener) {
        (listeners[ev] ??= []).push(l);
      },
      removeListener(ev: string, l: Listener) {
        listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== l);
      },
    };
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
    (window as unknown as { __wallet: unknown }).__wallet = {
      switchAccount(a: string) {
        state.address = a;
        emit("accountsChanged", [a]);
      },
      setChain(id: number) {
        state.chainId = id;
        emit("chainChanged", "0x" + id.toString(16));
      },
    };
  }, opts);
}

export const DEMO_OWNER = "0x3e5EE5Ac7178cC072A937BbC075226ac10a667cB";
export const DEMO_ACCOUNT = "0x76D5a6E6D0D494299A281006Bb5471d50acA388C";
export const STRANGER = "0x000000000000000000000000000000000000dEaD";
