import "server-only";
import { createViemAccount } from "@privy-io/node/viem";
import { createWalletClient, erc20Abi, http, parseUnits, type Address } from "viem";
import { bsc } from "viem/chains";
import { BOT_ORDER_TTL_MS, FEE_BPS, MIN_BUY_USD_LARGE, MIN_BUY_USD_SMALL, USDT_ADDRESS } from "@/lib/constants";
import { serverEnv } from "@/lib/env";
import type { Intent } from "@/lib/client/types";
import { createRunner, gasUnits, StopError, type Backend, type QuoteResponse, type Signer } from "@/lib/runner";
import { signableWallet, tradeSettings, tradingConfigured, type BotUser } from "@/server/assistant";
import { privyClient, type AuthContext } from "@/server/auth";
import { botLookup } from "@/server/bot";
import { publicClient, readErc20Balances } from "@/server/chain";
import { db, must } from "@/server/db";
import { HttpError } from "@/server/http";
import { advanceIntent, createIntent, getUsdtDecimals, legApprovals, loadIntent, pollOrder, quoteLeg, submitOrder, type AdvanceInput } from "@/server/intents";
import { requireVault } from "@/server/vault";

// Buys made by text. The user turned this on in the app, added our signer to their embedded wallet
// and set limits. A buy is two messages: the request creates a pending order and tells the user
// exactly what would be bought; only their "yes" runs it. The run is the same state machine the
// browser uses (src/lib/runner.ts) against the same server checks, with the wallet signing through
// Privy instead of the browser. Nothing here can sell, withdraw or send funds anywhere else.

type OrderRow = {
  id: string;
  profile_id: string;
  channel: string;
  kind: "buy_stock" | "buy_stack";
  asset_address: string | null;
  stack_id: number | null;
  label: string;
  usd: string;
  status: "pending" | "running" | "done" | "failed";
  intent_id: string | null;
  error: string | null;
  created_at: string;
  expires_at: string;
};

const appUrl = (path: string) => new URL(path, serverEnv().NEXT_PUBLIC_APP_URL).toString();

/** USD already committed by text buys in the last 24 hours (running, done, or failed after money moved). */
async function spentToday(profileId: string): Promise<number> {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const rows = must(await db().from("bot_orders").select("usd, status, intent_id").eq("profile_id", profileId).gte("created_at", since)) as Pick<OrderRow, "usd" | "status" | "intent_id">[];
  return rows.filter((r) => r.status === "running" || r.status === "done" || (r.status === "failed" && r.intent_id)).reduce((s, r) => s + Number(r.usd), 0);
}

const serverRunner = () =>
  createRunner({
    vault: requireVault,
    chain: {
      waitReceipt: (hash) => publicClient().waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 500 }),
      pendingNonce: (address) => publicClient().getTransactionCount({ address, blockTag: "pending" }),
      allowance: (token, owner, spender) => publicClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] }),
      gasPrice: () => publicClient().getGasPrice(),
    },
  });

/** A signer for the user's embedded wallet, authorized by our key. Only ever built after signableWallet() said yes. */
function privySigner(wallet: { id: string; address: Address }): Signer {
  const raw = serverEnv().PRIVY_SIGNER_PRIVATE_KEY!;
  // The dashboard shows the key as "wallet-auth:<base64>"; the SDK wants the base64 part.
  const key = raw.replace(/^wallet-auth:/, "").trim();
  const account = createViemAccount(privyClient(), { walletId: wallet.id, address: wallet.address, authorizationContext: { authorization_private_keys: [key] } });
  const client = createWalletClient({ account, chain: bsc, transport: http(serverEnv().BSC_RPC_URL) });
  return {
    address: wallet.address,
    sendTransaction: async (tx) =>
      client.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ?? 0n, gas: tx.gas, nonce: tx.nonce, type: "legacy", gasPrice: await publicClient().getGasPrice() }),
    signTypedData: (p) => {
      const { EIP712Domain: _d, ...types } = p.types;
      void _d;
      // Types come from Binance at runtime, so they can't be statically typed here.
      const args = { domain: p.domain, types, primaryType: p.primaryType, message: p.message };
      return account.signTypedData(args as unknown as Parameters<typeof account.signTypedData>[0]);
    },
  };
}

export type PrepareResult =
  | { status: "ready"; orderId: string; kind: "stock" | "basket"; name: string; ticker: string; amountUsd: number; feeUsd: number; usdtBalance: number; marketClosed: boolean; expiresInSec: number }
  | { status: "not_enabled"; url: string }
  | { status: "unavailable" }
  | { status: "wallet"; reason: "external" | "not_delegated"; url: string }
  | { status: "over_cap"; capUsd: number; url: string }
  | { status: "over_daily"; leftUsd: number; dailyUsd: number }
  | { status: "below_min"; minUsd: number; name: string }
  | { status: "no_usdt"; usdtBalance: number; amountUsd: number }
  | { status: "no_gas"; url: string }
  | { status: "not_tradable"; name: string }
  | { status: "busy" }
  | { status: "bad_amount" }
  | { status: "many"; options: { kind: "stock" | "basket"; ticker: string; name: string }[] }
  | { status: "none" };

/** Step one: check everything and park the order. Nothing is signed or spent here. */
export async function prepareBuy(user: BotUser, query: string, amount: number, channel: string): Promise<PrepareResult> {
  const settingsUrl = appUrl(`/app/u/${user.profile.username}`);
  if (!tradingConfigured()) return { status: "unavailable" };
  const settings = await tradeSettings(user.profile.id);
  if (!settings.enabled) return { status: "not_enabled", url: settingsUrl };
  if (!Number.isFinite(amount) || amount <= 0) return { status: "bad_amount" };
  const usd = Math.round(amount * 100) / 100;
  if (usd > settings.capUsd) return { status: "over_cap", capUsd: settings.capUsd, url: settingsUrl };

  const found = await botLookup(query);
  if (found.match === "none") return { status: "none" };
  if (found.match === "many") return { status: "many", options: found.options };
  const target =
    found.match === "stock"
      ? { kind: "stock" as const, name: found.stock.name, ticker: found.stock.ticker, address: found.stock.address, stackId: null, legs: 1, tradable: found.stock.canTrade, closed: found.stock.marketOpen === false }
      : {
          kind: "basket" as const,
          name: found.basket.name,
          ticker: found.basket.ticker,
          address: null,
          stackId: found.basket.id,
          legs: found.basket.components.length,
          tradable: true,
          closed: found.basket.components.some((c) => c.marketOpen === false),
        };
  if (!target.tradable) return { status: "not_tradable", name: target.ticker };
  const minUsd = target.legs >= 4 ? MIN_BUY_USD_LARGE : MIN_BUY_USD_SMALL;
  if (usd < minUsd) return { status: "below_min", minUsd, name: target.name };

  const spent = await spentToday(user.profile.id);
  if (spent + usd > settings.dailyUsd) return { status: "over_daily", leftUsd: Math.max(0, Math.round((settings.dailyUsd - spent) * 100) / 100), dailyUsd: settings.dailyUsd };

  const wallet = await signableWallet(user.profile.privy_id, user.wallet);
  if (typeof wallet === "string") return { status: "wallet", reason: wallet, url: settingsUrl };

  const dec = await getUsdtDecimals();
  const [balances, bnb, gasPrice] = await Promise.all([readErc20Balances(user.wallet, [USDT_ADDRESS]), publicClient().getBalance({ address: user.wallet }), publicClient().getGasPrice()]);
  const usdt = Number(balances.get(USDT_ADDRESS) ?? 0n) / 10 ** dec;
  if (usdt < usd) return { status: "no_usdt", usdtBalance: Math.floor(usdt * 100) / 100, amountUsd: usd };
  const kind = target.kind === "stock" ? "buy_stock" : "buy_stack";
  if (bnb < (gasPrice * gasUnits(kind, target.legs) * 3n) / 2n) return { status: "no_gas", url: settingsUrl };

  const running = must(
    await db().from("bot_orders").select("id").eq("profile_id", user.profile.id).eq("status", "running").gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1),
  ) as unknown[];
  if (running.length) return { status: "busy" };

  // One pending order at a time: a new request replaces the last unanswered one.
  must(await db().from("bot_orders").delete().eq("profile_id", user.profile.id).eq("status", "pending"));
  const order = must(
    await db()
      .from("bot_orders")
      .insert({
        profile_id: user.profile.id,
        channel,
        kind,
        asset_address: target.address,
        stack_id: target.stackId,
        label: target.kind === "stock" ? target.ticker : target.name,
        usd,
        expires_at: new Date(Date.now() + BOT_ORDER_TTL_MS).toISOString(),
      })
      .select("id")
      .single(),
  ) as { id: string };
  return {
    status: "ready",
    orderId: order.id,
    kind: target.kind,
    name: target.name,
    ticker: target.ticker,
    amountUsd: usd,
    feeUsd: Math.round((usd * Number(FEE_BPS)) / 100) / 100,
    usdtBalance: Math.floor(usdt * 100) / 100,
    marketClosed: target.closed,
    expiresInSec: BOT_ORDER_TTL_MS / 1000,
  };
}

export type ConfirmResult =
  | { status: "done"; label: string; amountUsd: number; url: string; positionId: number | null }
  | { status: "failed"; label: string; amountUsd: number; error: string; feePaid: boolean; url: string }
  | { status: "expired" }
  | { status: "nothing" };

/** Step two, only after the user's "yes": run the parked order. Re-checks the limits and the wallet. */
export async function confirmBuy(user: BotUser, orderId?: string): Promise<ConfirmResult> {
  let q = db().from("bot_orders").select("*").eq("profile_id", user.profile.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1);
  if (orderId) q = q.eq("id", orderId);
  const order = (must(await q) as OrderRow[])[0];
  if (!order) return { status: "nothing" };
  if (new Date(order.expires_at).getTime() < Date.now()) {
    must(await db().from("bot_orders").delete().eq("id", order.id));
    return { status: "expired" };
  }
  // Claim it: only one request can move it from pending to running.
  const claimed = must(await db().from("bot_orders").update({ status: "running" }).eq("id", order.id).eq("status", "pending").select("id")) as unknown[];
  if (!claimed.length) return { status: "nothing" };

  const usd = Number(order.usd);
  const url = appUrl(`/app/u/${user.profile.username}`);
  const fail = async (error: string, intentId: string | null, feePaid: boolean): Promise<ConfirmResult> => {
    must(await db().from("bot_orders").update({ status: "failed", error: error.slice(0, 300), intent_id: intentId }).eq("id", order.id));
    return { status: "failed", label: order.label, amountUsd: usd, error, feePaid, url };
  };

  let intentId: string | null = null;
  try {
    const settings = await tradeSettings(user.profile.id);
    if (!tradingConfigured() || !settings.enabled) return await fail("Text buys are turned off.", null, false);
    if (usd > settings.capUsd) return await fail("That is over your limit per buy.", null, false);
    // This order is already counted: it was claimed as running above.
    if ((await spentToday(user.profile.id)) > settings.dailyUsd) return await fail("That would go over your daily limit.", null, false);
    const wallet = await signableWallet(user.profile.privy_id, user.wallet);
    if (typeof wallet === "string") return await fail("This wallet hasn't given permission for text buys.", null, false);

    const ctx: AuthContext & { profile: NonNullable<AuthContext["profile"]> } = { privyId: user.profile.privy_id, wallet: user.wallet, wallets: [user.wallet], profile: user.profile };
    const gross = parseUnits(usd.toFixed(2), await getUsdtDecimals()).toString();
    const created = await createIntent(ctx, order.kind === "buy_stock" ? { kind: "buy_stock", assetAddress: order.asset_address!, grossAmount: gross } : { kind: "buy_stack", stackId: Number(order.stack_id), grossAmount: gross });
    const id = created.id;
    intentId = id;
    must(await db().from("bot_orders").update({ intent_id: id }).eq("id", order.id));

    // The same checks the API routes run, called directly instead of over HTTP.
    const backend: Backend = {
      load: async () => (await loadIntent(id, ctx)) as unknown as Intent,
      advance: async (input) => (await advanceIntent(ctx, id, input as AdvanceInput)) as unknown as Intent,
      quote: async (legIndex) => (await quoteLeg(ctx, await loadIntent(id, ctx), legIndex)) as QuoteResponse,
      submitOrder: async (legIndex, signature) => submitOrder(ctx, await loadIntent(id, ctx), legIndex, signature),
      orderStatus: async (oid) => (await pollOrder(ctx, oid)).status,
      approvals: async () => legApprovals(ctx, await loadIntent(id, ctx)),
    };
    const final = await serverRunner().runIntent({ backend, signer: privySigner(wallet) });
    if (final.status !== "done") return await fail(final.error ?? `The buy stopped at "${final.status}".`, id, !!final.fee_receipt_id);
    must(await db().from("bot_orders").update({ status: "done" }).eq("id", order.id));
    return { status: "done", label: order.label, amountUsd: usd, url, positionId: final.position_id };
  } catch (e) {
    const feePaid = intentId ? !!(must(await db().from("intents").select("fee_receipt_id").eq("id", intentId).maybeSingle()) as { fee_receipt_id: number | null } | null)?.fee_receipt_id : false;
    const message = e instanceof StopError || e instanceof HttpError ? e.message : ((e as { shortMessage?: string }).shortMessage ?? "Something went wrong while buying.");
    if (!(e instanceof StopError) && !(e instanceof HttpError)) console.error("[bot-trade]", e instanceof Error ? e.message.split("\n")[0] : e);
    return fail(message, intentId, feePaid);
  }
}
