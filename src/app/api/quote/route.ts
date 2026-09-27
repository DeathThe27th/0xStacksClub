import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { USDT_ADDRESS } from "@/lib/constants";
import { requireProfile } from "@/server/auth";
import { requireTradable } from "@/server/assets/store";
import { BinanceError, getQuote } from "@/server/binance";
import { handler, HttpError, json, rateLimit, readJson } from "@/server/http";
import { loadIntent, quoteLeg } from "@/server/intents";

const body = z.union([
  // Execute a leg of an intent: from/to/amount come from the server-computed leg.
  z.object({ intentId: z.string().uuid(), legIndex: z.number().int().min(0).max(4) }),
  // Preview for the review step: fresh expected/min out, nothing to sign.
  z.object({ from: z.string(), to: z.string(), amount: z.string().regex(/^\d+$/) }),
]);

export const POST = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  await rateLimit(`quote:${ctx.profile.id}`, 60, 60);
  const b = await readJson(req, body);

  if ("intentId" in b) {
    const intent = await loadIntent(b.intentId, ctx);
    return json(await quoteLeg(ctx, intent, b.legIndex));
  }

  if (!isAddress(b.from) || !isAddress(b.to)) throw new HttpError(400, "Bad token address");
  const from = getAddress(b.from);
  const to = getAddress(b.to);
  // Both sides must be USDT or an allowlisted, tradable asset. Never an arbitrary token.
  if (from !== USDT_ADDRESS) await requireTradable(from, "trade").catch((e) => { throw new HttpError(422, (e as Error).message); });
  if (to !== USDT_ADDRESS) await requireTradable(to, "trade").catch((e) => { throw new HttpError(422, (e as Error).message); });
  if (from !== USDT_ADDRESS && to !== USDT_ADDRESS) throw new HttpError(400, "One side must be USDT");

  try {
    const routes = await getQuote({ from, to, amount: BigInt(b.amount), userAddress: ctx.wallet });
    const best = routes.find((r) => r.isBest) ?? routes[0];
    if (!best) throw new HttpError(422, "No route right now");
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
