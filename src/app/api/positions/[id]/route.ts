import type { AssetPriceRow, AssetRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";
import { handler, HttpError, json } from "@/server/http";
import { getUsdtDecimals } from "@/server/intents";
import { valuePositions } from "@/server/portfolio";
import { readPosition } from "@/server/vault";

/** Position detail straight from the contract, valued at current marks. */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "Bad position id");
  const p = await readPosition(id);
  if (!p) throw new HttpError(404, "Position not found");
  const assets = must(await db().from("assets").select("*").in("address", p.assets)) as AssetRow[];
  const prices = must(await db().from("asset_prices").select("*").in("address", p.assets)) as AssetPriceRow[];
  const [out] = await valuePositions([p], assets, new Map(prices.map((x) => [x.address, x])), await getUsdtDecimals());
  return json({ ...out, owner: p.owner, closed: p.owner === null });
});
