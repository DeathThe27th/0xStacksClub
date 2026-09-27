import { z } from "zod";
import { maybeAuthenticate } from "@/server/auth";
import { handler, json } from "@/server/http";
import { friendsHolding } from "@/server/social";
import { listStacks } from "@/server/stacks";

const query = z.object({ filter: z.enum(["trending", "newest", "most_held", "top_performers"]).default("trending") });

export const GET = handler(async (req: Request) => {
  const { filter } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const ctx = await maybeAuthenticate(req);
  const stacks = await listStacks(filter);
  const friends = ctx?.profile ? await friendsHolding(ctx.profile.id, stacks.map((s) => ({ type: "stack" as const, id: String(s.id) }))) : null;
  return json({ items: stacks.map((s) => ({ ...s, friends: friends?.get(`stack:${s.id}`) ?? null })) }, { cacheSeconds: ctx ? undefined : 10 });
});
