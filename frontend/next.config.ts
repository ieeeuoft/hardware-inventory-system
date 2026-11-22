import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = (
      process.env.BACKEND_URL || "http://127.0.0.1:3001"
    ).replace(/\/$/, "");
    return [
      {
        source: "/api/categories",
        destination: `${backendUrl}/api/categories`,
      },
      {
        source: "/api/items/:path*",
        destination: `${backendUrl}/api/items/:path*`,
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
