import { z } from "zod";
import { maybeAuthenticate } from "@/server/auth";
import { handler, json } from "@/server/http";
import { discoverStocks, followingFeed } from "@/server/social";

const query = z.object({ tab: z.enum(["following", "discover"]).default("following") });

export const GET = handler(async (req: Request) => {
  const { tab } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const ctx = await maybeAuthenticate(req);
  if (tab === "discover") {
    // Stocks, traders and everyone's trades. Basket creators live on basket pages, not here.
    return json({ tab, ...(await discoverStocks(ctx?.profile?.id ?? null)) });
  }
  return json({ tab, items: ctx?.profile ? await followingFeed(ctx.profile.id) : [] });
});
