"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { bsc } from "viem/chains";
import { Wordmark } from "@/components/brand/Wordmark";
import { ToastProvider } from "@/components/ui/Toast";
import { publicEnv } from "@/lib/env";
import { useTheme } from "@/lib/client/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 } },
      }),
  );
  return (
    <PrivyProvider
      appId={publicEnv().NEXT_PUBLIC_PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "twitter", "wallet"],
        appearance: {
          // Rainbow and Binance have no Privy preset. Rainbow: cream background, plum accent
          // (white-on-pink fails contrast). Binance: its panel colour and the darker yellow.
          theme: resolved === "rainbow" ? "#F9F7F3" : resolved === "binance" ? "#181A20" : resolved,
          accentColor: resolved === "rainbow" ? "#4A1239" : resolved === "binance" ? "#F0B90B" : "#6C47FF",
          logo: <Wordmark size={28} />, walletChainType: "ethereum-only" },
        defaultChain: bsc,
        supportedChains: [bsc],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
