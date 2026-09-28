import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Baskets used to live at /app/stack/:id. Keep old shared links working.
  async redirects() {
    return [{ source: "/app/stack/:id", destination: "/app/basket/:id", permanent: true }];
  },
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
