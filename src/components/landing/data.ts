"use client";

import { useQuery } from "@tanstack/react-query";

export type LandingStock = {
  ticker: string;
  name: string;
  logo: string | null;
  price: number | null;
  change: number | null;
};

type Row = {
  ticker: string;
  name: string;
  logo_url: string | null;
  price: { price_usd: number | null; change_24h: number | null } | null;
};

/**
 * The real tradable list, one row per stock, from the public assets route. The page never
 * invents a price: while this loads or if it fails, cards show tickers and names only.
 */
export function useLandingStocks() {
  const q = useQuery({
    queryKey: ["landing-stocks"],
    queryFn: async () => {
      const res = await fetch("/api/assets?group=ticker&tradable=1&limit=12");
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { items: Row[] };
      return body.items.map(
        (a): LandingStock => ({
          ticker: a.ticker,
          name: a.name,
          logo: a.logo_url,
          price: a.price?.price_usd ?? null,
          change: a.price?.change_24h ?? null,
        }),
      );
    },
    staleTime: 60_000,
    retry: 1,
  });
  const list = q.data ?? [];
  const pick = (ticker: string, i: number): LandingStock =>
    list.find((s) => s.ticker === ticker) ?? list[i] ?? { ticker, name: FALLBACK_NAMES[ticker] ?? ticker, logo: null, price: null, change: null };
  return { list, pick, loaded: q.isSuccess };
}

const FALLBACK_NAMES: Record<string, string> = {
  NVDA: "Nvidia",
  TSLA: "Tesla",
  AAPL: "Apple",
  SPY: "S&P 500 ETF",
  META: "Meta",
  MSFT: "Microsoft",
};
