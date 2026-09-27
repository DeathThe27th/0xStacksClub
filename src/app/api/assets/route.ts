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
  // "ticker": one row per stock (the Home list); "none": every provider token (lookups, Create Stack).
  group: z.enum(["ticker", "none"]).default("none"),
  // Home shows only stocks that can be bought; search and lookups see the whole catalog.
  tradable: z.enum(["0", "1"]).default("0"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type AssetListItem = AssetRow & {
  providerCount: number;
  price: AssetPriceRow | null;
  friends: { avatars: { id: string; username: string; avatar_url: string | null }[]; count: number } | null;
};

const num = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export const GET = handler(async (req: Request) => {
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const ctx = await maybeAuthenticate(req);
  let assets: AssetWithPrice[] = await listAssets({ tradableOnly: q.tradable === "1" && q.tab === "stocks" });

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
    if (q.filter === "most_held") return tickerHolders(assets, holdCounts, b) - tickerHolders(assets, holdCounts, a) || cap(b) - cap(a);
    if (by === "change") return (num(b.price?.change_24h) ?? -1e9) - (num(a.price?.change_24h) ?? -1e9);
    if (by === "volume") return (num(b.price?.volume_24h) ?? 0) - (num(a.price?.volume_24h) ?? 0);
    if (by === "market_cap") return cap(b) - cap(a);
    // Trending: tradable, then volume; the same ticker from both providers sits side by side.
    return Number(b.can_trade) - Number(a.can_trade) || tickerVolume(assets, b) - tickerVolume(assets, a) || a.ticker.localeCompare(b.ticker) || (a.provider === "bstock" ? -1 : 1);
  });

  const friends = ctx?.profile ? await friendsHolding(ctx.profile.id, assets.map((a) => ({ type: "asset" as const, id: a.address }))) : null;
  const friendsOf = (a: AssetWithPrice) => friends?.get(`asset:${a.address}`) ?? null;

  let items: AssetListItem[];
  if (q.group === "ticker") {
    // One row per stock. The representative token is the tradable one, bStocks by default,
    // else the higher-volume one. Provider choice happens on the detail page (Compare).
    const byTicker = new Map<string, AssetWithPrice[]>();
    for (const a of assets) byTicker.set(a.ticker, [...(byTicker.get(a.ticker) ?? []), a]);
    const rank = (a: AssetWithPrice) => (a.can_trade ? 4 : 0) + (a.provider === "bstock" ? 2 : 0) + (num(a.price?.volume_24h) ?? 0) / 1e15;
    items = [];
    for (const a of assets) {
      const group = byTicker.get(a.ticker);
      if (!group) continue; // already emitted
      byTicker.delete(a.ticker);
      const rep = [...group].sort((x, y) => rank(y) - rank(x))[0]!;
      const people = group.map(friendsOf).filter((f): f is NonNullable<typeof f> => !!f);
      const merged = people.length
        ? { avatars: [...new Map(people.flatMap((f) => f.avatars).map((p) => [p.id, p])).values()].slice(0, 3), count: people.reduce((n, f) => n + f.count, 0) }
        : null;
      items.push({ ...rep, providerCount: group.length, friends: merged });
      if (items.length >= q.limit) break;
    }
  } else {
    items = assets.slice(0, q.limit).map((a) => ({ ...a, providerCount: 1, friends: friendsOf(a) }));
  }
  return json({ items }, { cacheSeconds: ctx ? undefined : 10 });
});

function cap(a: AssetWithPrice) {
  return num(a.price?.market_cap) ?? 0;
}
function tickerHolders(all: AssetWithPrice[], counts: Map<string, number>, a: AssetWithPrice) {
  return all.filter((x) => x.ticker === a.ticker).reduce((s, x) => s + (counts.get(x.address) ?? 0), 0);
}
function tickerVolume(all: AssetWithPrice[], a: AssetWithPrice) {
  return all.filter((x) => x.ticker === a.ticker).reduce((s, x) => s + (num(x.price?.volume_24h) ?? 0), 0);
}
