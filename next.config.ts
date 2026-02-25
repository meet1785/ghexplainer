import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow long-running API routes for large repo analysis
  serverExternalPackages: ["@google/generative-ai"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
