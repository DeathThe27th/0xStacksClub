import { encodeFunctionData, erc20Abi, getAddress, type Address, type Hash } from "viem";
import { USDT_ADDRESS } from "@/lib/constants";
import { vaultAbi } from "@/lib/contracts/vault";
import { sellFee } from "@/lib/math";
import type { Intent, Leg } from "@/lib/client/types";

// The trade runner, shared by the browser and the server. It drives an intent to completion from
// whatever state is saved: fee, legs, deposit or sell fee. It never decides anything is confirmed
// itself; every step goes through `Backend`, which verifies it against the chain or Binance.
// In the browser the backend is our API and the signer is the user's wallet. On the server (the
// texting assistant, for users who turned on text buys) the backend is the same server code called
// directly and the signer is the user's embedded wallet through Privy.

export type Signer = {
  address: Address;
  sendTransaction: (tx: { to: Address; data: `0x${string}`; value?: bigint; gas?: bigint; nonce?: number }) => Promise<Hash>;
  signTypedData: (payload: {
    domain: Record<string, unknown>;
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<`0x${string}`>;
};

export type QuoteResponse =
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

export type OrderStatus = "PENDING" | "FILLED" | "FAILED" | "EXPIRED";
export type NeededApproval = { token: Address; spender: Address; amount: string };

export type Backend = {
  load(): Promise<Intent>;
  advance(input: Record<string, unknown>): Promise<Intent>;
  quote(legIndex: number): Promise<QuoteResponse>;
  submitOrder(legIndex: number, signature: `0x${string}`): Promise<unknown>;
  orderStatus(orderId: string): Promise<OrderStatus>;
  /**
   * Exact router approvals the unfilled legs will need. Best effort: sent early, alongside the fee,
   * so a leg doesn't have to stop for its own approval. A leg whose route changes still asks for one.
   */
  approvals?(): Promise<NeededApproval[]>;
};

/** The few chain reads the runner needs, so it doesn't care which viem client provides them. */
export type ChainReader = {
  waitReceipt(hash: Hash): Promise<{ status: "success" | "reverted" }>;
  pendingNonce(address: Address): Promise<number>;
  allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  gasPrice(): Promise<bigint>;
};

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
const codeOf = (e: unknown) => (e as { code?: string } | null)?.code;

// Fixed gas limits for vault calls sent right behind their approval, before the approval is mined
// (estimating then would revert on the missing allowance). Measured on mainnet: payBuyFee 109k to
// 227k (first buy of a basket), paySellFee 52k, openPosition 499k with 2 stocks. Generous headroom;
// unused gas isn't charged.
const GAS = {
  payBuyFee: 350_000n,
  paySellFee: 140_000n,
  openPosition: (n: number) => 260_000n + 220_000n * BigInt(n),
};

type Tx = { to: Address; data: `0x${string}`; value?: bigint; gas?: bigint };

const approveTx = (token: Address, spender: Address, amount: bigint): Tx => ({
  to: token,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
});

/** Rough gas units for a flow, used for the "You need about X BNB" check. */
export function gasUnits(kind: Intent["kind"], legs: number): bigint {
  return BigInt(kind === "redeem" ? 200_000 : kind === "buy_stack" ? 180_000 + legs * 420_000 + 120_000 + legs * 60_000 : 180_000 + legs * 420_000 + 120_000);
}

export function createRunner(deps: { chain: ChainReader; vault: () => Address }) {
  const { chain } = deps;

  async function waitReceipt(hash: Hash) {
    const r = await chain.waitReceipt(hash);
    if (r.status !== "success") throw new Error("Transaction reverted");
    return r;
  }

  // Next nonce per wallet, so back-to-back transactions don't collide while the node's pending
  // count catches up. Only trusted briefly: a stale local count could skip a nonce and stall.
  const nextNonce = new Map<Address, { n: number; at: number }>();
  async function takeNonce(address: Address): Promise<number> {
    const pending = await chain.pendingNonce(address);
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

  /**
   * Sends transactions back to back with consecutive nonces, without waiting for each to be mined,
   * then waits for all of them. Nonce order makes the chain execute them in sequence, so an approval
   * always lands before the call that spends it. On BSC this turns N block waits into about one.
   */
  async function sendInOrder(signer: Signer, txs: Tx[], opts: { onlyLastMustSucceed?: boolean } = {}): Promise<Hash[]> {
    const hashes: Hash[] = [];
    for (const tx of txs) hashes.push(await sendOne(signer, tx));
    const receipts = await Promise.all(hashes.map((h) => chain.waitReceipt(h)));
    const bad = receipts.findIndex((r) => r.status !== "success");
    if (bad >= 0 && (!opts.onlyLastMustSucceed || bad === receipts.length - 1 || receipts.at(-1)!.status !== "success")) {
      throw new Error(bad < receipts.length - 1 ? "Approval reverted" : "Transaction reverted");
    }
    return hashes;
  }

  /** An exact approval tx if the current allowance is short, else nothing. Never unlimited (FLOWS §0). */
  async function approvalIfNeeded(owner: Address, token: Address, spender: Address, amount: bigint): Promise<Tx | null> {
    const allowance = await chain.allowance(token, owner, spender);
    if (allowance >= amount) return null;
    return approveTx(token, spender, amount);
  }

  /** Any approvals the call needs, then the vault call, sent in one burst. Returns the vault tx hash. */
  async function vaultTx(signer: Signer, fn: string, args: readonly unknown[], gas: bigint, approvals: (Tx | null)[] = []): Promise<Hash> {
    const data = encodeFunctionData({ abi: vaultAbi, functionName: fn as never, args: args as never });
    const pre = approvals.filter((a): a is Tx => a !== null);
    // With nothing to approve first, let the wallet estimate gas as usual.
    // What matters is the vault call itself: if it went through, its hash must reach the backend
    // (a paid fee that's never recorded would be paid twice), whatever happened to a side approval.
    const hashes = await sendInOrder(signer, [...pre, { to: deps.vault(), data, gas: pre.length ? gas : undefined }], { onlyLastMustSucceed: true });
    return hashes.at(-1)!;
  }

  /** Router approvals for the legs ahead, fetched once. Any failure just means legs approve as they go. */
  async function routerApprovals(backend: Backend): Promise<Tx[]> {
    if (!backend.approvals) return [];
    try {
      return (await backend.approvals()).map((a) => approveTx(getAddress(a.token), getAddress(a.spender), BigInt(a.amount)));
    } catch {
      return [];
    }
  }

  async function gasNeededWei(kind: Intent["kind"], legs: number): Promise<bigint> {
    return ((await chain.gasPrice()) * gasUnits(kind, legs) * 3n) / 2n;
  }

  /** Poll every second for up to 90s (FLOWS §4). */
  async function pollOrder(backend: Backend, orderId: string): Promise<OrderStatus> {
    const until = Date.now() + 90_000;
    while (Date.now() < until) {
      const status = await backend.orderStatus(orderId);
      if (status !== "PENDING") return status;
      await sleep(1000);
    }
    return "PENDING";
  }

  /**
   * Drives an intent to completion from whatever state the backend has. Every step is verified by
   * the backend before it's saved; the runner never marks anything confirmed itself.
   */
  async function runIntent(opts: { backend: Backend; signer: Signer; onProgress?: (p: Progress) => void }): Promise<Intent> {
    const { backend, signer } = opts;
    const onProgress = opts.onProgress ?? (() => undefined);

    // The approvals lookup is the slowest read of the run (it asks Binance for a route), so it
    // starts alongside the first load instead of after it.
    const early = routerApprovals(backend);
    let intent = await backend.load();
    if (["done", "cancelled", "failed"].includes(intent.status)) return intent;

    // 1. Buy fee. The legs' router approvals go out in the same burst, so no leg stops to approve.
    if (intent.kind.startsWith("buy") && !intent.fee_receipt_id) {
      onProgress({ step: "fee", state: "active" });
      const fee = BigInt(intent.fee_amount!);
      const [feeApproval, routers] = await Promise.all([approvalIfNeeded(signer.address, USDT_ADDRESS, deps.vault(), fee), early]);
      const hash = await vaultTx(signer, "payBuyFee", [BigInt(intent.stack_id ?? 0), BigInt(intent.gross_amount!)], GAS.payBuyFee, [...routers, feeApproval]);
      intent = await backend.advance({ action: "fee_paid", txHash: hash });
    }
    if (intent.kind.startsWith("buy")) onProgress({ step: "fee", state: "done" });

    // 1b. Release (sell / redeem a Stack position)
    if ((intent.kind === "sell_stack" || intent.kind === "redeem") && !intent.released_amounts) {
      onProgress({ step: "release", state: "active" });
      const hash = await vaultTx(signer, "release", [BigInt(intent.position_id!), intent.bps!, intent.kind === "redeem" ? 0 : 1], 0n);
      intent = await backend.advance({ action: "release", txHash: hash });
    }
    if (intent.kind === "sell_stack" || intent.kind === "redeem") onProgress({ step: "release", state: "done" });
    if (intent.kind === "redeem") return intent;

    // Sells: approve the router for every unsold leg in one burst before the first quote.
    if (intent.kind.startsWith("sell") && intent.legs.some((l) => l.status === "pending")) {
      // A basket sell only knows its amounts after the release above, so it asks again.
      const routers = intent.kind === "sell_stock" ? await early : await routerApprovals(backend);
      if (routers.length) await sendInOrder(signer, routers).catch(() => undefined);
    }

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
          intent = await backend.advance({ action: "leg", legIndex: leg.leg_index, txHash: leg.tx_hash });
          continue;
        }
        if (leg.mode === "RFQ" && leg.status === "signed") {
          intent = await backend.advance({ action: "resubmit", legIndex: leg.leg_index });
          continue;
        }
        if (leg.mode === "RFQ" && leg.status === "submitted" && leg.order_id) {
          const final = await pollOrder(backend, leg.order_id);
          intent = await backend.load();
          if (final === "FILLED") continue;
          if (final === "EXPIRED" && !autoRequoted) {
            autoRequoted = true;
            intent = await backend.advance({ action: "retry", legIndex: leg.leg_index });
            continue;
          }
          const l = intent.legs.find((x) => x.leg_index === leg.leg_index)!;
          throw new StopError(l.error ?? `Order ${final.toLowerCase()}`, step, true);
        }
        if (leg.status === "expired") {
          if (autoRequoted) throw new StopError("Quote expired", step, true);
          autoRequoted = true;
          intent = await backend.advance({ action: "retry", legIndex: leg.leg_index });
          continue;
        }
        if (leg.status === "failed") throw new StopError(leg.error ?? "This step failed", step, true);

        // Fresh quote
        let q: QuoteResponse;
        try {
          q = await backend.quote(leg.leg_index);
        } catch (e) {
          if (statusOf(e) === 422) throw new StopError((e as Error).message, step, true);
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
          // Record the hash while the swap is being mined (so a closed tab can resume from it),
          // then have the backend verify it. The backend re-checks the receipt either way.
          const legIndex = leg.leg_index;
          await Promise.all([backend.advance({ action: "leg_sent", legIndex, txHash: hash }), waitReceipt(hash).catch(() => undefined)]);
          intent = await backend.advance({ action: "leg", legIndex, txHash: hash });
          continue;
        }
        // RFQ: sign the EIP-712 order, submit, poll
        onProgress({ step, state: "active", note: "Sign order" });
        const signature = await signer.signTypedData(q.typedData);
        try {
          await backend.submitOrder(leg.leg_index, signature);
        } catch (e) {
          if (codeOf(e) === "expired" && !autoRequoted) {
            autoRequoted = true;
            intent = await backend.advance({ action: "retry", legIndex: leg.leg_index });
            continue;
          }
          throw e;
        }
        onProgress({ step, state: "active", note: "Settling" });
        intent = await backend.load();
      }
      leg = intent.legs.find((l) => l.leg_index === initial.leg_index)!;
      if (leg.status !== "filled") throw new StopError(leg.error ?? "This step didn't complete", step, true);
      onProgress({ step, state: "done" });
    }

    intent = await backend.load();

    // 3. Deposit into the vault (Stack buys). Never before every leg is filled.
    if (intent.kind === "buy_stack" && intent.status === "legs_done") {
      const amounts = intent.legs.map((l) => BigInt(l.actual_out!));
      onProgress({ step: "approve", state: "active" });
      // Every component approval and the deposit go out together; nonce order keeps them in sequence.
      const approvals = await Promise.all(intent.legs.map((l) => approvalIfNeeded(signer.address, getAddress(l.to_token), deps.vault(), BigInt(l.actual_out!))));
      onProgress({ step: "deposit", state: "active" });
      const hash = await vaultTx(signer, "openPosition", [BigInt(intent.stack_id!), BigInt(intent.fee_receipt_id!), amounts], GAS.openPosition(amounts.length), approvals);
      onProgress({ step: "approve", state: "done" });
      intent = await backend.advance({ action: "deposit", txHash: hash });
      onProgress({ step: "deposit", state: "done" });
    }

    // 4. Sell fee on actual proceeds
    if ((intent.kind === "sell_stock" || intent.kind === "sell_stack") && intent.status === "legs_done") {
      onProgress({ step: "sellfee", state: "active" });
      const proceeds = intent.legs.reduce((s, l) => s + BigInt(l.actual_out ?? "0"), 0n);
      const hash = await vaultTx(signer, "paySellFee", [BigInt(intent.position_id ?? 0), proceeds], GAS.paySellFee, [
        await approvalIfNeeded(signer.address, USDT_ADDRESS, deps.vault(), sellFee(proceeds)),
      ]);
      intent = await backend.advance({ action: "sell_fee", txHash: hash });
      onProgress({ step: "sellfee", state: "done" });
    }
    return intent;
  }

  return { runIntent, gasNeededWei };
}
