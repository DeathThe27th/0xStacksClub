"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress } from "viem";
import { PROVIDER_LABEL, type Provider } from "@/lib/constants";
import { useApi } from "./api";
import type { AssetItem } from "./types";

/** Every catalog asset by address, for labels like "Buy NVDA (bStocks)". */
export function useAssetLookup() {
  const api = useApi();
  const q = useQuery({
    queryKey: ["asset-lookup"],
    queryFn: () => api<{ items: AssetItem[] }>("/api/assets?tab=stocks&filter=trending&limit=500"),
    staleTime: 5 * 60_000,
  });
  const map = new Map((q.data?.items ?? []).map((a) => [getAddress(a.address), a]));
  return {
    get: (addr: string) => map.get(getAddress(addr)),
    label: (addr: string) => {
      const a = map.get(getAddress(addr));
      return a ? `${a.ticker} (${PROVIDER_LABEL[a.provider as Provider]})` : `${addr.slice(0, 6)}…`;
    },
  };
}
