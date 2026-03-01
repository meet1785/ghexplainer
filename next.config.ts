import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow long-running API routes for large repo analysis
  serverExternalPackages: ["@google/generative-ai"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // Compress responses for faster delivery
  compress: true,
  // Strict mode for catching bugs
  reactStrictMode: true,
  // Production performance: strip console logs
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Cache static assets aggressively
        source: "/icon.svg",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
