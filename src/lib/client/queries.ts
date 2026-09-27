"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./api";
import type { AssetItem, Intent, MeResponse, Portfolio, StackSummary } from "./types";

export function useMe() {
  const api = useApi();
  const { authenticated, ready } = usePrivy();
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/profile"),
    enabled: ready && authenticated,
    staleTime: 30_000,
    // A brand-new user's embedded wallet can take a moment to exist; the server answers 409 until then.
    retry: (n, e) => n < 6 && (e as { status?: number }).status !== 401,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
  });
}

export function usePortfolio(opts: { poll?: number } = {}) {
  const api = useApi();
  const { authenticated } = usePrivy();
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api<Portfolio>("/api/portfolio"),
    enabled: authenticated,
    refetchInterval: opts.poll,
  });
}

export function useAssets(tab: "stocks" | "watchlist", filter: string, sort?: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["assets", tab, filter, sort],
    queryFn: () => api<{ items: AssetItem[] }>(`/api/assets?tab=${tab}&filter=${filter}&group=ticker&tradable=1${sort ? `&sort=${sort}` : ""}`),
    refetchInterval: 15_000,
  });
}

export function useStacks(filter: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["stacks", filter],
    queryFn: () => api<{ items: StackSummary[] }>(`/api/stacks?filter=${filter}`),
    refetchInterval: 30_000,
  });
}

export function useActiveIntents() {
  const api = useApi();
  const me = useMe();
  return useQuery({
    queryKey: ["intents", "active"],
    queryFn: () => api<{ items: Intent[] }>("/api/intents"),
    enabled: !!me.data?.profile,
  });
}

export function useWatchlist() {
  const api = useApi();
  const me = useMe();
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api<{ items: { target_type: string; target_id: string }[] }>("/api/watchlist"),
    enabled: !!me.data?.profile,
  });
}

/** USDT decimals read from the token (FLOWS: never hardcode). */
export function useUsdtDecimals() {
  return useQuery({
    queryKey: ["usdt-decimals"],
    queryFn: async () => {
      const { browserPublicClient } = await import("./wallet");
      const { erc20Abi } = await import("viem");
      const { USDT_ADDRESS } = await import("@/lib/constants");
      return browserPublicClient().readContract({ address: USDT_ADDRESS, abi: erc20Abi, functionName: "decimals" });
    },
    staleTime: Infinity,
  });
}


/** Star toggle for the watchlist, optimistic. */
export function useWatch(targetType: "asset" | "stack", targetId: string) {
  const api = useApi();
  const qc = useQueryClient();
  const list = useWatchlist();
  const watched = !!list.data?.items.some((w) => w.target_type === targetType && w.target_id.toLowerCase() === targetId.toLowerCase());
  const m = useMutation({
    mutationFn: () => api("/api/watchlist", { method: watched ? "DELETE" : "POST", json: { targetType, targetId } }),
    onMutate: () => {
      qc.setQueryData<{ items: { target_type: string; target_id: string }[] }>(["watchlist"], (d) =>
        watched
          ? { items: (d?.items ?? []).filter((w) => !(w.target_type === targetType && w.target_id.toLowerCase() === targetId.toLowerCase())) }
          : { items: [...(d?.items ?? []), { target_type: targetType, target_id: targetId }] },
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["assets", "watchlist"] });
    },
  });
  return { watched, toggle: () => m.mutate() };
}
