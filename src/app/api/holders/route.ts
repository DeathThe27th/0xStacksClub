import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { scaledToNumber, valueUsdScaled } from "@/lib/math";
import type { AssetPriceRow, AssetRow, PublicProfile } from "@/lib/supabase/types";
import { maybeAuthenticate } from "@/server/auth";
import { db, must } from "@/server/db";
import { handler, HttpError, json } from "@/server/http";
import { getUsdtDecimals } from "@/server/intents";
import { valuePositions } from "@/server/portfolio";
import { listHolders } from "@/server/social";
import { readPositionsOf } from "@/server/vault";

const query = z.object({ targetType: z.enum(["asset", "stack"]), targetId: z.string() });

/** StacksClub users holding a stock or Stack (from confirmed trades), valued at current marks. */
export const GET = handler(async (req: Request) => {
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const ctx = await maybeAuthenticate(req);
  const viewer = ctx?.profile?.id ?? null;

  if (q.targetType === "asset") {
    if (!isAddress(q.targetId)) throw new HttpError(400, "Bad address");
    const addr = getAddress(q.targetId);
    const asset = must(await db().from("assets").select("*").eq("address", addr).maybeSingle()) as AssetRow | null;
    if (!asset) throw new HttpError(404, "Unknown asset");
    const price = must(await db().from("asset_prices").select("*").eq("address", addr).maybeSingle()) as AssetPriceRow | null;
    const items = await listHolders({ type: "asset", id: addr }, viewer, (h) =>
      price?.price_usd ? scaledToNumber(valueUsdScaled(BigInt(String(h.net_units).split(".")[0]!), asset.decimals, price.price_usd)) : null,
    );
    return json({ items });
  }

  // Stack: value each holder's open positions in this Stack from chain.
  const stackId = Number(q.targetId);
  const base = await listHolders({ type: "stack", id: String(stackId) }, viewer, () => null);
  if (!base.length) return json({ items: [] });
  const wallets = must(await db().from("public_profiles").select("id, wallet_address").in("id", base.map((h) => h.profile.id))) as Pick<
    PublicProfile,
    "id" | "wallet_address"
  >[];
  const assets = must(await db().from("assets").select("*")) as AssetRow[];
  const prices = must(await db().from("asset_prices").select("*")) as AssetPriceRow[];
  const priceBy = new Map(prices.map((p) => [p.address, p]));
  const dec = await getUsdtDecimals();
  const items = [];
  for (const h of base) {
    const w = wallets.find((x) => x.id === h.profile.id);
    const positions = w ? (await readPositionsOf(getAddress(w.wallet_address))).filter((p) => p.stackId === stackId) : [];
    if (!positions.length) continue; // fully sold or redeemed
    const valued = await valuePositions(positions, assets, priceBy, dec);
    const value = valued.every((v) => v.valueUsd !== null) ? valued.reduce((s, v) => s + v.valueUsd!, 0) : null;
    const basis = valued.reduce((s, v) => s + v.costBasisUsd, 0);
    items.push({ ...h, valueUsd: value, costBasisUsd: basis, pnlPct: value !== null && basis > 0 ? ((value - basis) / basis) * 100 : null });
  }
  return json({ items });
});
