"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./api";

export type GasStarterStatus =
  | { available: false }
  | { available: true; eligible: true; amountBnb: string }
  | { available: true; eligible: false; reason: "claimed" | "has_gas" | "no_usdt" | "busy"; amountBnb: string };

/**
 * The one-time gas starter (src/server/gasStarter.ts): whether this wallet can have it, and a
 * claim that asks the server to send it. The server re-checks everything from chain on claim.
 */
export function useGasStarter(enabled = true) {
  const api = useApi();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["gas-starter"],
    queryFn: () => api<GasStarterStatus>("/api/gas"),
    enabled,
    staleTime: 15_000,
  });
  const claim = useMutation({
    mutationFn: () => api<{ txHash: string; amountBnb: string }>("/api/gas", { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["gas-starter"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });
  const s = status.data;
  return { status: s, eligible: !!s && s.available && s.eligible, claim, refetch: status.refetch };
}
