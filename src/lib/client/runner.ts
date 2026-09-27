"use client";

import { encodeFunctionData, erc20Abi, getAddress, type Address, type Hash } from "viem";
import { USDT_ADDRESS } from "@/lib/constants";
import { vaultAbi, VAULT_ADDRESS } from "@/lib/contracts/vault";
import { publicEnv } from "@/lib/env";
import { sellFee } from "@/lib/math";
import { ApiError } from "./api";
import type { Intent, Leg } from "./types";
import { browserPublicClient, type Signer } from "./wallet";

export type Api = <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;

export type StepKey = "fee" | "release" | `leg-${number}` | "approve" | "deposit" | "sellfee";
export type StepState = "idle" | "active" | "done" | "failed";
export type Progress = { step: StepKey; state: StepState; note?: string };

export class StopError extends Error {
  constructor(
    message: string,
    readonly step: StepKey,
    readonly canRetry: boolean,
  ) {
    super(message);
  }
}

export function vaultAddr(): Address {
  const v = VAULT_ADDRESS ?? publicEnv().NEXT_PUBLIC_VAULT_ADDRESS;
  if (!v) throw new Error("The StacksClub vault isn't deployed yet.");
  return getAddress(v);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitReceipt(hash: Hash) {
  const r = await browserPublicClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (r.status !== "success") throw new Error("Transaction reverted");
  return r;
}

/** Approve exactly `amount` if the current allowance is short. Never unlimited (FLOWS §0). */
async function ensureAllowance(signer: Signer, token: Address, spender: Address, amount: bigint) {
  const allowance = await browserPublicClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [signer.address, spender] });
  if (allowance >= amount) return;
  const hash = await signer.sendTransaction({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) });
  await waitReceipt(hash);
}

async function vaultTx(signer: Signer, fn: string, args: readonly unknown[]): Promise<Hash> {
  const data = encodeFunctionData({ abi: vaultAbi, functionName: fn as never, args: args as never });
  const hash = await signer.sendTransaction({ to: vaultAddr(), data });
  await waitReceipt(hash);
  return hash;
}

/** Rough gas budget for a flow, used for the "You need about X BNB" check. */
export async function gasNeededWei(kind: Intent["kind"], legs: number): Promise<bigint> {
  const gasPrice = await browserPublicClient().getGasPrice();
  const units = BigInt(
    kind === "redeem" ? 200_000 : kind === "buy_stack" ? 180_000 + legs * 420_000 + 120_000 + legs * 60_000 : 180_000 + legs * 420_000 + 120_000,
  );
  return (gasPrice * units * 3n) / 2n;
}

/**
 * Drives an intent to completion from whatever state the server has. Every step is verified by
 * the server before it's saved; the client never marks anything confirmed itself.
 */
export async function runIntent(opts: {
  api: Api;
  signer: Signer;
  intentId: string;
  onProgress: (p: Progress) => void;
  onIntent: (i: Intent) => void;
}): Promise<Intent> {
  const { api, signer, intentId, onProgress, onIntent } = opts;
  const load = async () => {
    const i = await api<Intent>(`/api/intents/${intentId}`);
    onIntent(i);
    return i;
  };
  const patch = async (json: unknown) => {
    const i = await api<Intent>(`/api/intents/${intentId}`, { method: "PATCH", json });
    onIntent(i);
    return i;
  };

  let intent = await load();
  if (["done", "cancelled", "failed"].includes(intent.status)) return intent;

  // 1. Buy fee
  if (intent.kind.startsWith("buy") && !intent.fee_receipt_id) {
    onProgress({ step: "fee", state: "active" });
    const fee = BigInt(intent.fee_amount!);
    await ensureAllowance(signer, USDT_ADDRESS, vaultAddr(), fee);
    const hash = await vaultTx(signer, "payBuyFee", [BigInt(intent.stack_id ?? 0), BigInt(intent.gross_amount!)]);
    intent = await patch({ action: "fee_paid", txHash: hash });
  }
  if (intent.kind.startsWith("buy")) onProgress({ step: "fee", state: "done" });

  // 1b. Release (sell / redeem a Stack position)
  if ((intent.kind === "sell_stack" || intent.kind === "redeem") && !intent.released_amounts) {
    onProgress({ step: "release", state: "active" });
    const hash = await vaultTx(signer, "release", [BigInt(intent.position_id!), intent.bps!, intent.kind === "redeem" ? 0 : 1]);
    intent = await patch({ action: "release", txHash: hash });
  }
  if (intent.kind === "sell_stack" || intent.kind === "redeem") onProgress({ step: "release", state: "done" });
  if (intent.kind === "redeem") return intent;

  // 2. Legs, in sequence
  for (const initial of intent.legs) {
    let leg: Leg = intent.legs.find((l) => l.leg_index === initial.leg_index)!;
    const step: StepKey = `leg-${leg.leg_index}`;
    if (leg.status === "filled" || leg.status === "skipped") {
      onProgress({ step, state: "done" });
      continue;
    }
    if (leg.status === "failed") throw new StopError(leg.error ?? "This step failed", step, true);
    onProgress({ step, state: "active" });

    let autoRequoted = false;
    for (let guard = 0; guard < 6; guard++) {
      leg = intent.legs.find((l) => l.leg_index === initial.leg_index)!;
      if (leg.status === "filled") break;

      // Resume paths first, so a leg that already went out is never bought twice.
      if (leg.mode === "SWAP" && leg.status === "signed" && leg.tx_hash) {
        intent = await patch({ action: "leg", legIndex: leg.leg_index, txHash: leg.tx_hash });
        continue;
      }
      if (leg.mode === "RFQ" && leg.status === "signed") {
        intent = await patch({ action: "resubmit", legIndex: leg.leg_index });
        continue;
      }
      if (leg.mode === "RFQ" && leg.status === "submitted" && leg.order_id) {
        const final = await pollOrder(api, leg.order_id);
        intent = await load();
        if (final === "FILLED") continue;
        if (final === "EXPIRED" && !autoRequoted) {
          autoRequoted = true;
          intent = await patch({ action: "retry", legIndex: leg.leg_index });
          continue;
        }
        const l = intent.legs.find((x) => x.leg_index === leg.leg_index)!;
        throw new StopError(l.error ?? `Order ${final.toLowerCase()}`, step, true);
      }
      if (leg.status === "expired") {
        if (autoRequoted) throw new StopError("Quote expired", step, true);
        autoRequoted = true;
        intent = await patch({ action: "retry", legIndex: leg.leg_index });
        continue;
      }
      if (leg.status === "failed") throw new StopError(leg.error ?? "This step failed", step, true);

      // Fresh quote
      let q: QuoteResponse;
      try {
        q = await api<QuoteResponse>("/api/quote", { method: "POST", json: { intentId, legIndex: leg.leg_index } });
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) throw new StopError(e.message, step, true);
        throw e;
      }
      if (q.status === "needs_approval") {
        onProgress({ step, state: "active", note: "Approving" });
        const hash = await signer.sendTransaction({ to: q.approve.token, data: q.approve.data });
        await waitReceipt(hash);
        continue; // re-quote after the approval lands
      }
      if (q.mode === "SWAP") {
        onProgress({ step, state: "active", note: "Swapping" });
        const hash = await signer.sendTransaction({
          to: q.tx.to,
          data: q.tx.data,
          value: BigInt(q.tx.value || "0"),
          gas: q.tx.gas ? BigInt(q.tx.gas) : undefined,
        });
        intent = await patch({ action: "leg_sent", legIndex: leg.leg_index, txHash: hash });
        await waitReceipt(hash).catch(() => undefined); // server re-verifies either way
        intent = await patch({ action: "leg", legIndex: leg.leg_index, txHash: hash });
        continue;
      }
      // RFQ: sign the EIP-712 order, submit, poll
      onProgress({ step, state: "active", note: "Sign order" });
      const signature = await signer.signTypedData(q.typedData);
      try {
        await api("/api/orders", { method: "POST", json: { intentId, legIndex: leg.leg_index, signature } });
      } catch (e) {
        if (e instanceof ApiError && e.code === "expired" && !autoRequoted) {
          autoRequoted = true;
          intent = await patch({ action: "retry", legIndex: leg.leg_index });
          continue;
        }
        throw e;
      }
      onProgress({ step, state: "active", note: "Settling" });
      intent = await load();
    }
    leg = intent.legs.find((l) => l.leg_index === initial.leg_index)!;
    if (leg.status !== "filled") throw new StopError(leg.error ?? "This step didn't complete", step, true);
    onProgress({ step, state: "done" });
  }

  intent = await load();

  // 3. Deposit into the vault (Stack buys). Never before every leg is filled.
  if (intent.kind === "buy_stack" && intent.status === "legs_done") {
    const amounts = intent.legs.map((l) => BigInt(l.actual_out!));
    onProgress({ step: "approve", state: "active" });
    for (const l of intent.legs) await ensureAllowance(signer, getAddress(l.to_token), vaultAddr(), BigInt(l.actual_out!));
    onProgress({ step: "approve", state: "done" });
    onProgress({ step: "deposit", state: "active" });
    const hash = await vaultTx(signer, "openPosition", [BigInt(intent.stack_id!), BigInt(intent.fee_receipt_id!), amounts]);
    intent = await patch({ action: "deposit", txHash: hash });
    onProgress({ step: "deposit", state: "done" });
  }

  // 4. Sell fee on actual proceeds
  if ((intent.kind === "sell_stock" || intent.kind === "sell_stack") && intent.status === "legs_done") {
    onProgress({ step: "sellfee", state: "active" });
    const proceeds = intent.legs.reduce((s, l) => s + BigInt(l.actual_out ?? "0"), 0n);
    await ensureAllowance(signer, USDT_ADDRESS, vaultAddr(), sellFee(proceeds));
    const hash = await vaultTx(signer, "paySellFee", [BigInt(intent.position_id ?? 0), proceeds]);
    intent = await patch({ action: "sell_fee", txHash: hash });
    onProgress({ step: "sellfee", state: "done" });
  }
  return intent;
}

type QuoteResponse =
  | { status: "needs_approval"; mode: "SWAP" | "RFQ"; approve: { token: Address; spender: Address; amount: string; data: `0x${string}` } }
  | {
      status: "ready";
      mode: "SWAP";
      expectedOut: string;
      minOut: string;
      expiresAt: number;
      tx: { to: Address; data: `0x${string}`; value: string; gas: string | null };
    }
  | {
      status: "ready";
      mode: "RFQ";
      expectedOut: string;
      minOut: string;
      expiresAt: number;
      typedData: { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> };
    };

/** Poll every 2s for up to 90s (FLOWS §4). */
async function pollOrder(api: Api, orderId: string): Promise<"FILLED" | "FAILED" | "EXPIRED" | "PENDING"> {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const r = await api<{ status: "PENDING" | "FILLED" | "FAILED" | "EXPIRED" }>(`/api/orders/${orderId}`);
    if (r.status !== "PENDING") return r.status;
    await sleep(2000);
  }
  return "PENDING";
}
