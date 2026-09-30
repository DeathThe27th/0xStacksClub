import "server-only";
import { createHash } from "node:crypto";
import {
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  parseUnits,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { MIN_BUY_USD_LARGE, MIN_BUY_USD_SMALL, USDT_ADDRESS, DEFAULT_SLIPPAGE_PERCENT } from "@/lib/constants";
import { vaultAbi } from "@/lib/contracts/vault";
import { allocate, buyFee, releaseAmount } from "@/lib/math";
import type { AssetRow, IntentKind, IntentLegRow, IntentRow, IntentStatus } from "@/lib/supabase/types";
import { requireTradable } from "@/server/assets/store";
import type { AuthContext } from "@/server/auth";
import {
  BinanceError,
  buildSwap,
  getApproveTx,
  getOrderStatus,
  getQuote,
  normalizeOrderStatus,
  submitRfqOrder,
} from "@/server/binance";
import { parseTypedDataToSign, type Eip712Payload } from "@/server/binance/typed-data";
import { publicClient, readErc20Balances, readTokenMeta } from "@/server/chain";
import { db, must } from "@/server/db";
import { HttpError } from "@/server/http";
import { requireFairQuote } from "@/server/priceGuard";
import { readPosition, readStack, requireVault, syncTx } from "@/server/vault";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let usdtDecimals: number | undefined;
/** FLOWS.md: read decimals from the token, never hardcode. */
export async function getUsdtDecimals(): Promise<number> {
  if (usdtDecimals !== undefined) return usdtDecimals;
  const [m] = await readTokenMeta([USDT_ADDRESS]);
  if (m?.decimals === undefined) throw new Error("Could not read USDT decimals");
  return (usdtDecimals = m.decimals);
}

async function minBuyRaw(components: number): Promise<bigint> {
  const usd = components >= 4 ? MIN_BUY_USD_LARGE : MIN_BUY_USD_SMALL;
  return parseUnits(String(usd), await getUsdtDecimals());
}

export type IntentWithLegs = IntentRow & { legs: IntentLegRow[] };

export async function loadIntent(id: string, ctx: AuthContext): Promise<IntentWithLegs> {
  const intent = must(await db().from("intents").select("*").eq("id", id).maybeSingle()) as IntentRow | null;
  if (!intent || intent.profile_id !== ctx.profile?.id) throw new HttpError(404, "Intent not found");
  if (intent.wallet_address !== ctx.wallet.toLowerCase()) {
    throw new HttpError(409, "This intent was started with a different wallet. Switch back to continue.");
  }
  const legs = must(await db().from("intent_legs").select("*").eq("intent_id", id).order("leg_index")) as IntentLegRow[];
  return { ...intent, legs };
}

async function setIntent(id: string, patch: Partial<IntentRow>) {
  must(await db().from("intents").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
}

async function setLeg(intentId: string, legIndex: number, patch: Partial<IntentLegRow>) {
  must(
    await db()
      .from("intent_legs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("intent_id", intentId)
      .eq("leg_index", legIndex),
  );
}

function leg(intent: IntentWithLegs, index: number): IntentLegRow {
  const l = intent.legs.find((x) => x.leg_index === index);
  if (!l) throw new HttpError(404, "Leg not found");
  return l;
}

/** Stable RFQ idempotency key per (intent, leg, attempt), formatted as a UUID v4. */
export function rfqRequestId(intentId: string, legIndex: number, attempt: number): string {
  const h = createHash("sha256").update(`${intentId}:${legIndex}:${attempt}`).digest("hex");
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function receiptFor(hash: Hash, wallet: Address): Promise<TransactionReceipt> {
  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 60_000 });
  } catch {
    throw new HttpError(409, "Transaction not confirmed yet", "pending");
  }
  if (receipt.status !== "success") throw new HttpError(422, "Transaction reverted", "reverted");
  if (getAddress(receipt.from) !== wallet) throw new HttpError(403, "Transaction was sent from a different wallet");
  return receipt;
}

function vaultEvents(receipt: TransactionReceipt) {
  const vault = requireVault();
  return receipt.logs
    .filter((l) => getAddress(l.address) === vault)
    .flatMap((l) => {
      try {
        return [decodeEventLog({ abi: vaultAbi, data: l.data, topics: l.topics })];
      } catch {
        return [];
      }
    });
}

async function balanceOf(wallet: Address, token: string): Promise<bigint> {
  const m = await readErc20Balances(wallet, [getAddress(token)]);
  return m.get(getAddress(token)) ?? 0n;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateIntentInput =
  | { kind: "buy_stock"; assetAddress: string; grossAmount: string }
  | { kind: "buy_stack"; stackId: number; grossAmount: string }
  | { kind: "sell_stock"; assetAddress: string; bps: number }
  | { kind: "sell_stack"; positionId: number; bps: number }
  | { kind: "redeem"; positionId: number; bps: number };

type NewLeg = { from_token: string; to_token: string; amount_in: string };

export async function createIntent(ctx: AuthContext & { profile: NonNullable<AuthContext["profile"]> }, input: CreateIntentInput) {
  const wallet = ctx.wallet;
  const base = { profile_id: ctx.profile.id, wallet_address: wallet.toLowerCase(), kind: input.kind as IntentKind };
  let row: Partial<IntentRow> = {};
  let legs: NewLeg[] = [];

  switch (input.kind) {
    case "buy_stock": {
      const asset = await requireTradable(input.assetAddress, "trade").catch((e) => {
        throw new HttpError(422, (e as Error).message);
      });
      const gross = BigInt(input.grossAmount);
      if (gross < (await minBuyRaw(1))) throw new HttpError(422, `Minimum buy is $${MIN_BUY_USD_SMALL}`);
      await requireUsdt(wallet, gross);
      const { fee, net } = buyFee(gross, false);
      row = { asset_address: asset.address, gross_amount: gross.toString(), fee_amount: fee.toString() };
      legs = [{ from_token: USDT_ADDRESS, to_token: asset.address, amount_in: net.toString() }];
      break;
    }
    case "buy_stack": {
      const stack = await readStack(input.stackId);
      if (!stack) throw new HttpError(404, "Basket not found onchain");
      for (const a of stack.assets) {
        await requireTradable(a, "trade").catch((e) => {
          throw new HttpError(422, `This basket can't be bought right now: ${(e as Error).message}`);
        });
      }
      const gross = BigInt(input.grossAmount);
      const min = await minBuyRaw(stack.assets.length);
      if (gross < min) throw new HttpError(422, `Minimum buy for this basket is $${stack.assets.length >= 4 ? MIN_BUY_USD_LARGE : MIN_BUY_USD_SMALL}`);
      await requireUsdt(wallet, gross);
      const { fee, net } = buyFee(gross, true);
      const alloc = allocate(net, stack.weightsBps);
      row = { stack_id: stack.id, gross_amount: gross.toString(), fee_amount: fee.toString() };
      legs = stack.assets.map((a, i) => ({ from_token: USDT_ADDRESS, to_token: a, amount_in: alloc[i]!.toString() }));
      break;
    }
    case "sell_stock": {
      const asset = await requireTradable(input.assetAddress, "trade").catch((e) => {
        throw new HttpError(422, (e as Error).message);
      });
      const bal = await balanceOf(wallet, asset.address);
      const amount = releaseAmount(bal, input.bps);
      if (amount === 0n) throw new HttpError(422, "Nothing to sell");
      row = { asset_address: asset.address, bps: input.bps };
      legs = [{ from_token: asset.address, to_token: USDT_ADDRESS, amount_in: amount.toString() }];
      break;
    }
    case "sell_stack":
    case "redeem": {
      const pos = await readPosition(input.positionId);
      if (!pos || pos.owner !== wallet) throw new HttpError(403, "You don't own this position");
      row = { position_id: pos.id, stack_id: pos.stackId, bps: input.bps };
      if (input.kind === "sell_stack") {
        // Expected amounts; replaced with the exact released units once the release is verified.
        legs = pos.assets.map((a, i) => ({
          from_token: a,
          to_token: USDT_ADDRESS,
          amount_in: releaseAmount(pos.balances[i]!, input.bps).toString(),
        }));
      }
      break;
    }
  }

  const intent = must(await db().from("intents").insert({ ...base, ...row }).select("*").single()) as IntentRow;
  if (legs.length) {
    must(await db().from("intent_legs").insert(legs.map((l, i) => ({ intent_id: intent.id, leg_index: i, ...l }))));
  }
  return loadIntent(intent.id, ctx);
}

async function requireUsdt(wallet: Address, gross: bigint) {
  const bal = await balanceOf(wallet, USDT_ADDRESS);
  if (bal < gross) throw new HttpError(422, "Not enough USDT");
}

// ---------------------------------------------------------------------------
// Quote a leg
// ---------------------------------------------------------------------------

export type LegQuote =
  | {
      status: "needs_approval";
      approve: { token: Address; spender: Address; amount: string; data: `0x${string}` };
      mode: "SWAP" | "RFQ";
    }
  | {
      status: "ready";
      mode: "SWAP";
      expectedOut: string;
      minOut: string;
      expiresAt: number;
      tx: { to: Address; data: `0x${string}`; value: string; gas: string | null; gasPrice: string | null };
    }
  | {
      status: "ready";
      mode: "RFQ";
      expectedOut: string;
      minOut: string;
      expiresAt: number;
      typedData: Eip712Payload;
    };

/** Maps quote-time Binance errors to a user-facing 422 with the exact message (binance-notes §5). */
function quoteError(e: unknown): never {
  if (e instanceof BinanceError && e.code) {
    const friendly: Record<number, string> = {
      40367: "The market for this stock is closed right now.",
      40369: "The market for this stock is closed right now.",
      40374: "No liquidity for this token right now. Try again later.",
      40421: "No liquidity for this pair right now.",
      40441: "No valid quote right now. Try again in a moment.",
    };
    throw new HttpError(422, friendly[e.code] ?? `${e.message}`, `binance_${e.code}`);
  }
  throw e;
}

/**
 * Fresh quote for one leg. Checks the exact-amount allowance for the spender Binance names; if
 * short, returns an approval to send first. Otherwise builds the swap within the quote's ~30s TTL.
 */
export async function quoteLeg(ctx: AuthContext, intent: IntentWithLegs, legIndex: number): Promise<LegQuote> {
  const l = leg(intent, legIndex);
  if (l.status === "filled" || l.status === "skipped") throw new HttpError(409, "Leg already done");
  if (l.status === "submitted") throw new HttpError(409, "Order already submitted; wait for its status");
  if (intent.kind.startsWith("buy") && !intent.fee_receipt_id) throw new HttpError(409, "Pay the fee first");
  if (intent.kind === "sell_stack" && !intent.released_amounts) throw new HttpError(409, "Release the position first");

  const wallet = ctx.wallet;
  const from = getAddress(l.from_token);
  const to = getAddress(l.to_token);
  const amount = BigInt(l.amount_in);
  // Allowlist re-check on every quote: never trade a token that isn't enabled.
  const asset = await requireTradable(from === USDT_ADDRESS ? to : from, "trade").catch((e) => {
    throw new HttpError(422, (e as Error).message);
  });

  let routes;
  try {
    routes = await getQuote({ from, to, amount, userAddress: wallet });
  } catch (e) {
    quoteError(e);
  }
  const route = routes.find((r) => r.isBest) ?? routes[0];
  if (!route) throw new HttpError(422, "No route for this trade right now");
  // Stop before anything is approved or signed if the best route is far off the market price.
  // The approval lookup doesn't depend on that check, so both run at once.
  const buying = from === USDT_ADDRESS;
  const [, approvals] = await Promise.all([
    requireFairQuote({
      side: buying ? "buy" : "sell",
      asset,
      usdtRaw: buying ? amount : BigInt(route.toTokenAmount),
      usdtDecimals: await getUsdtDecimals(),
      tokenRaw: buying ? BigInt(route.toTokenAmount) : amount,
    }),
    // Spender for the exact approval. RFQ approvals are vendor-specific (binance-notes §5).
    getApproveTx({ token: from, amount, vendor: route.executionMode === "RFQ" ? route.vendorName : undefined }).catch(quoteError),
  ]);
  const spender = approvals[0] ? getAddress(approvals[0].dexContractAddress) : null;
  if (!spender) throw new HttpError(502, "Binance returned no approval spender");
  const allowance = await publicClient().readContract({ address: from, abi: erc20Abi, functionName: "allowance", args: [wallet, spender] });
  if (allowance < amount) {
    // Encode our own exact-amount approval rather than trusting returned calldata.
    return {
      status: "needs_approval",
      mode: route.executionMode,
      approve: {
        token: from,
        spender,
        amount: amount.toString(),
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
      },
    };
  }

  // Nothing moves between these two, so the balance snapshot and the swap build run together.
  const [balanceBefore, built] = await Promise.all([
    balanceOf(wallet, to),
    buildSwap({ from, to, amount, userAddress: wallet, quoteId: route.quoteId, slippagePercent: DEFAULT_SLIPPAGE_PERCENT }).catch(quoteError),
  ]);
  const expiresAt = Date.now() + 25_000;
  const expected = BigInt(route.toTokenAmount);

  if (built.executionMode === "SWAP") {
    const tx = built.tx;
    if (!tx) throw new HttpError(502, "Binance returned a SWAP route without a transaction");
    if (getAddress(tx.from) !== wallet) throw new HttpError(502, "Swap transaction sender doesn't match your wallet");
    const minOut = tx.minReceiveAmount ? BigInt(tx.minReceiveAmount) : (expected * 99n) / 100n;
    const gas = await swapGasLimit(wallet, getAddress(tx.to), tx.data as `0x${string}`, BigInt(tx.value ?? "0"), tx.gas);
    await setLeg(intent.id, legIndex, {
      mode: "SWAP",
      vendor: route.vendorName,
      expected_out: expected.toString(),
      min_out: minOut.toString(),
      balance_before: balanceBefore.toString(),
      status: "quoted",
      error: null,
      tx_hash: null,
      order_id: null,
      rfq_quote_id: null,
      signature: null,
    });
    return {
      status: "ready",
      mode: "SWAP",
      expectedOut: expected.toString(),
      minOut: minOut.toString(),
      expiresAt,
      tx: { to: getAddress(tx.to), data: tx.data as `0x${string}`, value: tx.value ?? "0", gas: gas.toString(), gasPrice: tx.gasPrice ?? null },
    };
  }

  const rfq = built.rfq;
  if (!rfq) throw new HttpError(502, "Binance returned an RFQ route without order data");
  if (!rfq.orderId) {
    throw new HttpError(502, "Binance RFQ response has no rfq.orderId (see docs/binance-notes.md §6). Stopping.", "binance_shape");
  }
  const typedData = parseTypedDataToSign(rfq.typedDataToSign);
  const domainChain = typedData.domain.chainId;
  if (domainChain !== undefined && Number(domainChain) !== 56) throw new HttpError(502, "RFQ order is not for BSC");
  const minOut = (expected * (10_000n - BigInt(Math.round(Number(DEFAULT_SLIPPAGE_PERCENT) * 100)))) / 10_000n;
  await setLeg(intent.id, legIndex, {
    mode: "RFQ",
    vendor: rfq.vendor,
    rfq_quote_id: rfq.orderId,
    signing_scheme: rfq.signingScheme ?? null,
    expected_out: expected.toString(),
    min_out: minOut.toString(),
    balance_before: balanceBefore.toString(),
    status: "quoted",
    error: null,
    signature: null,
    order_id: null,
  });
  return { status: "ready", mode: "RFQ", expectedOut: expected.toString(), minOut: minOut.toString(), expiresAt, typedData };
}

/**
 * The exact router approvals this intent's unfilled legs will need, one per token and spender (legs
 * that share a spender are summed). The client sends them together with the fee, so a leg doesn't
 * stop for its own approval and re-quote. Best effort: a leg we can't route here is left out and
 * approves when it's quoted, as before.
 */
export async function legApprovals(ctx: AuthContext, intent: IntentWithLegs): Promise<{ token: Address; spender: Address; amount: string }[]> {
  if (intent.kind === "sell_stack" && !intent.released_amounts) return [];
  const wallet = ctx.wallet;
  const need = new Map<string, { token: Address; spender: Address; amount: bigint }>();
  for (const l of intent.legs) {
    const amount = BigInt(l.amount_in);
    if (l.status !== "pending" || amount === 0n) continue;
    try {
      const from = getAddress(l.from_token);
      const to = getAddress(l.to_token);
      await requireTradable(from === USDT_ADDRESS ? to : from, "trade");
      const routes = await getQuote({ from, to, amount, userAddress: wallet });
      const route = routes.find((r) => r.isBest) ?? routes[0];
      if (!route) continue;
      const approvals = await getApproveTx({ token: from, amount, vendor: route.executionMode === "RFQ" ? route.vendorName : undefined });
      if (!approvals[0]) continue;
      const spender = getAddress(approvals[0].dexContractAddress);
      const key = `${from}:${spender}`;
      const cur = need.get(key);
      need.set(key, { token: from, spender, amount: (cur?.amount ?? 0n) + amount });
    } catch {
      // Closed market, no liquidity, not tradable: the leg's own quote reports it properly.
    }
  }
  const out: { token: Address; spender: Address; amount: string }[] = [];
  for (const n of need.values()) {
    const allowance = await publicClient().readContract({ address: n.token, abi: erc20Abi, functionName: "allowance", args: [wallet, n.spender] });
    if (allowance < n.amount) out.push({ token: n.token, spender: n.spender, amount: n.amount.toString() });
  }
  return out;
}

/**
 * Gas limit for a SWAP leg. Binance's `tx.gas` has proven too low for some routes (a bStock swap
 * estimated at 450k needed ~516k and reverted out of gas), so we simulate the exact transaction
 * from the user's wallet and add 30%. If the simulation reverts, don't send it at all.
 */
async function swapGasLimit(from: Address, to: Address, data: `0x${string}`, value: bigint, binanceGas: string | null | undefined): Promise<bigint> {
  let estimate: bigint;
  try {
    estimate = await publicClient().estimateGas({ account: from, to, data, value });
  } catch (e) {
    const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message.split("\n")[0]!;
    throw new HttpError(422, `This swap would fail right now (${msg}). Try again in a moment.`, "simulation_failed");
  }
  const padded = (estimate * 13n) / 10n;
  const fromBinance = binanceGas ? BigInt(binanceGas) : 0n;
  return padded > fromBinance ? padded : fromBinance;
}

// ---------------------------------------------------------------------------
// RFQ orders
// ---------------------------------------------------------------------------

export async function submitOrder(ctx: AuthContext, intent: IntentWithLegs, legIndex: number, signature: `0x${string}`) {
  const l = leg(intent, legIndex);
  if (l.mode !== "RFQ" || !l.rfq_quote_id || !l.vendor) throw new HttpError(409, "Leg has no RFQ quote");
  if (l.status === "submitted" && l.order_id) return { orderId: l.order_id };
  if (l.status !== "quoted" && l.status !== "signed") throw new HttpError(409, `Leg is ${l.status}`);
  // Persist the signature first so a lost response can be retried with the same requestId.
  await setLeg(intent.id, legIndex, { signature, status: "signed" });
  const res = await submitRfqOrder({
    requestId: rfqRequestId(intent.id, legIndex, l.attempt),
    userSignature: signature,
    vendor: l.vendor,
    quoteId: l.rfq_quote_id,
    signingScheme: l.signing_scheme,
  }).catch((e) => {
    if (e instanceof BinanceError && e.code === 40401) {
      return setLeg(intent.id, legIndex, { status: "expired", error: "Quote expired" }).then(() => {
        throw new HttpError(409, "Quote expired. Getting a fresh one.", "expired");
      });
    }
    throw e;
  });
  await setLeg(intent.id, legIndex, { order_id: res.orderId, status: "submitted" });
  if (intent.status === "fee_paid" || intent.status === "created") await setIntent(intent.id, { status: "legs_running" });
  return { orderId: res.orderId };
}

/** Resubmit a leg stuck in `signed` (tab closed mid-submit). Same requestId, so idempotent. */
export async function resubmitSigned(ctx: AuthContext, intent: IntentWithLegs, legIndex: number) {
  const l = leg(intent, legIndex);
  if (l.status !== "signed" || !l.signature) throw new HttpError(409, "Nothing to resubmit");
  return submitOrder(ctx, intent, legIndex, l.signature as `0x${string}`);
}

export async function pollOrder(ctx: AuthContext, orderId: string) {
  const l = must(await db().from("intent_legs").select("*").eq("order_id", orderId).maybeSingle()) as IntentLegRow | null;
  if (!l) throw new HttpError(404, "Order not found");
  const intent = await loadIntent(l.intent_id, ctx);
  const s = await getOrderStatus(orderId);
  const status = normalizeOrderStatus(s.status);

  if (status === "FILLED" && l.status !== "filled") {
    const wallet = ctx.wallet;
    const delta = (await balanceOf(wallet, l.to_token)) - BigInt(l.balance_before ?? "0");
    const settled = s.toAmount ? BigInt(s.toAmount) : null;
    const minOut = BigInt(l.min_out ?? "0");
    // FILLED alone isn't a completed trade: the tokens must be at the user's own address.
    if (delta <= 0n) {
      await failLeg(intent, l.leg_index, `Order FILLED but no ${l.to_token} arrived at ${wallet} (tx ${s.txHash ?? "?"}). Stopping.`);
      return { status: "FAILED" as const, raw: s.status, error: "Tokens did not arrive at your wallet" };
    }
    const actual = settled !== null && settled <= delta ? settled : delta;
    if (actual < minOut) {
      await failLeg(intent, l.leg_index, `Received ${actual} below minimum ${minOut}`);
      return { status: "FAILED" as const, raw: s.status, error: "Received less than the minimum" };
    }
    await setLeg(intent.id, l.leg_index, { status: "filled", actual_out: actual.toString(), tx_hash: s.txHash ?? null, error: null });
    await afterLegFilled(ctx, intent.id);
  } else if ((status === "FAILED" || status === "EXPIRED") && l.status === "submitted") {
    await setLeg(intent.id, l.leg_index, { status: status === "EXPIRED" ? "expired" : "failed", error: `Order ${s.status}` });
    await setIntent(intent.id, { status: "partial", error: `Leg ${l.leg_index + 1} ${s.status.toLowerCase()}` });
  }
  return { status, raw: s.status, txHash: s.txHash ?? null };
}

async function failLeg(intent: IntentWithLegs, legIndex: number, error: string) {
  await setLeg(intent.id, legIndex, { status: "failed", error });
  await setIntent(intent.id, { status: "partial", error });
}

// ---------------------------------------------------------------------------
// Advance (PATCH /api/intents/[id]) — every step verified against chain or Binance
// ---------------------------------------------------------------------------

export type AdvanceInput =
  | { action: "fee_paid"; txHash: Hash }
  | { action: "leg_sent"; legIndex: number; txHash: Hash }
  | { action: "leg"; legIndex: number; txHash: Hash }
  | { action: "resubmit"; legIndex: number }
  | { action: "release"; txHash: Hash }
  | { action: "deposit"; txHash: Hash }
  | { action: "sell_fee"; txHash: Hash }
  | { action: "retry"; legIndex: number }
  | { action: "cancel" };

export async function advanceIntent(ctx: AuthContext, id: string, input: AdvanceInput): Promise<IntentWithLegs> {
  const intent = await loadIntent(id, ctx);
  const wallet = ctx.wallet;
  const terminal: IntentStatus[] = ["done", "cancelled", "failed"];
  if (terminal.includes(intent.status)) throw new HttpError(409, `Intent is ${intent.status}`);

  switch (input.action) {
    case "fee_paid": {
      if (!intent.kind.startsWith("buy")) throw new HttpError(409, "No buy fee on this intent");
      if (intent.fee_receipt_id) break;
      const receipt = await receiptFor(input.txHash, wallet);
      const ev = vaultEvents(receipt).find((e) => e.eventName === "BuyFeePaid");
      if (!ev || ev.eventName !== "BuyFeePaid") throw new HttpError(422, "No BuyFeePaid event in that transaction");
      const a = ev.args;
      const expectedStack = BigInt(intent.stack_id ?? 0);
      if (getAddress(a.payer) !== wallet || a.stackId !== expectedStack || a.grossAmount !== BigInt(intent.gross_amount!)) {
        throw new HttpError(422, "Fee payment doesn't match this intent");
      }
      const used = must(await db().from("intents").select("id").eq("fee_receipt_id", Number(a.receiptId)).neq("id", intent.id)) as unknown[];
      if (used.length) throw new HttpError(409, "That fee receipt belongs to another intent");
      await setIntent(intent.id, { fee_receipt_id: Number(a.receiptId), fee_tx_hash: input.txHash, status: "fee_paid" });
      break;
    }
    case "leg_sent": {
      const l = leg(intent, input.legIndex);
      if (l.mode !== "SWAP" || l.status !== "quoted") throw new HttpError(409, "Leg isn't waiting for a swap tx");
      await setLeg(intent.id, l.leg_index, { tx_hash: input.txHash, status: "signed" });
      if (intent.status === "fee_paid" || intent.status === "created") await setIntent(intent.id, { status: "legs_running" });
      break;
    }
    case "leg": {
      const l = leg(intent, input.legIndex);
      if (l.mode !== "SWAP") throw new HttpError(409, "RFQ legs complete through /api/orders");
      if (l.status === "filled") break;
      if (l.tx_hash && l.tx_hash !== input.txHash) throw new HttpError(409, "A different transaction is recorded for this leg");
      let receipt: TransactionReceipt;
      try {
        receipt = await receiptFor(input.txHash, wallet);
      } catch (e) {
        if (e instanceof HttpError && e.code === "reverted") await failLeg(intent, l.leg_index, "Swap transaction reverted");
        throw e;
      }
      void receipt;
      const delta = (await balanceOf(wallet, l.to_token)) - BigInt(l.balance_before ?? "0");
      const minOut = BigInt(l.min_out ?? "0");
      if (delta <= 0n) {
        await failLeg(intent, l.leg_index, `Swap confirmed but no tokens arrived at ${wallet}. Stopping.`);
        throw new HttpError(422, "Swap confirmed but tokens didn't arrive at your wallet");
      }
      if (delta < minOut) {
        await failLeg(intent, l.leg_index, `Received ${delta} below minimum ${minOut}`);
        throw new HttpError(422, "Received less than the minimum");
      }
      await setLeg(intent.id, l.leg_index, { status: "filled", actual_out: delta.toString(), tx_hash: input.txHash, error: null });
      await afterLegFilled(ctx, intent.id);
      break;
    }
    case "resubmit":
      await resubmitSigned(ctx, intent, input.legIndex);
      break;
    case "release": {
      if (intent.kind !== "sell_stack" && intent.kind !== "redeem") throw new HttpError(409, "Nothing to release");
      if (intent.released_amounts) break;
      const receipt = await receiptFor(input.txHash, wallet);
      const ev = vaultEvents(receipt).find((e) => e.eventName === "PositionReleased");
      if (!ev || ev.eventName !== "PositionReleased") throw new HttpError(422, "No PositionReleased event in that transaction");
      const a = ev.args;
      const purpose = intent.kind === "redeem" ? 0 : 1;
      if (Number(a.positionId) !== intent.position_id || getAddress(a.owner) !== wallet || a.bps !== intent.bps || a.purpose !== purpose) {
        throw new HttpError(422, "Release doesn't match this intent");
      }
      const amounts = a.amounts.map((x) => x.toString());
      await setIntent(intent.id, { release_tx_hash: input.txHash, released_amounts: amounts });
      await syncTx(input.txHash).catch(() => undefined);
      if (intent.kind === "redeem") {
        await setIntent(intent.id, { status: "done" });
      } else {
        for (const l of intent.legs) {
          const amt = amounts[l.leg_index] ?? "0";
          await setLeg(intent.id, l.leg_index, amt === "0" ? { amount_in: "0", status: "skipped" } : { amount_in: amt });
        }
        await setIntent(intent.id, { status: "legs_running" });
      }
      break;
    }
    case "deposit": {
      if (intent.kind !== "buy_stack") throw new HttpError(409, "Only basket buys deposit");
      if (intent.legs.some((l) => l.status !== "filled")) throw new HttpError(409, "Every leg must be filled before depositing");
      const receipt = await receiptFor(input.txHash, wallet);
      const ev = vaultEvents(receipt).find((e) => e.eventName === "PositionOpened");
      if (!ev || ev.eventName !== "PositionOpened") throw new HttpError(422, "No PositionOpened event in that transaction");
      const a = ev.args;
      const expected = intent.legs.map((l) => BigInt(l.actual_out!));
      if (
        getAddress(a.owner) !== wallet ||
        Number(a.stackId) !== intent.stack_id ||
        Number(a.feeReceiptId) !== intent.fee_receipt_id ||
        a.amounts.length !== expected.length ||
        a.amounts.some((x, i) => x !== expected[i])
      ) {
        throw new HttpError(422, "Deposit doesn't match this intent");
      }
      await setIntent(intent.id, { deposit_tx_hash: input.txHash, position_id: Number(a.positionId), status: "done" });
      await recordTrade(ctx, { ...intent, position_id: Number(a.positionId) }, "buy");
      await syncTx(input.txHash).catch(() => undefined);
      break;
    }
    case "sell_fee": {
      if (intent.kind !== "sell_stock" && intent.kind !== "sell_stack") throw new HttpError(409, "No sell fee on this intent");
      const proceeds = intent.legs.reduce((s, l) => s + BigInt(l.actual_out ?? "0"), 0n);
      const receipt = await receiptFor(input.txHash, wallet);
      const ev = vaultEvents(receipt).find((e) => e.eventName === "SellFeePaid");
      if (!ev || ev.eventName !== "SellFeePaid") throw new HttpError(422, "No SellFeePaid event in that transaction");
      const a = ev.args;
      if (getAddress(a.payer) !== wallet || a.proceeds !== proceeds || Number(a.positionId) !== (intent.position_id ?? 0)) {
        throw new HttpError(422, "Sell fee doesn't match the proceeds");
      }
      await setIntent(intent.id, { sell_fee_tx_hash: input.txHash, status: "done" });
      await recordTrade(ctx, intent, "sell");
      await syncTx(input.txHash).catch(() => undefined);
      break;
    }
    case "retry": {
      const l = leg(intent, input.legIndex);
      if (!["failed", "expired", "quoted"].includes(l.status)) throw new HttpError(409, `Can't retry a ${l.status} leg`);
      await setLeg(intent.id, l.leg_index, {
        status: "pending",
        attempt: l.attempt + 1,
        error: null,
        tx_hash: null,
        order_id: null,
        rfq_quote_id: null,
        signature: null,
      });
      await setIntent(intent.id, { status: intent.fee_receipt_id || intent.released_amounts ? "legs_running" : "created", error: null });
      break;
    }
    case "cancel": {
      if (intent.legs.some((l) => l.status === "submitted" || l.status === "signed")) {
        throw new HttpError(409, "An order is still settling. Wait for it before stopping.");
      }
      await setIntent(intent.id, { status: "cancelled" });
      // Tokens already bought stay in the wallet and count as single stock holdings.
      if (intent.kind === "buy_stack") await recordLegTrades(ctx, intent);
      break;
    }
  }
  return loadIntent(id, ctx);
}

async function afterLegFilled(ctx: AuthContext, intentId: string) {
  const intent = await loadIntent(intentId, ctx);
  const allDone = intent.legs.every((l) => l.status === "filled" || l.status === "skipped");
  if (!allDone) return;
  if (intent.kind === "buy_stock") {
    await setIntent(intent.id, { status: "done" });
    await recordTrade(ctx, intent, "buy");
  } else {
    await setIntent(intent.id, { status: "legs_done" });
  }
}

// ---------------------------------------------------------------------------
// Trades and activity (confirmed fills only)
// ---------------------------------------------------------------------------

async function priceOf(address: string): Promise<AssetRow & { price_usd: string | null }> {
  const a = must(await db().from("assets").select("*").eq("address", getAddress(address)).single()) as AssetRow;
  const p = must(await db().from("asset_prices").select("price_usd").eq("address", a.address).maybeSingle()) as { price_usd: string | null } | null;
  return { ...a, price_usd: p?.price_usd ?? null };
}

async function recordTrade(ctx: AuthContext, intent: IntentWithLegs, side: "buy" | "sell") {
  const dec = await getUsdtDecimals();
  const toUsd = (raw: bigint) => Number(raw) / 10 ** dec;
  const profileId = ctx.profile!.id;

  if (intent.kind === "buy_stock") {
    const l = intent.legs[0]!;
    const asset = await priceOf(l.to_token);
    const units = BigInt(l.actual_out!);
    const usd = toUsd(BigInt(intent.gross_amount!));
    const price = usd / (Number(units) / 10 ** asset.decimals);
    await db().from("trades").upsert(
      { profile_id: profileId, intent_id: intent.id, side, asset_address: asset.address, usd_amount: usd, units: units.toString(), price_usd: price, tx_hash: l.tx_hash },
      { onConflict: "intent_id,side,asset_address,stack_id", ignoreDuplicates: true },
    );
    await db().from("activity").upsert(
      { profile_id: profileId, type: "buy", target_type: "asset", target_id: asset.address, usd_amount: usd, tx_hash: intent.fee_tx_hash },
      { onConflict: "tx_hash,type", ignoreDuplicates: true },
    );
  } else if (intent.kind === "buy_stack") {
    await db().from("trades").insert({
      profile_id: profileId,
      intent_id: intent.id,
      side,
      stack_id: intent.stack_id,
      position_id: intent.position_id,
      usd_amount: toUsd(BigInt(intent.gross_amount!)),
      tx_hash: intent.deposit_tx_hash,
    });
  } else if (intent.kind === "sell_stock") {
    const l = intent.legs[0]!;
    const asset = await priceOf(l.from_token);
    const proceeds = toUsd(BigInt(l.actual_out!));
    const units = BigInt(l.amount_in);
    await db().from("trades").insert({
      profile_id: profileId,
      intent_id: intent.id,
      side,
      asset_address: asset.address,
      usd_amount: proceeds,
      units: units.toString(),
      price_usd: proceeds / (Number(units) / 10 ** asset.decimals),
      tx_hash: l.tx_hash,
    });
  } else if (intent.kind === "sell_stack") {
    const proceeds = intent.legs.reduce((s, l) => s + BigInt(l.actual_out ?? "0"), 0n);
    await db().from("trades").insert({
      profile_id: profileId,
      intent_id: intent.id,
      side,
      stack_id: intent.stack_id,
      position_id: intent.position_id,
      usd_amount: toUsd(proceeds),
      tx_hash: intent.sell_fee_tx_hash,
    });
  }
}

/** Stopped Stack buy: each filled leg becomes a single stock buy at its share of the gross. */
async function recordLegTrades(ctx: AuthContext, intent: IntentWithLegs) {
  const dec = await getUsdtDecimals();
  const gross = BigInt(intent.gross_amount ?? "0");
  const net = intent.legs.reduce((s, l) => s + BigInt(l.amount_in), 0n);
  for (const l of intent.legs.filter((x) => x.status === "filled")) {
    const asset = await priceOf(l.to_token);
    const share = net > 0n ? (gross * BigInt(l.amount_in)) / net : 0n;
    const usd = Number(share) / 10 ** dec;
    const units = BigInt(l.actual_out!);
    await db().from("trades").upsert({
      profile_id: ctx.profile!.id,
      intent_id: intent.id,
      side: "buy",
      asset_address: asset.address,
      usd_amount: usd,
      units: units.toString(),
      price_usd: usd / (Number(units) / 10 ** asset.decimals),
      tx_hash: l.tx_hash,
    });
  }
}

export async function activeIntents(ctx: AuthContext): Promise<IntentWithLegs[]> {
  if (!ctx.profile) return [];
  const rows = must(
    await db()
      .from("intents")
      .select("id")
      .eq("profile_id", ctx.profile.id)
      .not("status", "in", "(done,cancelled,failed)")
      .order("created_at", { ascending: false })
      .limit(5),
  ) as { id: string }[];
  return Promise.all(rows.map((r) => loadIntent(r.id, ctx).catch(() => null))).then((x) => x.filter((i): i is IntentWithLegs => !!i));
}
