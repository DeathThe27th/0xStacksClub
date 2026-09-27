import { getAddress, isAddress } from "viem";
import { z } from "zod";
import type { TradeRow } from "@/lib/supabase/types";
import { requireProfile } from "@/server/auth";
import { db, must } from "@/server/db";
import { handler, json } from "@/server/http";

const query = z.object({ targetType: z.enum(["asset", "stack"]), targetId: z.string() });

/** The caller's own confirmed trades in one stock or Stack (history icon on detail pages). */
export const GET = handler(async (req: Request) => {
  const ctx = await requireProfile(req);
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  let sel = db().from("trades").select("*").eq("profile_id", ctx.profile.id).order("created_at", { ascending: false }).limit(100);
  sel = q.targetType === "asset" && isAddress(q.targetId) ? sel.eq("asset_address", getAddress(q.targetId)) : sel.eq("stack_id", Number(q.targetId));
  return json({ items: must(await sel) as TradeRow[] });
});
