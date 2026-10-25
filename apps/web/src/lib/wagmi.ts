import { http, createConfig, fallback } from "wagmi";
import { injected } from "wagmi/connectors";
import { mezoTestnet } from "@repay/sdk";

const rpc = process.env.NEXT_PUBLIC_MEZO_RPC_URL || mezoTestnet.rpcUrls.default.http[0];

export const wagmiConfig = createConfig({
  chains: [mezoTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [mezoTestnet.id]: fallback([http(rpc, { retryCount: 2, timeout: 15_000 })]) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
