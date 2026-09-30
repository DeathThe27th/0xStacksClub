import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { USDT_ADDRESS } from "@/lib/constants";
import { requireProfile } from "@/server/auth";
import { requireTradable } from "@/server/assets/store";
import { BinanceError, getQuote } from "@/server/binance";
import { handler, HttpError, json, readJson, softRateLimit } from "@/server/http";
import { getUsdtDecimals, loadIntent, quoteLeg } from "@/server/intents";
import { requireFairQuote } from "@/server/priceGuard";

const body = z.union([
  // Execute a leg of an intent: from/to/amount come from the server-computed leg.
  z.object({ intentId: z.string().uuid(), legIndex: z.number().int().min(0).max(4) }),
  // Preview for the review step: fresh expected/min out, nothing to sign.
  z.object({ from: z.string(), to: z.string(), amount: z.string().regex(/^\d+$/) }),
]);

export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req, { cachedProfile: true });
  softRateLimit(`quote:${ctx.profile.id}`, 60, 60);
  const b = await readJson(req, body);

  if ("intentId" in b) {
    const intent = await loadIntent(b.intentId, ctx);
    return json(await quoteLeg(ctx, intent, b.legIndex));
  }

  if (!isAddress(b.from) || !isAddress(b.to)) throw new HttpError(400, "Bad token address");
  const from = getAddress(b.from);
  const to = getAddress(b.to);
  // Both sides must be USDT or an allowlisted, tradable asset. Never an arbitrary token.
  if (from !== USDT_ADDRESS && to !== USDT_ADDRESS) throw new HttpError(400, "One side must be USDT");
  if (from === to) throw new HttpError(400, "One side must be a stock");
  const buying = from === USDT_ADDRESS;
  const asset = await requireTradable(buying ? to : from, "trade").catch((e) => {
    throw new HttpError(422, (e as Error).message);
  });

  try {
    const routes = await getQuote({ from, to, amount: BigInt(b.amount), userAddress: ctx.wallet });
    const best = routes.find((r) => r.isBest) ?? routes[0];
    if (!best) throw new HttpError(422, "No route right now");
    const amount = BigInt(b.amount);
    await requireFairQuote({
      side: buying ? "buy" : "sell",
      asset,
      usdtRaw: buying ? amount : BigInt(best.toTokenAmount),
      usdtDecimals: await getUsdtDecimals(),
      tokenRaw: buying ? BigInt(best.toTokenAmount) : amount,
    });
    return json({
      mode: best.executionMode,
      vendor: best.vendorName,
      expectedOut: best.toTokenAmount,
      minOut: ((BigInt(best.toTokenAmount) * 99n) / 100n).toString(),
      priceImpactPercent: best.priceImpactPercent ?? null,
      estimateGasWei: best.estimateGasFee ?? null,
      quotedAt: Date.now(),
      expiresAt: Date.now() + 30_000,
    });
  } catch (e) {
    if (e instanceof BinanceError && e.code) throw new HttpError(422, e.message, `binance_${e.code}`);
    throw e;
  }
});
