import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

export type NewsItem = { id: string; headline: string; summary: string; source: string; url: string; image: string | null; at: number };

const finnhubItem = z.object({
  id: z.number(),
  headline: z.string(),
  summary: z.string().nullish(),
  source: z.string().nullish(),
  url: z.string().url(),
  image: z.string().nullish(),
  datetime: z.number(),
});

const cache = new Map<string, { at: number; items: NewsItem[] }>();
const TTL = 15 * 60_000;

/**
 * Company news for a US ticker from Finnhub (last 7 days), cached per ticker for 15 minutes.
 * Returns null when no API key is configured, so the UI can say news isn't connected.
 */
export async function companyNews(ticker: string): Promise<NewsItem[] | null> {
  const key = serverEnv().FINNHUB_API_KEY;
  if (!key) return null;
  const t = ticker.toUpperCase();
  const hit = cache.get(t);
  if (hit && Date.now() - hit.at < TTL) return hit.items;

  const to = new Date();
  const from = new Date(Date.now() - 7 * 86400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(t)}&from=${day(from)}&to=${day(to)}`;
  const res = await fetch(url, { headers: { "X-Finnhub-Token": key }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`News provider returned ${res.status}`);
  const parsed = z.array(finnhubItem).safeParse(await res.json());
  if (!parsed.success) throw new Error("News provider response had an unexpected shape");

  const seen = new Set<string>();
  const items = parsed.data
    .filter((n) => n.headline && !seen.has(n.headline) && seen.add(n.headline))
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 20)
    .map((n) => ({
      id: String(n.id),
      headline: n.headline,
      summary: (n.summary ?? "").slice(0, 280),
      source: n.source ?? "",
      url: n.url,
      image: n.image || null,
      at: n.datetime * 1000,
    }));
  cache.set(t, { at: Date.now(), items });
  return items;
}

export type TaggedNewsItem = NewsItem & { tickers: string[] };

/**
 * News across several tickers, merged newest first. A story that covers more than one of the
 * tickers appears once, tagged with each. Null when no provider key.
 */
export async function basketNews(tickers: string[]): Promise<TaggedNewsItem[] | null> {
  const lists = await Promise.all(tickers.map(async (t) => ({ t, items: await companyNews(t).catch(() => [] as NewsItem[]) })));
  if (lists.some((l) => l.items === null)) return null;
  const byHeadline = new Map<string, TaggedNewsItem>();
  for (const { t, items } of lists) {
    // Up to 8 per stock, so one heavily covered name doesn't crowd out the rest.
    for (const n of (items ?? []).slice(0, 8)) {
      const hit = byHeadline.get(n.headline);
      if (hit) {
        if (!hit.tickers.includes(t)) hit.tickers.push(t);
      } else byHeadline.set(n.headline, { ...n, tickers: [t] });
    }
  }
  return [...byHeadline.values()].sort((a, b) => b.at - a.at).slice(0, 24);
}

const marketCache = new Map<string, { at: number; items: NewsItem[] }>();

/** Finnhub market news for a category ("general" or "crypto"), cached for 15 minutes. */
export async function marketNews(category: "general" | "crypto"): Promise<NewsItem[] | null> {
  const key = serverEnv().FINNHUB_API_KEY;
  if (!key) return null;
  const hit = marketCache.get(category);
  if (hit && Date.now() - hit.at < TTL) return hit.items;
  const res = await fetch(`https://finnhub.io/api/v1/news?category=${category}`, {
    headers: { "X-Finnhub-Token": key },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`News provider returned ${res.status}`);
  const parsed = z.array(finnhubItem).safeParse(await res.json());
  if (!parsed.success) throw new Error("News provider response had an unexpected shape");
  const items = parsed.data
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 100)
    .map((n) => ({
      id: String(n.id),
      headline: n.headline,
      summary: (n.summary ?? "").slice(0, 280),
      source: n.source ?? "",
      url: n.url,
      image: n.image || null,
      at: n.datetime * 1000,
    }));
  marketCache.set(category, { at: Date.now(), items });
  return items;
}
