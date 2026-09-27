import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.mypinata.cloud" },
      { protocol: "https", hostname: "**.binance.com" },
      { protocol: "https", hostname: "**.bnbstatic.com" },
    ],
  },
};

export default nextConfig;
