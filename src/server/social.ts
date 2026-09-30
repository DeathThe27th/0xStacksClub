import "server-only";
import { getAddress } from "viem";
import type { ActivityRow, AssetRow, CommentRow, HolderRow, PublicProfile, StackRow, TradeRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";

export type ProfileLite = Pick<PublicProfile, "id" | "username" | "display_name" | "avatar_url">;

export async function profilesByIds(ids: string[]): Promise<Map<string, ProfileLite>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = must(await db().from("public_profiles").select("id, username, display_name, avatar_url").in("id", uniq)) as ProfileLite[];
  return new Map(rows.map((r) => [r.id, r]));
}

export async function followingIds(profileId: string): Promise<string[]> {
  const rows = must(await db().from("follows").select("followee_id").eq("follower_id", profileId)) as { followee_id: string }[];
  return rows.map((r) => r.followee_id);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export type CommentOut = CommentRow & {
  author: ProfileLite | null;
  likes: number;
  likedByMe: boolean;
  replies: number;
};

export async function listComments(target: { type: "asset" | "stack"; id: string }, viewerId: string | null, limit = 50): Promise<CommentOut[]> {
  const rows = must(
    await db()
      .from("comments")
      .select("*")
      .eq("target_type", target.type)
      .eq("target_id", target.id)
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as CommentRow[];
  return decorateComments(rows, viewerId);
}

export async function decorateComments(rows: CommentRow[], viewerId: string | null): Promise<CommentOut[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [authors, likes, replies] = await Promise.all([
    profilesByIds(rows.map((r) => r.profile_id ?? "")),
    db().from("comment_likes").select("comment_id, profile_id").in("comment_id", ids).then(must) as Promise<{ comment_id: string; profile_id: string }[]>,
    db().from("comments").select("parent_id").in("parent_id", ids).then(must) as Promise<{ parent_id: string }[]>,
  ]);
  return rows.map((r) => ({
    ...r,
    author: r.profile_id ? (authors.get(r.profile_id) ?? null) : null,
    likes: likes.filter((l) => l.comment_id === r.id).length,
    likedByMe: !!viewerId && likes.some((l) => l.comment_id === r.id && l.profile_id === viewerId),
    replies: replies.filter((x) => x.parent_id === r.id).length,
  }));
}

// ---------------------------------------------------------------------------
// Holders (our users only, from confirmed trades)
// ---------------------------------------------------------------------------

export type HolderOut = {
  profile: ProfileLite;
  avgEntryUsd: number | null;
  costBasisUsd: number;
  netUnits: string;
  valueUsd: number | null;
  pnlPct: number | null;
  isFriend: boolean;
  latestComment: CommentOut | null;
};

export async function listHolders(
  target: { type: "asset" | "stack"; id: string },
  viewerId: string | null,
  valueOf: (h: HolderRow) => number | null,
): Promise<HolderOut[]> {
  const rows = must(await db().from("holders").select("*").eq("target_type", target.type).eq("target_id", target.id)) as HolderRow[];
  const open = rows.filter((h) => (target.type === "asset" ? BigInt(String(h.net_units).split(".")[0]!) > 0n : Number(h.net_usd) > 0.0001));
  const [profiles, friends] = await Promise.all([
    profilesByIds(open.map((h) => h.profile_id)),
    viewerId ? followingIds(viewerId) : Promise.resolve([] as string[]),
  ]);
  const comments = open.length
    ? ((must(
        await db()
          .from("comments")
          .select("*")
          .eq("target_type", target.type)
          .eq("target_id", target.id)
          .is("parent_id", null)
          .in("profile_id", open.map((h) => h.profile_id))
          .order("created_at", { ascending: false }),
      ) as CommentRow[]))
    : [];
  const decorated = await decorateComments(comments, viewerId);
  const out: HolderOut[] = [];
  for (const h of open) {
    const profile = profiles.get(h.profile_id);
    if (!profile) continue;
    const value = valueOf(h);
    const basis = Number(h.cost_basis_usd);
    out.push({
      profile,
      avgEntryUsd: h.avg_entry_usd ? Number(h.avg_entry_usd) : null,
      costBasisUsd: basis,
      netUnits: String(h.net_units),
      valueUsd: value,
      pnlPct: value !== null && basis > 0 ? ((value - basis) / basis) * 100 : null,
      isFriend: friends.includes(h.profile_id),
      latestComment: decorated.find((c) => c.profile_id === h.profile_id) ?? null,
    });
  }
  return out.sort((a, b) => (b.valueUsd ?? b.costBasisUsd) - (a.valueUsd ?? a.costBasisUsd));
}

/** Up to 3 followed users who hold each target, for the list-row avatar stack. */
export async function friendsHolding(viewerId: string, targets: { type: "asset" | "stack"; id: string }[]) {
  const friends = await followingIds(viewerId);
  if (!friends.length || !targets.length) return new Map<string, { avatars: ProfileLite[]; count: number }>();
  const rows = must(await db().from("holders").select("*").in("profile_id", friends)) as HolderRow[];
  const open = rows.filter((h) => Number(h.net_usd) > 0.0001);
  const profiles = await profilesByIds(open.map((h) => h.profile_id));
  const m = new Map<string, { avatars: ProfileLite[]; count: number }>();
  for (const h of open) {
    const key = `${h.target_type}:${h.target_type === "asset" ? getAddress(h.target_id) : h.target_id}`;
    const cur = m.get(key) ?? { avatars: [], count: 0 };
    const p = profiles.get(h.profile_id);
    if (p && cur.avatars.length < 3) cur.avatars.push(p);
    cur.count++;
    m.set(key, cur);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

export type ActivityOut = ActivityRow & {
  actor: ProfileLite | null;
  target: { kind: "asset"; asset: Pick<AssetRow, "address" | "ticker" | "symbol" | "provider" | "logo_url"> } | { kind: "stack"; stack: Pick<StackRow, "id" | "ticker" | "name" | "image_url"> } | null;
};

export async function decorateActivity(rows: ActivityRow[]): Promise<ActivityOut[]> {
  const assetIds = rows.filter((r) => r.target_type === "asset" && r.target_id).map((r) => getAddress(r.target_id!));
  const stackIds = rows.filter((r) => r.target_type === "stack" && r.target_id).map((r) => Number(r.target_id));
  const [actors, assets, stacks] = await Promise.all([
    profilesByIds(rows.map((r) => r.profile_id ?? "")),
    assetIds.length
      ? (db().from("assets").select("address, ticker, symbol, provider, logo_url").in("address", assetIds).then(must) as Promise<
          Pick<AssetRow, "address" | "ticker" | "symbol" | "provider" | "logo_url">[]
        >)
      : Promise.resolve([]),
    stackIds.length
      ? (db().from("stacks").select("id, ticker, name, image_url").in("id", stackIds).then(must) as Promise<
          Pick<StackRow, "id" | "ticker" | "name" | "image_url">[]
        >)
      : Promise.resolve([]),
  ]);
  return rows.map((r) => {
    let target: ActivityOut["target"] = null;
    if (r.target_type === "asset" && r.target_id) {
      const a = assets.find((x) => x.address === getAddress(r.target_id!));
      if (a) target = { kind: "asset", asset: a };
    } else if (r.target_type === "stack" && r.target_id) {
      const s = stacks.find((x) => Number(x.id) === Number(r.target_id));
      if (s) target = { kind: "stack", stack: s };
    }
    return { ...r, actor: r.profile_id ? (actors.get(r.profile_id) ?? null) : null, target };
  });
}

export async function followingFeed(viewerId: string, limit = 50): Promise<ActivityOut[]> {
  const ids = await followingIds(viewerId);
  if (!ids.length) return [];
  const rows = must(
    await db().from("activity").select("*").in("profile_id", ids).order("created_at", { ascending: false }).limit(limit),
  ) as ActivityRow[];
  return decorateActivity(rows);
}

// ---------------------------------------------------------------------------
// Leaderboards (FLOWS.md §10)
// ---------------------------------------------------------------------------

export type LeaderCard = {
  profile: ProfileLite;
  gainUsd: number;
  target: ActivityOut["target"];
};

export async function weeklyTopTrades(): Promise<LeaderCard[]> {
  const rows = must(await db().from("weekly_pnl").select("*")) as { profile_id: string; target_type: string; target_id: string; pnl_usd: string }[];
  const byUser = new Map<string, { total: number; best: { type: string; id: string; pnl: number } }>();
  for (const r of rows) {
    const pnl = Number(r.pnl_usd);
    const cur = byUser.get(r.profile_id) ?? { total: 0, best: { type: r.target_type, id: r.target_id, pnl: -Infinity } };
    cur.total += pnl;
    if (pnl > cur.best.pnl) cur.best = { type: r.target_type, id: r.target_id, pnl };
    byUser.set(r.profile_id, cur);
  }
  const top = [...byUser.entries()].filter(([, v]) => v.total > 0).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const profiles = await profilesByIds(top.map(([id]) => id));
  const targets = await decorateActivity(
    top.map(([id, v], i) => ({
      id: i,
      profile_id: id,
      type: "buy",
      target_type: v.best.type,
      target_id: v.best.id,
      usd_amount: null,
      tx_hash: null,
      created_at: "",
    })),
  );
  return top.flatMap(([id, v], i) => {
    const p = profiles.get(id);
    return p ? [{ profile: p, gainUsd: v.total, target: targets[i]!.target }] : [];
  });
}

export type HallOfFameCard = { stack: Pick<StackRow, "id" | "ticker" | "name" | "image_url">; creator: ProfileLite | null; earnedRaw: string };

export async function hallOfFame(): Promise<HallOfFameCard[]> {
  const rows = must(await db().from("hall_of_fame").select("*").order("creator_earned_raw", { ascending: false }).limit(10)) as {
    stack_id: number;
    creator_earned_raw: string;
  }[];
  if (!rows.length) return [];
  const stacks = must(
    await db().from("stacks").select("id, ticker, name, image_url, creator_id").in("id", rows.map((r) => r.stack_id)),
  ) as (Pick<StackRow, "id" | "ticker" | "name" | "image_url"> & { creator_id: string | null })[];
  const creators = await profilesByIds(stacks.map((s) => s.creator_id ?? ""));
  return rows.flatMap((r) => {
    const s = stacks.find((x) => Number(x.id) === Number(r.stack_id));
    if (!s) return [];
    return [{ stack: s, creator: s.creator_id ? (creators.get(s.creator_id) ?? null) : null, earnedRaw: String(r.creator_earned_raw).split(".")[0]! }];
  });
}

/** Discover tab: top creators by fees earned and by distinct Stack buyers. */
export async function topCreators(viewerId: string | null) {
  const stacks = must(await db().from("stacks").select("id, creator_id")) as { id: number; creator_id: string | null }[];
  const hof = must(await db().from("hall_of_fame").select("*")) as { stack_id: number; creator_earned_raw: string; buys: number }[];
  const buyers = must(await db().from("holders").select("profile_id, target_id").eq("target_type", "stack")) as { profile_id: string; target_id: string }[];
  const byCreator = new Map<string, { earnedRaw: bigint; buyers: Set<string>; stacks: number }>();
  for (const s of stacks) {
    if (!s.creator_id) continue;
    const cur = byCreator.get(s.creator_id) ?? { earnedRaw: 0n, buyers: new Set<string>(), stacks: 0 };
    cur.stacks++;
    const h = hof.find((x) => Number(x.stack_id) === Number(s.id));
    if (h) cur.earnedRaw += BigInt(String(h.creator_earned_raw).split(".")[0]!);
    for (const b of buyers.filter((x) => Number(x.target_id) === Number(s.id))) cur.buyers.add(b.profile_id);
    byCreator.set(s.creator_id, cur);
  }
  const profiles = await profilesByIds([...byCreator.keys()]);
  const following = viewerId ? await followingIds(viewerId) : [];
  const rows = [...byCreator.entries()].flatMap(([id, v]) => {
    const p = profiles.get(id);
    return p && id !== viewerId
      ? [{ profile: p, earnedRaw: v.earnedRaw.toString(), buyers: v.buyers.size, stacks: v.stacks, following: following.includes(id) }]
      : [];
  });
  return {
    byEarnings: [...rows].sort((a, b) => (BigInt(b.earnedRaw) > BigInt(a.earnedRaw) ? 1 : -1)).slice(0, 20),
    byBuyers: [...rows].sort((a, b) => b.buyers - a.buyers).slice(0, 20),
  };
}

/** What users of the app have traded in one stock or basket: all time, last 24h, and how many trades. */
export async function appVolume(target: { type: "asset" | "stack"; id: string }): Promise<{ allUsd: number; dayUsd: number; trades: number }> {
  let q = db().from("trades").select("usd_amount, created_at").limit(10_000);
  q = target.type === "asset" ? q.eq("asset_address", getAddress(target.id)).is("stack_id", null) : q.eq("stack_id", Number(target.id));
  const rows = must(await q) as { usd_amount: string; created_at: string }[];
  const dayAgo = Date.now() - 86400_000;
  let allUsd = 0;
  let dayUsd = 0;
  for (const r of rows) {
    const usd = Number(r.usd_amount);
    allUsd += usd;
    if (new Date(r.created_at).getTime() >= dayAgo) dayUsd += usd;
  }
  return { allUsd, dayUsd, trades: rows.length };
}

export type StockLeader = { asset: Pick<AssetRow, "address" | "ticker" | "name" | "provider" | "logo_url">; volumeUsd: number; traders: number; trades: number };
export type TraderLeader = { profile: ProfileLite; volumeUsd: number; trades: number; following: boolean };

/**
 * Discover, stocks first: the stocks traded most on the app this week, the people trading most, and
 * the latest trades by anyone. Everything comes from confirmed trades.
 */
export type PersonOut = { profile: ProfileLite; following: boolean; lastTrade: { side: "buy" | "sell"; label: string; at: string } | null };

export async function discoverStocks(viewerId: string | null): Promise<{ stocks: StockLeader[]; traders: TraderLeader[]; latest: ActivityOut[]; people: PersonOut[] }> {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const rows = must(
    await db().from("trades").select("id, profile_id, side, asset_address, stack_id, usd_amount, tx_hash, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
  ) as Pick<TradeRow, "id" | "profile_id" | "side" | "asset_address" | "stack_id" | "usd_amount" | "tx_hash" | "created_at">[];

  const byAsset = new Map<string, { volumeUsd: number; traders: Set<string>; trades: number }>();
  const byTrader = new Map<string, { volumeUsd: number; trades: number }>();
  for (const r of rows) {
    const usd = Number(r.usd_amount);
    if (r.asset_address && r.stack_id === null) {
      const a = byAsset.get(r.asset_address) ?? { volumeUsd: 0, traders: new Set<string>(), trades: 0 };
      a.volumeUsd += usd;
      a.trades++;
      if (r.profile_id) a.traders.add(r.profile_id);
      byAsset.set(r.asset_address, a);
    }
    if (r.profile_id) {
      const t = byTrader.get(r.profile_id) ?? { volumeUsd: 0, trades: 0 };
      t.volumeUsd += usd;
      t.trades++;
      byTrader.set(r.profile_id, t);
    }
  }
  const topAssets = [...byAsset.entries()].sort((a, b) => b[1].volumeUsd - a[1].volumeUsd).slice(0, 10);
  const topTraders = [...byTrader.entries()].filter(([id]) => id !== viewerId).sort((a, b) => b[1].volumeUsd - a[1].volumeUsd).slice(0, 10);

  const [newest, assets, profiles, following, latest] = await Promise.all([
    db().from("public_profiles").select("id, username, display_name, avatar_url").order("created_at", { ascending: false }).limit(40).then(must) as Promise<ProfileLite[]>,
    topAssets.length
      ? (db().from("assets").select("address, ticker, name, provider, logo_url").in("address", topAssets.map(([a]) => a)).then(must) as Promise<StockLeader["asset"][]>)
      : Promise.resolve([] as StockLeader["asset"][]),
    profilesByIds(topTraders.map(([id]) => id)),
    viewerId ? followingIds(viewerId) : Promise.resolve([] as string[]),
    decorateActivity(
      rows.slice(0, 30).map((r) => ({
        id: r.id,
        profile_id: r.profile_id,
        type: r.side,
        target_type: r.stack_id !== null ? "stack" : "asset",
        target_id: r.stack_id !== null ? String(r.stack_id) : r.asset_address,
        usd_amount: r.usd_amount,
        tx_hash: r.tx_hash,
        created_at: r.created_at,
      })),
    ),
  ]);
  // Everyone else on the app, newest first, each with their latest trade if they have one.
  const ranked = new Set(topTraders.map(([id]) => id));
  const lastBy = new Map<string, ActivityOut>();
  for (const a of latest) if (a.profile_id && !lastBy.has(a.profile_id)) lastBy.set(a.profile_id, a);
  const people: PersonOut[] = newest
    .filter((p) => p.id !== viewerId && !ranked.has(p.id))
    .slice(0, 30)
    .map((profile) => {
      const a = lastBy.get(profile.id);
      const label = a?.target?.kind === "asset" ? a.target.asset.ticker : a?.target?.kind === "stack" ? a.target.stack.name : null;
      return { profile, following: following.includes(profile.id), lastTrade: a && label && (a.type === "buy" || a.type === "sell") ? { side: a.type, label, at: a.created_at } : null };
    });

  return {
    people,
    stocks: topAssets.flatMap(([address, v]) => {
      const asset = assets.find((a) => a.address === address);
      return asset ? [{ asset, volumeUsd: v.volumeUsd, traders: v.traders.size, trades: v.trades }] : [];
    }),
    traders: topTraders.flatMap(([id, v]) => {
      const profile = profiles.get(id);
      return profile ? [{ profile, volumeUsd: v.volumeUsd, trades: v.trades, following: following.includes(id) }] : [];
    }),
    latest,
  };
}

export async function followCounts(profileId: string) {
  const [followers, following] = await Promise.all([
    db().from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", profileId),
    db().from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", profileId),
  ]);
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}
