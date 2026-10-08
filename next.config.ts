import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { isServer }) => {
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
