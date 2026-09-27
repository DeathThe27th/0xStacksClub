import { z } from "zod";
import { handler, json } from "@/server/http";
import { hallOfFame, weeklyTopTrades } from "@/server/social";

const query = z.object({ kind: z.enum(["weekly", "hall-of-fame"]).default("weekly") });

export const GET = handler(async (req: Request) => {
  const { kind } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json({ kind, items: kind === "weekly" ? await weeklyTopTrades() : await hallOfFame() }, { cacheSeconds: 60 });
});
