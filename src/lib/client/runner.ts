"use client";

import { erc20Abi, getAddress, type Address } from "viem";
import { APP_NAME } from "@/lib/constants";
import { VAULT_ADDRESS } from "@/lib/contracts/vault";
import { publicEnv } from "@/lib/env";
import { createRunner, type Backend, type NeededApproval, type OrderStatus, type Progress, type QuoteResponse, type Signer } from "@/lib/runner";
import type { Intent } from "./types";
import { browserPublicClient } from "./wallet";

export { StopError, type Progress, type StepKey, type StepState } from "@/lib/runner";

export type Api = <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;

export function vaultAddr(): Address {
  const v = VAULT_ADDRESS ?? publicEnv().NEXT_PUBLIC_VAULT_ADDRESS;
  if (!v) throw new Error(`The ${APP_NAME} vault isn't deployed yet.`);
  return getAddress(v);
}

// The browser's side of the shared runner (src/lib/runner.ts): chain reads through the public RPC,
// and every step checked by our API.
const runner = createRunner({
  vault: vaultAddr,
  chain: {
    waitReceipt: (hash) => browserPublicClient().waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 400 }),
    pendingNonce: (address) => browserPublicClient().getTransactionCount({ address, blockTag: "pending" }),
    allowance: (token, owner, spender) => browserPublicClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] }),
    gasPrice: () => browserPublicClient().getGasPrice(),
  },
});

/** Rough gas budget for a flow, used for the "You need about X BNB" check. */
export const gasNeededWei = runner.gasNeededWei;

/**
 * Drives an intent to completion from whatever state the server has. Every step is verified by
 * the server before it's saved; the client never marks anything confirmed itself.
 */
export async function runIntent(opts: { api: Api; signer: Signer; intentId: string; onProgress: (p: Progress) => void; onIntent: (i: Intent) => void }): Promise<Intent> {
  const { api, intentId, onIntent } = opts;
  const seen = (i: Intent) => {
    onIntent(i);
    return i;
  };
  const backend: Backend = {
    load: async () => seen(await api<Intent>(`/api/intents/${intentId}`)),
    advance: async (json) => seen(await api<Intent>(`/api/intents/${intentId}`, { method: "PATCH", json })),
    quote: (legIndex) => api<QuoteResponse>("/api/quote", { method: "POST", json: { intentId, legIndex } }),
    submitOrder: (legIndex, signature) => api("/api/orders", { method: "POST", json: { intentId, legIndex, signature } }),
    orderStatus: async (orderId) => (await api<{ status: OrderStatus }>(`/api/orders/${orderId}`)).status,
    approvals: async () => (await api<{ items: NeededApproval[] }>(`/api/intents/${intentId}/approvals`)).items,
  };
  return runner.runIntent({ backend, signer: opts.signer, onProgress: opts.onProgress });
}
