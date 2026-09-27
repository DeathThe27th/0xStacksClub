import type { AssetPriceRow, AssetRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";
import { handler, json } from "@/server/http";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ ticker: string }> }) => {
  const { ticker } = await params;
  const assets = must(await db().from("assets").select("*").eq("ticker", ticker.toUpperCase())) as AssetRow[];
  const prices = assets.length
    ? (must(await db().from("asset_prices").select("*").in("address", assets.map((a) => a.address))) as AssetPriceRow[])
    : [];
  const rows = assets.map((a) => {
    const p = prices.find((x) => x.address === a.address);
    const price = p?.price_usd ? Number(p.price_usd) : null;
    const ref = p?.reference_price_usd ? Number(p.reference_price_usd) : null;
    const mult = a.share_multiplier ? Number(a.share_multiplier) : null;
    const perShare = price !== null && mult ? price / mult : price;
    return {
      provider: a.provider,
      address: a.address,
      symbol: a.symbol,
      logoUrl: a.logo_url,
      canTrade: a.can_trade,
      price,
      perSharePrice: perShare,
      volume24h: p?.volume_24h ? Number(p.volume_24h) : null,
      premiumPct: perShare !== null && ref ? (perShare / ref - 1) * 100 : null,
    };
  });
  // "Cheaper" compares per-share prices so different share ratios are comparable.
  const priced = rows.filter((r) => r.perSharePrice !== null);
  const cheapest = priced.length > 1 ? priced.reduce((a, b) => (a.perSharePrice! <= b.perSharePrice! ? a : b)).address : null;
  return json({ ticker: ticker.toUpperCase(), providers: rows.map((r) => ({ ...r, cheapest: r.address === cheapest })) }, { cacheSeconds: 10 });
});
