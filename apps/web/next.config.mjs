import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo: trace server dependencies from the workspace root (pnpm hoists into ../../node_modules).
  experimental: { outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)) },
  transpilePackages: ["@repay/sdk"],
  webpack: (config) => {
    // Optional peer deps of wallet connectors that are not used in the browser build.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default nextConfig;
