"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";
import { useActiveWallet } from "./wallet";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** fetch wrapper that attaches the Privy access token and the acting wallet. */
export function useApi() {
  const { getAccessToken, authenticated } = usePrivy();
  const wallet = useActiveWallet();
  return useCallback(
    async <T,>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      if (authenticated) {
        const token = await getAccessToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        if (wallet) headers.set("x-wallet-address", wallet.address);
      }
      let body = init.body;
      if (init.json !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(init.json);
      }
      const res = await fetch(path, { ...init, headers, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, (data as { message?: string }).message ?? `Request failed (${res.status})`, (data as { error?: string }).error);
      return data as T;
    },
    [getAccessToken, authenticated, wallet],
  );
}
