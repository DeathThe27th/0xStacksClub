import "server-only";
import type { AssetRow } from "@/lib/supabase/types";
import { checkQuotePrice, MAX_PRICE_DEVIATION_PCT } from "@/lib/priceGuard";
import { getRwaPrices } from "@/server/binance";
import { db, must } from "@/server/db";
import { HttpError } from "@/server/http";

const CACHE_MAX_AGE_MS = 30 * 60_000;

/** Fresh per-token market price from Binance, falling back to a recent cached price. */
async function fairPriceUsd(asset: AssetRow): Promise<number | null> {
  try {
    const [p] = await getRwaPrices([asset.address]);
    const token = Number(p?.tokenPrice);
    if (token > 0) return token;
    const ref = Number(p?.referencePrice) * Number(asset.share_multiplier ?? 1);
    if (ref > 0) return ref;
  } catch {
    /* fall through to the cache */
  }
  const c = must(await db().from("asset_prices").select("price_usd, updated_at").eq("address", asset.address).maybeSingle()) as { price_usd: string | null; updated_at: string } | null;
  if (c?.price_usd && Date.now() - new Date(c.updated_at).getTime() < CACHE_MAX_AGE_MS) return Number(c.price_usd);
  return null;
}

/**
 * Throws 422 before anything is signed when a quote fills more than MAX_PRICE_DEVIATION_PCT worse
 * than the market price. Protects against thin-pool routes that slippage limits can't catch.
 */
export async function requireFairQuote(p: { side: "buy" | "sell"; asset: AssetRow; usdtRaw: bigint; usdtDecimals: number; tokenRaw: bigint }) {
  const fair = await fairPriceUsd(p.asset);
  if (fair === null) throw new HttpError(422, `Couldn't check the market price for ${p.asset.ticker} right now. Try again in a moment.`, "no_fair_price");
  const r = checkQuotePrice({ side: p.side, usdtRaw: p.usdtRaw, usdtDecimals: p.usdtDecimals, tokenRaw: p.tokenRaw, tokenDecimals: p.asset.decimals, fairUsd: fair });
  if (r.ok) return r;
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  throw new HttpError(
    422,
    `${p.asset.ticker} is only available at a bad price right now (${fmt(r.quotedUsd)} vs ${fmt(r.fairUsd)} market, over ${MAX_PRICE_DEVIATION_PCT}% off). Nothing was traded. Try again later.`,
    "bad_price",
  );
}
