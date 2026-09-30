import { z } from "zod";

// Client for the site's /api/bot routes. The bot never talks to Binance, Supabase or the chain:
// it sends a phone and a request here, and the site answers with data and ready-made links.

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
const link = z.object({ ok: z.literal(true), username: z.string(), number: z.string().optional() });
const unlink = z.object({ wasLinked: z.boolean(), photonUserId: z.string().nullable() });

const baskets = z.object({
  items: z.array(basketRef.extend({ stocks: z.number(), index: num, change24h: num, investedUsd: num })),
  total: z.number(),
});

const price = z.discriminatedUnion("match", [
  z.object({
    match: z.literal("one"),
    basket: basketRef.extend({
      index: num,
      change24h: num,
      change7d: num,
      sinceLaunch: num,
      investedUsd: num,
      url: z.string().url(),
      components: z.array(z.object({ ticker: z.string(), weightPct: z.number(), priceUsd: num, change24h: num, marketOpen: z.boolean().nullable() })),
    }),
  }),
  many,
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

const buy = z.discriminatedUnion("match", [
  z.object({ match: z.literal("one"), basket: basketRef, amountUsd: z.number().positive(), url: z.string().url(), closed: z.array(z.string()) }),
  z.object({ match: z.literal("below_min"), basket: basketRef, minUsd: z.number() }),
  z.object({ match: z.literal("above_max"), basket: basketRef, maxUsd: z.number() }),
  z.object({ match: z.literal("bad_amount") }),
  many,
  none,
]);

const club = z.discriminatedUnion("match", [
  z.object({ match: z.literal("one"), basket: basketRef, isMember: z.boolean(), hasLink: z.boolean(), url: z.string().url().nullable(), basketUrl: z.string().url() }),
  many,
  none,
]);

const stock = z.discriminatedUnion("match", [
  z.object({
    match: z.literal("one"),
    stock: z.object({
      ticker: z.string(),
      name: z.string(),
      provider: z.string(),
      priceUsd: num,
      change24h: num,
      marketOpen: z.boolean().nullable(),
      canTrade: z.boolean(),
      url: z.string().url(),
    }),
  }),
  z.object({ match: z.literal("many"), options: z.array(z.object({ ticker: z.string(), name: z.string() })).min(1) }),
  none,
]);

export type Stock = z.infer<typeof stock>;
export type BotConfig = z.infer<typeof config>;
export type Baskets = z.infer<typeof baskets>;
export type Price = z.infer<typeof price>;
export type Portfolio = z.infer<typeof portfolio>;
export type Buy = z.infer<typeof buy>;
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
    me: (phone: string) => call("POST", "me", me, { phone }),
    link: (phone: string, code: string) => call("POST", "link", link, { phone, code }),
    unlink: (phone: string) => call("POST", "unlink", unlink, { phone }),
    release: (phone: string, photonUserId: string) => call("POST", "release", z.object({ ok: z.boolean() }), { phone, photonUserId }),
    baskets: (phone: string) => call("POST", "baskets", baskets, { phone }),
    price: (phone: string, query: string) => call("POST", "price", price, { phone, query }),
    portfolio: (phone: string, week = false) => call("POST", "portfolio", portfolio, { phone, week }),
    buy: (phone: string, query: string, amount: number) => call("POST", "buy", buy, { phone, query, amount }),
    club: (phone: string, query: string) => call("POST", "club", club, { phone, query }),
    stock: (phone: string, query: string) => call("POST", "stock", stock, { phone, query }),
  };
}
