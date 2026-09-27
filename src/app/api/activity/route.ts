import { z } from "zod";
import { maybeAuthenticate } from "@/server/auth";
import { handler, json } from "@/server/http";
import { followingFeed, topCreators } from "@/server/social";

const query = z.object({ tab: z.enum(["following", "discover"]).default("following") });

export const GET = handler(async (req: Request) => {
  const { tab } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const ctx = await maybeAuthenticate(req);
  if (tab === "discover") return json({ tab, ...(await topCreators(ctx?.profile?.id ?? null)) });
  return json({ tab, items: ctx?.profile ? await followingFeed(ctx.profile.id) : [] });
});
