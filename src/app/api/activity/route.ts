import { z } from "zod";
import { maybeAuthenticate } from "@/server/auth";
import { handler, json } from "@/server/http";
import { discoverStocks, followingFeed, topCreators } from "@/server/social";

const query = z.object({ tab: z.enum(["following", "discover"]).default("following") });

export const GET = handler(async (req: Request) => {
  const { tab } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const ctx = await maybeAuthenticate(req);
  if (tab === "discover") {
    const viewer = ctx?.profile?.id ?? null;
    const [stocks, creators] = await Promise.all([discoverStocks(viewer), topCreators(viewer)]);
    return json({ tab, ...stocks, ...creators });
  }
  return json({ tab, items: ctx?.profile ? await followingFeed(ctx.profile.id) : [] });
});
