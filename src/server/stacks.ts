import "server-only";
import { getAddress } from "viem";
import { INDEX_BASE, indexValue, launchUnits, positionValueScaled, scaledToNumber } from "@/lib/math";
import type { AssetPriceRow, AssetRow, PublicProfile, StackIndexPointRow, StackRow } from "@/lib/supabase/types";
import { getCandles, type CandleBar } from "@/server/binance";
import { db, must } from "@/server/db";

export type StackSummary = StackRow & {
  creator: Pick<PublicProfile, "id" | "username" | "avatar_url"> | null;
  index: number | null;
  referenceIndex: number | null;
  change: number | null; // since launch, percent
  change24h: number | null;
  change7d: number | null;
  /** USD value of every open position in this basket: onchain units × live prices. Null if a price is missing. */
  valueHeldUsd: number | null;
  holders: number;
  creatorEarnedRaw: string;
};

async function pricesFor(addresses: string[]): Promise<Map<string, AssetPriceRow>> {
  if (!addresses.length) return new Map();
  const rows = must(await db().from("asset_prices").select("*").in("address", addresses)) as AssetPriceRow[];
  return new Map(rows.map((r) => [r.address, r]));
}

export function currentIndex(stack: StackRow, prices: Map<string, AssetPriceRow>) {
  if (!stack.launch_units) return { index: null, reference: null };
  const addrs = stack.components.map((c) => c.address);
  return {
    index: indexValue(stack.launch_units, addrs.map((a) => prices.get(a)?.price_usd ?? null)),
    reference: indexValue(stack.launch_units, addrs.map((a) => prices.get(a)?.reference_price_usd ?? null)),
  };
}

async function creatorProfiles(ids: string[]) {
  if (!ids.length) return new Map<string, Pick<PublicProfile, "id" | "username" | "avatar_url">>();
  const rows = must(await db().from("public_profiles").select("id, username, avatar_url").in("id", ids)) as Pick<
    PublicProfile,
    "id" | "username" | "avatar_url"
  >[];
  return new Map(rows.map((r) => [r.id, r]));
}

async function holderCounts(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const rows = must(await db().from("holders").select("target_id, profile_id").eq("target_type", "stack").in("target_id", ids.map(String))) as {
    target_id: string;
    profile_id: string;
  }[];
  const m = new Map<number, number>();
  for (const r of rows) m.set(Number(r.target_id), (m.get(Number(r.target_id)) ?? 0) + 1);
  return m;
}

async function creatorEarned(ids: number[]): Promise<Map<number, bigint>> {
  if (!ids.length) return new Map();
  const rows = must(await db().from("hall_of_fame").select("stack_id, creator_earned_raw").in("stack_id", ids)) as {
    stack_id: number;
    creator_earned_raw: string;
  }[];
  return new Map(rows.map((r) => [Number(r.stack_id), BigInt(String(r.creator_earned_raw).split(".")[0]!)]));
}

async function indexAgo(ids: number[], hours: number): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = must(
    await db().from("stack_index_points").select("stack_id, ts, value").in("stack_id", ids).gte("ts", since).order("ts", { ascending: true }),
  ) as StackIndexPointRow[];
  const m = new Map<number, number>();
  for (const r of rows) if (!m.has(Number(r.stack_id))) m.set(Number(r.stack_id), Number(r.value));
  return m;
}

/**
 * Raw units still held per basket component, from the vault's PositionOpened / PositionReleased
 * events (mirrored in chain_events). Mirrors the contract: opened amounts minus released amounts.
 */
async function heldUnits(stacks: StackRow[]): Promise<Map<number, bigint[]>> {
  const out = new Map<number, bigint[]>(stacks.map((s) => [Number(s.id), s.components.map(() => 0n)]));
  if (!stacks.length) return out;
  const opened = must(
    await db()
      .from("chain_events")
      .select("data")
      .eq("event", "PositionOpened")
      .in("data->>stackId", stacks.map((s) => String(s.id))),
  ) as { data: { positionId: string; stackId: string; amounts: string[] } }[];
  const stackOf = new Map<string, number>();
  for (const { data } of opened) {
    const units = out.get(Number(data.stackId));
    if (!units) continue;
    stackOf.set(data.positionId, Number(data.stackId));
    data.amounts.forEach((a, i) => (units[i] = (units[i] ?? 0n) + BigInt(a)));
  }
  if (!stackOf.size) return out;
  const released = must(
    await db().from("chain_events").select("data").eq("event", "PositionReleased").in("data->>positionId", [...stackOf.keys()]),
  ) as { data: { positionId: string; amounts: string[] } }[];
  for (const { data } of released) {
    const units = out.get(stackOf.get(data.positionId)!);
    if (!units) continue;
    data.amounts.forEach((a, i) => (units[i] = (units[i] ?? 0n) - BigInt(a)));
  }
  return out;
}

async function decimalsFor(addresses: string[]): Promise<Map<string, number>> {
  if (!addresses.length) return new Map();
  const rows = must(await db().from("assets").select("address, decimals").in("address", addresses)) as Pick<AssetRow, "address" | "decimals">[];
  return new Map(rows.map((r) => [r.address, r.decimals]));
}

function heldValue(stack: StackRow, units: bigint[] | undefined, prices: Map<string, AssetPriceRow>, decimals: Map<string, number>): number | null {
  if (!units || units.every((u) => u === 0n)) return 0;
  const holdings = stack.components.map((c, i) => ({
    units: units[i] ?? 0n,
    decimals: decimals.get(c.address) ?? -1,
    price: prices.get(c.address)?.price_usd ?? null,
  }));
  // Never guess: a missing price or decimals on a held component means no number.
  if (holdings.some((h) => h.units > 0n && (h.price === null || h.decimals < 0))) return null;
  const v = positionValueScaled(holdings.filter((h) => h.units > 0n));
  return v === null ? null : scaledToNumber(v);
}

export async function summarize(stacks: StackRow[]): Promise<StackSummary[]> {
  const addrs = [...new Set(stacks.flatMap((s) => s.components.map((c) => c.address)))];
  const ids = stacks.map((s) => Number(s.id));
  const [prices, creators, holders, earned, dayAgo, weekAgo, held, decimals] = await Promise.all([
    pricesFor(addrs),
    creatorProfiles(stacks.map((s) => s.creator_id).filter((x): x is string => !!x)),
    holderCounts(ids),
    creatorEarned(ids),
    indexAgo(ids, 24),
    indexAgo(ids, 7 * 24),
    heldUnits(stacks),
    decimalsFor(addrs),
  ]);
  return stacks.map((s) => {
    const { index, reference } = currentIndex(s, prices);
    const prev = dayAgo.get(Number(s.id));
    const prevWeek = weekAgo.get(Number(s.id));
    return {
      ...s,
      creator: s.creator_id ? (creators.get(s.creator_id) ?? null) : null,
      index,
      referenceIndex: reference,
      change: index === null ? null : (index / INDEX_BASE - 1) * 100,
      change24h: index !== null && prev ? (index / prev - 1) * 100 : null,
      change7d: index !== null && prevWeek ? (index / prevWeek - 1) * 100 : null,
      valueHeldUsd: heldValue(s, held.get(Number(s.id)), prices, decimals),
      holders: holders.get(Number(s.id)) ?? 0,
      creatorEarnedRaw: (earned.get(Number(s.id)) ?? 0n).toString(),
    };
  });
}

export async function listStacks(filter: "trending" | "newest" | "most_held" | "top_performers" = "trending"): Promise<StackSummary[]> {
  const rows = must(await db().from("stacks").select("*").order("created_at", { ascending: false }).limit(200)) as StackRow[];
  const out = await summarize(rows);
  switch (filter) {
    case "newest":
      return out;
    case "most_held":
      return out.sort((a, b) => b.holders - a.holders);
    case "top_performers":
      return out.sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
    default: {
      // Trending: recent buyers weighted with 24h move
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const recent = must(await db().from("trades").select("stack_id").not("stack_id", "is", null).gte("created_at", since)) as {
        stack_id: number;
      }[];
      const score = new Map<number, number>();
      for (const r of recent) score.set(Number(r.stack_id), (score.get(Number(r.stack_id)) ?? 0) + 1);
      return out.sort(
        (a, b) =>
          (score.get(Number(b.id)) ?? 0) - (score.get(Number(a.id)) ?? 0) || Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0),
      );
    }
  }
}

export async function getStackSummary(id: number): Promise<StackSummary | null> {
  const row = must(await db().from("stacks").select("*").eq("id", id).maybeSingle()) as StackRow | null;
  if (!row) return null;
  return (await summarize([row]))[0]!;
}

export type IndexPoint = { t: number; value: number; reference: number | null };

/**
 * Index series (FLOWS.md §6). ALL/1W/1D come from stored 5-minute points; 1H and LIVE are
 * computed on demand from component candles with the frozen launch units.
 */
export async function indexSeries(stack: StackRow, timeframe: "LIVE" | "1H" | "1D" | "1W" | "ALL"): Promise<IndexPoint[]> {
  if (timeframe === "LIVE" || timeframe === "1H") {
    if (!stack.launch_units) return [];
    const bar: CandleBar = "1m";
    const limit = timeframe === "LIVE" ? 30 : 60;
    const series = await Promise.all(stack.components.map((c) => getCandles(c.address, bar, limit)));
    const times = series[0]?.map((c) => c.t) ?? [];
    const points: IndexPoint[] = [];
    for (const t of times) {
      const prices = series.map((s) => s.find((c) => c.t === t)?.c ?? null);
      const v = indexValue(stack.launch_units, prices);
      if (v !== null) points.push({ t, value: v, reference: null });
    }
    return points;
  }
  const since =
    timeframe === "1D" ? new Date(Date.now() - 86400_000) : timeframe === "1W" ? new Date(Date.now() - 7 * 86400_000) : new Date(0);
  const rows = must(
    await db().from("stack_index_points").select("*").eq("stack_id", stack.id).gte("ts", since.toISOString()).order("ts", { ascending: true }).limit(5000),
  ) as StackIndexPointRow[];
  return rows.map((r) => ({ t: new Date(r.ts).getTime(), value: Number(r.value), reference: r.reference_value ? Number(r.reference_value) : null }));
}

/** Cron: freeze launch units for Stacks that lacked prices at creation, then append a point. */
export async function appendIndexPoints(): Promise<{ stacks: number; points: number }> {
  const stacks = must(await db().from("stacks").select("*")) as StackRow[];
  const prices = await pricesFor([...new Set(stacks.flatMap((s) => s.components.map((c) => c.address)))]);
  const now = new Date();
  now.setSeconds(0, 0);
  let points = 0;
  for (const s of stacks) {
    let stack = s;
    if (!stack.launch_units) {
      try {
        const units = launchUnits(
          s.components.map((c) => c.weight_bps),
          s.components.map((c) => {
            const p = prices.get(c.address)?.price_usd;
            if (!p) throw new Error("missing");
            return p;
          }),
        );
        must(await db().from("stacks").update({ launch_units: units }).eq("id", s.id));
        stack = { ...s, launch_units: units };
      } catch {
        continue;
      }
    }
    const { index, reference } = currentIndex(stack, prices);
    if (index === null) continue;
    must(
      await db()
        .from("stack_index_points")
        .upsert({ stack_id: s.id, ts: now.toISOString(), value: index, reference_value: reference }, { onConflict: "stack_id,ts" }),
    );
    points++;
  }
  return { stacks: stacks.length, points };
}

export async function componentAssets(stack: StackRow): Promise<(AssetRow & { price: AssetPriceRow | null })[]> {
  const addrs = stack.components.map((c) => getAddress(c.address));
  const assets = must(await db().from("assets").select("*").in("address", addrs)) as AssetRow[];
  const prices = await pricesFor(addrs);
  const by = new Map(assets.map((a) => [a.address, a]));
  return addrs.map((a) => ({ ...(by.get(a) as AssetRow), price: prices.get(a) ?? null }));
}
