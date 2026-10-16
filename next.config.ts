import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@radix-ui/react-compose-refs": path.resolve(__dirname, "lib/radix-compose-refs-shim.ts"),
    };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        perf_hooks: false,
        "node:perf_hooks": false,
      };
    }
    return config;
  },
};

export default nextConfig;
