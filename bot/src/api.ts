import { z } from "zod";

// Client for the site's /api/bot routes. The bot never talks to Binance, Supabase or the chain:
// it sends a sender and a request here, and the site answers with data and ready-made links.
// A sender is a phone in E.164 (iMessage, terminal) or `tg:<id>` (Telegram).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const num = z.number().nullable();
const basketRef = z.object({ name: z.string(), ticker: z.string() });
const many = z.object({ match: z.literal("many"), options: z.array(basketRef).min(1) });
const none = z.object({ match: z.literal("none") });

const config = z.object({ appName: z.string().min(1), maxBuyUsd: z.number().positive(), facts: z.array(z.string()).default([]) });
const me = z.object({ linked: z.boolean(), username: z.string().optional(), number: z.string().optional() });

const stockItem = z.object({
  ticker: z.string(),
  name: z.string(),
  provider: z.string(),
  priceUsd: num,
  change24h: num,
  marketOpen: z.boolean().nullable(),
  canTrade: z.boolean(),
  url: z.string().url(),
});
const stocks = z.object({ sort: z.string(), items: z.array(stockItem), total: z.number() });
const option = z.object({ kind: z.enum(["stock", "basket"]).optional(), ticker: z.string(), name: z.string() });
const manyAny = z.object({ match: z.literal("many"), options: z.array(option).min(1) });
const link = z.object({ ok: z.literal(true), username: z.string(), number: z.string().optional() });
const unlink = z.object({ wasLinked: z.boolean(), photonUserId: z.string().nullable() });

const baskets = z.object({
  items: z.array(basketRef.extend({ stocks: z.number(), index: num, change24h: num, investedUsd: num })),
  total: z.number(),
});

const basketDetail = basketRef.extend({
  index: num,
  change24h: num,
  change7d: num,
  sinceLaunch: num,
  investedUsd: num,
  url: z.string().url(),
  components: z.array(z.object({ ticker: z.string(), weightPct: z.number(), priceUsd: num, change24h: num, marketOpen: z.boolean().nullable() })),
});
/** A stock first, a basket second, or a choice between what fits. */
const lookup = z.discriminatedUnion("match", [
  z.object({ match: z.literal("stock"), stock: stockItem }),
  z.object({ match: z.literal("basket"), basket: basketDetail }),
  manyAny,
  none,
]);

const buyLink = z.discriminatedUnion("match", [
  z.object({ match: z.literal("stock"), target: option, amountUsd: z.number().positive(), url: z.string().url(), closed: z.array(z.string()) }),
  z.object({ match: z.literal("basket"), basket: basketRef, amountUsd: z.number().positive(), url: z.string().url(), closed: z.array(z.string()) }),
  z.object({ match: z.literal("not_tradable"), target: option }),
  z.object({ match: z.literal("below_min"), basket: basketRef, minUsd: z.number() }),
  z.object({ match: z.literal("above_max"), basket: basketRef, maxUsd: z.number() }),
  z.object({ match: z.literal("bad_amount") }),
  manyAny,
  none,
]);

const portfolio = z.object({
  totalUsd: num,
  change24hUsd: num,
  usdt: z.number(),
  positions: z.array(
    z.object({
      id: z.number(),
      name: z.string().nullable(),
      ticker: z.string().nullable(),
      valueUsd: num,
      costBasisUsd: z.number(),
      pnlUsd: num,
      pnlPct: num,
      basketChange7d: num.optional(),
    }),
  ),
  stocks: z.array(z.object({ ticker: z.string(), valueUsd: num, pnlUsd: num, pnlPct: num, change24h: num })),
  url: z.string().url(),
});

const club = z.discriminatedUnion("match", [
  z.object({ match: z.literal("one"), basket: basketRef, isMember: z.boolean(), hasLink: z.boolean(), url: z.string().url().nullable(), basketUrl: z.string().url() }),
  many,
  none,
]);

const newsItem = z.object({ headline: z.string(), summary: z.string(), source: z.string(), url: z.string().url(), at: z.number(), tickers: z.array(z.string()).optional() });
const news = z.discriminatedUnion("match", [
  z.object({ match: z.literal("one"), connected: z.boolean(), stock: stockItem, items: z.array(newsItem) }),
  z.object({ match: z.literal("briefing"), connected: z.boolean(), holdings: z.array(z.string()), yours: z.array(newsItem), market: z.array(newsItem) }),
  z.object({ match: z.literal("many"), options: z.array(z.object({ ticker: z.string(), name: z.string() })).min(1) }),
  none,
]);

export type News = z.infer<typeof news>;
export type NewsItem = z.infer<typeof newsItem>;
export type StockItem = z.infer<typeof stockItem>;
export type Stocks = z.infer<typeof stocks>;
export type Lookup = z.infer<typeof lookup>;
export type BuyLink = z.infer<typeof buyLink>;
export type Option = z.infer<typeof option>;
export type BasketDetail = z.infer<typeof basketDetail>;
export type BotConfig = z.infer<typeof config>;
export type Baskets = z.infer<typeof baskets>;
export type Portfolio = z.infer<typeof portfolio>;
export type Club = z.infer<typeof club>;
export type BasketRef = z.infer<typeof basketRef>;

export type Api = ReturnType<typeof createApi>;

export function createApi(opts: { siteUrl: string; secret: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {
  const doFetch = opts.fetchImpl ?? fetch;

  async function call<T extends z.ZodType>(method: "GET" | "POST", path: string, schema: T, body?: unknown): Promise<z.infer<T>> {
    let res: Response;
    try {
      res = await doFetch(`${opts.siteUrl}/api/bot/${path}`, {
        method,
        headers: { "x-bot-secret": opts.secret, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
      });
    } catch (e) {
      throw new ApiError(0, "network", e instanceof Error ? e.name : "network error");
    }
    const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (!res.ok) throw new ApiError(res.status, data?.error ?? "error", data?.message ?? `HTTP ${res.status}`);
    const parsed = schema.safeParse(data);
    // A shape we don't recognise is reported, never guessed at.
    if (!parsed.success) throw new ApiError(res.status, "bad_response", `Unexpected response from /api/bot/${path}`);
    return parsed.data;
  }

  return {
    config: () => call("GET", "config", config),
    me: (sender: string) => call("POST", "me", me, { sender }),
    link: (sender: string, code: string) => call("POST", "link", link, { sender, code }),
    unlink: (sender: string) => call("POST", "unlink", unlink, { sender }),
    release: (sender: string, photonUserId: string) => call("POST", "release", z.object({ ok: z.boolean() }), { sender, photonUserId }),
    stocks: (sender: string, sort: "volume" | "gainers" | "losers" = "volume") => call("POST", "stocks", stocks, { sender, sort }),
    lookup: (sender: string, query: string) => call("POST", "lookup", lookup, { sender, query }),
    buyLink: (sender: string, query: string, amount: number) => call("POST", "buylink", buyLink, { sender, query, amount }),
    baskets: (sender: string) => call("POST", "baskets", baskets, { sender }),
    portfolio: (sender: string, week = false) => call("POST", "portfolio", portfolio, { sender, week }),
    club: (sender: string, query: string) => call("POST", "club", club, { sender, query }),
    news: (sender: string, query?: string) => call("POST", "news", news, { sender, ...(query ? { query } : {}) }),
  };
}
