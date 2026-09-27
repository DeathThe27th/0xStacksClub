import { isAddress } from "viem";
import { getAsset } from "@/server/assets/store";
import { getRwaUnderlyingMarket } from "@/server/binance";
import { handler, HttpError, json } from "@/server/http";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ provider: string; address: string }> }) => {
  const { provider, address } = await params;
  if (!isAddress(address, { strict: false })) throw new HttpError(400, "Bad address");
  const asset = await getAsset(address);
  if (!asset || asset.provider !== provider) throw new HttpError(404, "Asset not found");

  let underlying = null;
  try {
    underlying = await getRwaUnderlyingMarket(asset.address);
  } catch {
    underlying = null; // optional enrichment; price data still comes from our cache
  }
  const price = asset.price?.price_usd ? Number(asset.price.price_usd) : null;
  const reference = asset.price?.reference_price_usd ? Number(asset.price.reference_price_usd) : null;
  const multiplier = asset.share_multiplier ? Number(asset.share_multiplier) : null;
  // Premium: onchain token price vs the per-share reference price, adjusted by the share ratio.
  const perShare = price !== null && multiplier ? price / multiplier : price;
  const premium = perShare !== null && reference ? (perShare / reference - 1) * 100 : null;

  return json(
    {
      asset,
      price,
      referencePrice: reference,
      premiumPct: premium,
      change24h: asset.price?.change_24h ? Number(asset.price.change_24h) : null,
      marketCap: asset.price?.market_cap ? Number(asset.price.market_cap) : null,
      volume24h: asset.price?.volume_24h ? Number(asset.price.volume_24h) : null,
      marketOpen: underlying?.statusInfo?.openState ?? asset.price?.market_open ?? null,
      marketStatus: underlying?.statusInfo?.marketStatus ?? asset.price?.market_status ?? null,
      nextOpenTime: underlying?.statusInfo?.nextOpenTime ? Number(underlying.statusInfo.nextOpenTime) : null,
      underlying: underlying?.marketData ?? null,
    },
    { cacheSeconds: 5 },
  );
});
