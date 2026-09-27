import { getAddress } from "viem";
import { z } from "zod";
import { getAsset } from "@/server/assets/store";
import { getCandles, type CandleBar } from "@/server/binance";
import { handler, HttpError, json } from "@/server/http";

// UI timeframes -> Binance bars (lowercase per docs/binance-notes.md §4)
const bars: Record<string, { bar: CandleBar; limit: number; cache: number }> = {
  "1m": { bar: "1m", limit: 60, cache: 5 },
  "5m": { bar: "5m", limit: 288, cache: 60 },
  "1H": { bar: "1h", limit: 168, cache: 60 },
  "1D": { bar: "1d", limit: 365, cache: 60 },
  "1W": { bar: "1w", limit: 200, cache: 60 },
};

const query = z.object({
  address: z.string(),
  bar: z.enum(["1m", "5m", "1H", "1D", "1W"]).default("5m"),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export const GET = handler(async (req: Request) => {
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const asset = await getAsset(getAddress(q.address)).catch(() => null);
  if (!asset) throw new HttpError(404, "Unknown asset"); // only allowlisted catalog tokens
  const cfg = bars[q.bar]!;
  const candles = await getCandles(asset.address, cfg.bar, q.limit ?? cfg.limit);
  return json({ bar: q.bar, candles }, { cacheSeconds: cfg.cache });
});
