import { getAddress, isAddress } from "viem";
import { z } from "zod";
import type { TradeRow } from "@/lib/supabase/types";
import { maybeAuthenticate } from "@/server/auth";
import { db, must } from "@/server/db";
import { handler, HttpError, json } from "@/server/http";
import { followingIds, profilesByIds } from "@/server/social";

const query = z.object({ targetType: z.enum(["asset", "stack"]), targetId: z.string(), limit: z.coerce.number().int().min(1).max(200).default(60) });

/**
 * Recent confirmed trades by StacksClub users in one stock or Stack: the live Trades feed and the
 * chart markers. Same facts the public activity feed already shows (who, side, USD, when, price).
 */
export const GET = handler(async (req: Request) => {
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  let sel = db().from("trades").select("id, profile_id, side, usd_amount, price_usd, created_at").order("created_at", { ascending: false }).limit(q.limit);
  if (q.targetType === "asset") {
    if (!isAddress(q.targetId)) throw new HttpError(400, "Bad address");
    sel = sel.eq("asset_address", getAddress(q.targetId)).is("stack_id", null);
  } else {
    sel = sel.eq("stack_id", Number(q.targetId));
  }
  const rows = must(await sel) as Pick<TradeRow, "id" | "profile_id" | "side" | "usd_amount" | "price_usd" | "created_at">[];
  const ctx = await maybeAuthenticate(req);
  const [people, friends] = await Promise.all([
    profilesByIds(rows.map((r) => r.profile_id ?? "")),
    ctx?.profile ? followingIds(ctx.profile.id) : Promise.resolve([] as string[]),
  ]);
  return json({
    items: rows.map((r) => ({
      id: r.id,
      side: r.side,
      usd: Number(r.usd_amount),
      price: r.price_usd ? Number(r.price_usd) : null,
      at: r.created_at,
      trader: r.profile_id ? (people.get(r.profile_id) ?? null) : null,
      isMe: !!ctx?.profile && r.profile_id === ctx.profile.id,
      isFriend: !!r.profile_id && friends.includes(r.profile_id),
    })),
  });
});
