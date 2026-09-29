import { z } from "zod";
import { BASKET_CATEGORIES } from "@/lib/baskets";
import { handler, json } from "@/server/http";
import { basketNews, companyNews, marketNews } from "@/server/news";

const tickerRe = /^[A-Za-z.]{1,10}$/;
const query = z.union([
  z.object({ ticker: z.string().regex(tickerRe) }),
  // A basket: its stocks' news merged.
  z.object({ tickers: z.string().transform((s) => s.split(",")).pipe(z.array(z.string().regex(tickerRe)).min(1).max(5)) }),
  // Sector headlines for a basket category, from market news filtered by the category's keywords.
  z.object({ sector: z.string().max(32) }),
]);

/** Recent news: one stock, a basket's stocks, or a sector. `connected: false` when no provider key. */
export const GET = handler(async (req: Request) => {
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  if ("ticker" in q) {
    const items = await companyNews(q.ticker);
    return json({ connected: items !== null, items: items ?? [] }, { cacheSeconds: 300 });
  }
  if ("tickers" in q) {
    const items = await basketNews(q.tickers.map((t) => t.toUpperCase()));
    return json({ connected: items !== null, items: items ?? [] }, { cacheSeconds: 300 });
  }
  const cat = BASKET_CATEGORIES.find((c) => c.id === q.sector);
  const all = await marketNews(cat?.newsCategory ?? "general");
  if (all === null) return json({ connected: false, items: [], matched: false }, { cacheSeconds: 300 });
  const matched = cat ? all.filter((n) => cat.newsKeywords.test(`${n.headline} ${n.summary}`)) : [];
  // Too few sector matches: show the top market headlines and say so.
  const useMatched = matched.length >= 3;
  return json({ connected: true, matched: useMatched, items: (useMatched ? matched : all).slice(0, 12) }, { cacheSeconds: 300 });
});
