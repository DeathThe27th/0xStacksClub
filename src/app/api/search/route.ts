import { z } from "zod";
import type { AssetPriceRow, AssetRow, PublicProfile, StackRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";
import { handler, json } from "@/server/http";
import { summarize } from "@/server/stacks";

const query = z.object({ q: z.string().trim().min(1).max(40) });

export const GET = handler(async (req: Request) => {
  const { q } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const like = `%${q.replace(/[%_,()*]/g, "")}%`;
  const [assets, stacks, people] = await Promise.all([
    db().from("assets").select("*").eq("can_browse", true).or(`ticker.ilike.${like},symbol.ilike.${like},name.ilike.${like}`).limit(20).then(must) as Promise<AssetRow[]>,
    db().from("stacks").select("*").or(`ticker.ilike.${like},name.ilike.${like}`).limit(10).then(must) as Promise<StackRow[]>,
    db().from("public_profiles").select("id, username, display_name, avatar_url, bio").or(`username.ilike.${like},display_name.ilike.${like}`).limit(10).then(must) as Promise<
      Pick<PublicProfile, "id" | "username" | "display_name" | "avatar_url" | "bio">[]
    >,
  ]);
  const prices = assets.length
    ? (must(await db().from("asset_prices").select("*").in("address", assets.map((a) => a.address))) as AssetPriceRow[])
    : [];
  return json({
    assets: assets.map((a) => ({ ...a, price: prices.find((p) => p.address === a.address) ?? null, friends: null })),
    stacks: await summarize(stacks),
    people,
  });
});
