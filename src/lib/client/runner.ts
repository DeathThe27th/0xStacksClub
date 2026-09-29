"use client";

import { encodeFunctionData, erc20Abi, getAddress, type Address, type Hash } from "viem";
import { USDT_ADDRESS } from "@/lib/constants";
import { vaultAbi, VAULT_ADDRESS } from "@/lib/contracts/vault";
import { publicEnv } from "@/lib/env";
import { sellFee } from "@/lib/math";
import { ApiError } from "./api";
import type { Intent, Leg } from "./types";
import { browserPublicClient, type Signer } from "./wallet";
import { APP_NAME } from "@/lib/constants";

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
  if (!v) throw new Error(`The ${APP_NAME} vault isn't deployed yet.`);
  return getAddress(v);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitReceipt(hash: Hash) {
  const r = await browserPublicClient().waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 400 });
  if (r.status !== "success") throw new Error("Transaction reverted");
  return r;
}

// Fixed gas limits for vault calls sent right behind their approval, before the approval is mined
// (estimating then would revert on the missing allowance). Measured on mainnet: payBuyFee 109k to
// 227k (first buy of a basket), paySellFee 52k, openPosition 499k with 2 stocks. Generous headroom;
// unused gas isn't charged.
const GAS = {
  payBuyFee: 350_000n,
  paySellFee: 140_000n,
  openPosition: (n: number) => 260_000n + 220_000n * BigInt(n),
};

// Next nonce per wallet, so back-to-back transactions don't collide while the node's pending
// count catches up. Only trusted briefly: a stale local count could skip a nonce and stall.
const nextNonce = new Map<Address, { n: number; at: number }>();
async function takeNonce(address: Address): Promise<number> {
  const pending = await browserPublicClient().getTransactionCount({ address, blockTag: "pending" });
  const local = nextNonce.get(address);
  const n = local && Date.now() - local.at < 30_000 ? Math.max(pending, local.n) : pending;
  nextNonce.set(address, { n: n + 1, at: Date.now() });
  return n;
}

/** One transaction with a tracked nonce. A failed send clears the local count. */
async function sendOne(signer: Signer, tx: Tx): Promise<Hash> {
  try {
    return await signer.sendTransaction({ ...tx, nonce: await takeNonce(signer.address) });
  } catch (e) {
    nextNonce.delete(signer.address);
    throw e;
  }
}

type Tx = { to: Address; data: `0x${string}`; value?: bigint; gas?: bigint };

/**
 * Sends transactions back to back with consecutive nonces, without waiting for each to be mined,
 * then waits for all of them. Nonce order makes the chain execute them in sequence, so an approval
 * always lands before the call that spends it. On BSC this turns N block waits into about one.
 */
async function sendInOrder(signer: Signer, txs: Tx[]): Promise<Hash[]> {
  const hashes: Hash[] = [];
  for (const tx of txs) hashes.push(await sendOne(signer, tx));
  const receipts = await Promise.all(hashes.map((h) => browserPublicClient().waitForTransactionReceipt({ hash: h, timeout: 120_000, pollingInterval: 400 })));
  const bad = receipts.findIndex((r) => r.status !== "success");
  if (bad >= 0) throw new Error(bad < receipts.length - 1 ? "Approval reverted" : "Transaction reverted");
  return hashes;
}

/** An exact approval tx if the current allowance is short, else nothing. Never unlimited (FLOWS §0). */
async function approvalIfNeeded(owner: Address, token: Address, spender: Address, amount: bigint): Promise<Tx | null> {
  const allowance = await browserPublicClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
  if (allowance >= amount) return null;
  return { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) };
}

/** Any approvals the call needs, then the vault call, sent in one burst. Returns the vault tx hash. */
async function vaultTx(signer: Signer, fn: string, args: readonly unknown[], gas: bigint, approvals: (Tx | null)[] = []): Promise<Hash> {
  const data = encodeFunctionData({ abi: vaultAbi, functionName: fn as never, args: args as never });
  const pre = approvals.filter((a): a is Tx => a !== null);
  // With nothing to approve first, let the wallet estimate gas as usual.
  const hashes = await sendInOrder(signer, [...pre, { to: vaultAddr(), data, gas: pre.length ? gas : undefined }]);
  return hashes.at(-1)!;
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
    const hash = await vaultTx(signer, "payBuyFee", [BigInt(intent.stack_id ?? 0), BigInt(intent.gross_amount!)], GAS.payBuyFee, [
      await approvalIfNeeded(signer.address, USDT_ADDRESS, vaultAddr(), fee),
    ]);
    intent = await patch({ action: "fee_paid", txHash: hash });
  }
  if (intent.kind.startsWith("buy")) onProgress({ step: "fee", state: "done" });

  // 1b. Release (sell / redeem a Stack position)
  if ((intent.kind === "sell_stack" || intent.kind === "redeem") && !intent.released_amounts) {
    onProgress({ step: "release", state: "active" });
    const hash = await vaultTx(signer, "release", [BigInt(intent.position_id!), intent.bps!, intent.kind === "redeem" ? 0 : 1], 0n);
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
        await sendInOrder(signer, [{ to: q.approve.token, data: q.approve.data }]);
        continue; // re-quote after the approval lands
      }
      if (q.mode === "SWAP") {
        onProgress({ step, state: "active", note: "Swapping" });
        const hash = await sendOne(signer, {
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
    // Every component approval and the deposit go out together; nonce order keeps them in sequence.
    const approvals = await Promise.all(intent.legs.map((l) => approvalIfNeeded(signer.address, getAddress(l.to_token), vaultAddr(), BigInt(l.actual_out!))));
    onProgress({ step: "deposit", state: "active" });
    const hash = await vaultTx(signer, "openPosition", [BigInt(intent.stack_id!), BigInt(intent.fee_receipt_id!), amounts], GAS.openPosition(amounts.length), approvals);
    onProgress({ step: "approve", state: "done" });
    intent = await patch({ action: "deposit", txHash: hash });
    onProgress({ step: "deposit", state: "done" });
  }

  // 4. Sell fee on actual proceeds
  if ((intent.kind === "sell_stock" || intent.kind === "sell_stack") && intent.status === "legs_done") {
    onProgress({ step: "sellfee", state: "active" });
    const proceeds = intent.legs.reduce((s, l) => s + BigInt(l.actual_out ?? "0"), 0n);
    const hash = await vaultTx(signer, "paySellFee", [BigInt(intent.position_id ?? 0), proceeds], GAS.paySellFee, [
      await approvalIfNeeded(signer.address, USDT_ADDRESS, vaultAddr(), sellFee(proceeds)),
    ]);
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

/** Poll every second for up to 90s (FLOWS §4). */
async function pollOrder(api: Api, orderId: string): Promise<"FILLED" | "FAILED" | "EXPIRED" | "PENDING"> {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const r = await api<{ status: "PENDING" | "FILLED" | "FAILED" | "EXPIRED" }>(`/api/orders/${orderId}`);
    if (r.status !== "PENDING") return r.status;
    await sleep(1000);
  }
  return "PENDING";
}
