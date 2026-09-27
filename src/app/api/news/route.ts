import { z } from "zod";
import { handler, json } from "@/server/http";
import { companyNews } from "@/server/news";

const query = z.object({ ticker: z.string().regex(/^[A-Za-z.]{1,10}$/) });

/** Recent news for the underlying stock of a ticker. `connected: false` when no provider key. */
export const GET = handler(async (req: Request) => {
  const { ticker } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const items = await companyNews(ticker);
  return json({ connected: items !== null, items: items ?? [] }, { cacheSeconds: 300 });
});
