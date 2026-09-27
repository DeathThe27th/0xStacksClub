import { z } from "zod";
import type { AssetPriceRow, AssetRow } from "@/lib/supabase/types";
import { maybeAuthenticate } from "@/server/auth";
import { listAssets, type AssetWithPrice } from "@/server/assets/store";
import { db, must } from "@/server/db";
import { handler, json } from "@/server/http";
import { friendsHolding } from "@/server/social";

const query = z.object({
  tab: z.enum(["stocks", "watchlist"]).default("stocks"),
  filter: z.enum(["trending", "most_held", "top_gainers", "bstock", "ondo"]).default("trending"),
  sort: z.enum(["change", "market_cap", "volume"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type AssetListItem = AssetRow & {
  price: AssetPriceRow | null;
  friends: { avatars: { id: string; username: string; avatar_url: string | null }[]; count: number } | null;
};

const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export const GET = handler(async (req: Request) => {
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const ctx = await maybeAuthenticate(req);
  let assets: AssetWithPrice[] = await listAssets();

  if (q.tab === "watchlist") {
    if (!ctx?.profile) return json({ items: [] });
    const wl = must(await db().from("watchlist").select("target_id").eq("profile_id", ctx.profile.id).eq("target_type", "asset")) as {
      target_id: string;
    }[];
    const set = new Set(wl.map((w) => w.target_id));
    assets = assets.filter((a) => set.has(a.address));
  } else {
    // Tradable first; browse-only tokens still listed for discovery.
    if (q.filter === "bstock" || q.filter === "ondo") assets = assets.filter((a) => a.provider === q.filter);
  }

  const holdCounts = new Map<string, number>();
  if (q.filter === "most_held" || q.filter === "trending") {
    const rows = must(await db().from("holders").select("target_id").eq("target_type", "asset")) as { target_id: string }[];
    for (const r of rows) holdCounts.set(r.target_id, (holdCounts.get(r.target_id) ?? 0) + 1);
  }

  const by = q.sort ?? (q.filter === "top_gainers" ? "change" : undefined);
  assets.sort((a, b) => {
    if (q.filter === "most_held") return (holdCounts.get(b.address) ?? 0) - (holdCounts.get(a.address) ?? 0) || cap(b) - cap(a);
    if (by === "change") return (num(b.price?.change_24h) ?? -1e9) - (num(a.price?.change_24h) ?? -1e9);
    if (by === "volume") return (num(b.price?.volume_24h) ?? 0) - (num(a.price?.volume_24h) ?? 0);
    if (by === "market_cap") return cap(b) - cap(a);
    // Trending: tradable, then volume; the same ticker from both providers sits side by side.
    return Number(b.can_trade) - Number(a.can_trade) || tickerVolume(assets, b) - tickerVolume(assets, a) || a.ticker.localeCompare(b.ticker) || (a.provider === "bstock" ? -1 : 1);
  });

  const friends = ctx?.profile ? await friendsHolding(ctx.profile.id, assets.map((a) => ({ type: "asset" as const, id: a.address }))) : null;
  const items: AssetListItem[] = assets.slice(0, q.limit).map((a) => ({ ...a, friends: friends?.get(`asset:${a.address}`) ?? null }));
  return json({ items }, { cacheSeconds: ctx ? undefined : 10 });
});

function cap(a: AssetWithPrice) {
  return num(a.price?.market_cap) ?? 0;
}
function tickerVolume(all: AssetWithPrice[], a: AssetWithPrice) {
  return all.filter((x) => x.ticker === a.ticker).reduce((s, x) => s + (num(x.price?.volume_24h) ?? 0), 0);
}
