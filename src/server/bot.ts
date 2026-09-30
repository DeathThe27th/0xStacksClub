import "server-only";
import { z } from "zod";
import { matchBasket, type BasketMatch } from "@/lib/basketMatch";
import { APP_NAME, BOT_MAX_BUY_USD, BPS, CREATOR_SHARE_BPS, FEE_BPS, MIN_BUY_USD_LARGE, MIN_BUY_USD_SMALL } from "@/lib/constants";
import { serverEnv } from "@/lib/env";
import type { AssetPriceRow, AssetRow, HolderRow, StackRow } from "@/lib/supabase/types";
import { clubAccess, getClubLink } from "@/server/clubs";
import { db, must } from "@/server/db";
import { handler, HttpError, json, readJson } from "@/server/http";
import { basketNews, companyNews, marketNews, type NewsItem } from "@/server/news";
import { botRateLimit, resolveSender, type BotUser } from "@/server/assistant";
import { requireBot } from "@/server/imessage";
import { portfolioFor } from "@/server/portfolio";
import { componentAssets, getStackSummary, listStacks, summarize } from "@/server/stacks";

// Everything the iMessage bot can ask for. The bot holds no Binance, Supabase or wallet secrets:
// it sends a phone and a request, these helpers do the work with the same server code the site
// uses, and every link in a reply is built here from NEXT_PUBLIC_APP_URL.

// `sender` is a phone in E.164 (iMessage) or `tg:<id>` (Telegram). `phone` is the older name for
// the same field, still accepted.
export const phoneBody = z.object({ sender: z.string().min(3).max(40).optional(), phone: z.string().min(3).max(40).optional() });

type SenderBody = z.ZodType<{ sender?: string; phone?: string }>;
const noStore = { headers: { "cache-control": "private, no-store" } };

function senderOf(body: { sender?: string; phone?: string }): string {
  const sender = body.sender ?? body.phone;
  if (!sender) throw new HttpError(400, "sender is required", "validation");
  return sender;
}

/** A /api/bot route: shared-secret check, body validation and a per-sender rate limit. */
export function botRoute<T extends SenderBody>(schema: T, fn: (body: z.infer<T>, sender: string) => Promise<unknown>) {
  return handler(async (req: Request) => {
    requireBot(req);
    const body = await readJson(req, schema);
    const sender = senderOf(body);
    await botRateLimit(sender);
    return json(await fn(body, sender), noStore);
  });
}

/** Same, for routes that need the account behind the sender. An unlinked one gets 403 `not_linked`. */
export function linkedBotRoute<T extends SenderBody>(schema: T, fn: (body: z.infer<T>, user: BotUser) => Promise<unknown>) {
  return botRoute(schema, async (body, sender) => {
    const user = await resolveSender(sender);
    if (!user) throw new HttpError(403, "This chat isn't connected to an account", "not_linked");
    return fn(body, user);
  });
}

function appUrl(path: string): string {
  return new URL(path, serverEnv().NEXT_PUBLIC_APP_URL).toString();
}

const basketUrl = (id: number) => appUrl(`/app/basket/${id}`);

/** Product facts the assistant may state. Built from the constants the app itself enforces. */
function botFacts(): string[] {
  const feePct = Number(FEE_BPS) / 100;
  const creatorPct = (Number(FEE_BPS) * Number(CREATOR_SHARE_BPS)) / Number(BPS) / 100;
  return [
    `${APP_NAME} is a social market for tokenized stocks on BNB Smart Chain. Stocks are the main thing: you buy, hold and sell single stock tokens like NVDA or TSLA.`,
    "Stock tokens are issued by providers (bStocks and Ondo). They are not direct shares in the company. A bought stock sits in the user's own wallet.",
    "Baskets are a side feature: a fixed recipe of 2 to 5 stocks with set weights, made by a user. The recipe never changes and nothing is rebalanced.",
    "Buying a basket creates the user's own position holding the exact tokens bought. A basket has no token or price of its own; its index starts at 1,000 at launch.",
    "Everything is bought and sold with USDT on BNB Smart Chain. Users also need a little BNB for network fees.",
    `The buy fee is ${feePct}% of the amount, charged once. On a basket buy the basket's creator gets ${creatorPct}% of the amount (a quarter of the fee). The sell fee is ${feePct}% of the proceeds. Creating a basket has no app fee.`,
    `Minimum buy is $${MIN_BUY_USD_SMALL} for a single stock or a basket of up to 3 stocks, and $${MIN_BUY_USD_LARGE} for a basket of 4 or 5.`,
    "A basket buy is not atomic: each stock is bought in turn, and the position is only created once every stock has been bought.",
    "Sell turns a share of every stock in a position into USDT. Redeem returns that share of the stock tokens themselves.",
    "Users sign every transaction with their own wallet. The app and this assistant never hold funds and cannot buy, sell or move anything.",
    "Each basket can have a club: a Telegram group run by its creator, open only to wallets holding the basket. Admins will never DM you first.",
    "Prices are indicative marks. Stock tokens may not trade while their market is closed.",
  ];
}

export function botConfig() {
  return { appName: APP_NAME, maxBuyUsd: BOT_MAX_BUY_USD, facts: botFacts() };
}

/** "baskets": the Baskets tab's Trending order, with the index and 24h move the site shows. */
export async function botBaskets(limit = 5) {
  const stacks = await listStacks("trending");
  return {
    items: stacks.slice(0, limit).map((s) => ({
      name: s.name,
      ticker: s.ticker,
      stocks: s.components.length,
      index: s.index,
      change24h: s.change24h,
      investedUsd: s.valueHeldUsd,
    })),
    total: stacks.length,
  };
}

type Pick3 = Pick<StackRow, "id" | "name" | "ticker">;

export async function findBasket(query: string): Promise<BasketMatch<Pick3>> {
  const rows = must(await db().from("stacks").select("id, name, ticker").order("created_at", { ascending: false }).limit(200)) as Pick3[];
  return matchBasket(
    query,
    rows.map((r) => ({ ...r, id: Number(r.id) })),
  );
}

/** Shape shared by every "which basket?" reply, so the bot handles ambiguity in one place. */
function unresolved(m: Exclude<BasketMatch<Pick3>, { kind: "one" }>) {
  return m.kind === "many" ? { match: "many" as const, options: m.options.map((o) => ({ name: o.name, ticker: o.ticker })) } : { match: "none" as const };
}

/** "price <basket>": index, 24h move and each stock with its weight, price and market state. */
export async function botPrice(query: string) {
  const m = await findBasket(query);
  if (m.kind !== "one") return unresolved(m);
  const stack = await getStackSummary(m.basket.id);
  if (!stack) return { match: "none" as const };
  const components = await componentAssets(stack);
  return {
    match: "one" as const,
    basket: {
      name: stack.name,
      ticker: stack.ticker,
      index: stack.index,
      change24h: stack.change24h,
      change7d: stack.change7d,
      sinceLaunch: stack.change,
      investedUsd: stack.valueHeldUsd,
      url: basketUrl(Number(stack.id)),
      components: components.map((c, i) => ({
        ticker: stack.components[i]!.ticker,
        weightPct: stack.components[i]!.weight_bps / 100,
        priceUsd: c.price?.price_usd == null ? null : Number(c.price.price_usd),
        change24h: c.price?.change_24h == null ? null : Number(c.price.change_24h),
        marketOpen: c.price?.market_open ?? null,
      })),
    },
  };
}

/** "portfolio": the same numbers as /api/portfolio, for the wallet tied to the phone. */
export async function botPortfolio(user: BotUser, opts: { week?: boolean } = {}) {
  const p = await portfolioFor(user.wallet, user.profile.id);
  const week = new Map<number, number | null>();
  if (opts.week && p.positions.length) {
    const ids = [...new Set(p.positions.map((x) => x.stackId))];
    const rows = must(await db().from("stacks").select("*").in("id", ids)) as StackRow[];
    for (const s of await summarize(rows)) week.set(Number(s.id), s.change7d);
  }
  return {
    totalUsd: p.totalUsd,
    change24hUsd: p.change24hUsd,
    usdt: p.usdt.display,
    positions: p.positions.map((x) => ({
      id: x.id,
      name: x.stackName,
      ticker: x.stackTicker,
      valueUsd: x.valueUsd,
      costBasisUsd: x.costBasisUsd,
      pnlUsd: x.pnlUsd,
      pnlPct: x.pnlPct,
      ...(opts.week ? { basketChange7d: week.get(x.stackId) ?? null } : {}),
    })),
    stocks: p.holdings.map((h) => ({ ticker: h.ticker, valueUsd: h.valueUsd, pnlUsd: h.pnlUsd, pnlPct: h.pnlPct, change24h: h.change24h })),
    url: appUrl(`/app/u/${user.profile.username}`),
  };
}

/**
 * "buy <amount> <basket>": checks the amount against the app's own limits and returns a link to
 * the basket page that opens the existing buy sheet with the amount filled in. Nothing is bought.
 */
export async function botBuyLink(query: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return { match: "bad_amount" as const };
  const m = await findBasket(query);
  if (m.kind !== "one") return unresolved(m);
  const stack = must(await db().from("stacks").select("*").eq("id", m.basket.id).maybeSingle()) as StackRow | null;
  if (!stack) return { match: "none" as const };
  const usd = Math.round(amount * 100) / 100;
  const minUsd = stack.components.length >= 4 ? MIN_BUY_USD_LARGE : MIN_BUY_USD_SMALL;
  const basket = { name: stack.name, ticker: stack.ticker };
  if (usd < minUsd) return { match: "below_min" as const, basket, minUsd };
  if (usd > BOT_MAX_BUY_USD) return { match: "above_max" as const, basket, maxUsd: BOT_MAX_BUY_USD };
  const components = await componentAssets(stack);
  return {
    match: "one" as const,
    basket,
    amountUsd: usd,
    url: `${basketUrl(Number(stack.id))}?buy=${usd}`,
    closed: components.filter((c) => c.price?.market_open === false).map((c) => c.ticker),
  };
}

/** "club <basket>": the Telegram link, only for the creator or a wallet holding the basket onchain. */
export async function botClub(user: BotUser, query: string) {
  const m = await findBasket(query);
  if (m.kind !== "one") return unresolved(m);
  const stack = must(await db().from("stacks").select("*").eq("id", m.basket.id).maybeSingle()) as StackRow | null;
  if (!stack) return { match: "none" as const };
  const [role, url] = await Promise.all([
    clubAccess(stack, { privyId: user.profile.privy_id, wallet: user.wallet, wallets: [user.wallet], profile: user.profile }),
    getClubLink(Number(stack.id)),
  ]);
  return {
    match: "one" as const,
    basket: { name: stack.name, ticker: stack.ticker },
    isMember: role.isMember,
    hasLink: url !== null,
    url: role.isMember ? url : null,
    basketUrl: basketUrl(Number(stack.id)),
  };
}

type StockOut = {
  ticker: string;
  name: string;
  provider: string;
  address: string;
  priceUsd: number | null;
  change24h: number | null;
  marketOpen: boolean | null;
  canTrade: boolean;
  url: string;
};

const stockUrl = (a: Pick<AssetRow, "provider" | "address">) => appUrl(`/app/stock/${a.provider}/${a.address}`);

function stockOut(a: AssetRow, price: AssetPriceRow | null): StockOut {
  return {
    ticker: a.ticker,
    name: a.name,
    provider: a.provider,
    address: a.address,
    priceUsd: price?.price_usd == null ? null : Number(price.price_usd),
    change24h: price?.change_24h == null ? null : Number(price.change_24h),
    marketOpen: price?.market_open ?? null,
    canTrade: a.can_trade,
    url: stockUrl(a),
  };
}

// One entry per stock, like the site's lists: the tradable bStocks token stands for the ticker.
const stockRank = (a: AssetRow) => (a.can_trade ? 2 : 0) + (a.provider === "bstock" ? 1 : 0);

type StockMatch = { match: "one"; asset: AssetRow } | { match: "many"; options: { ticker: string; name: string }[] } | { match: "none" };

async function findStock(query: string): Promise<StockMatch> {
  const q = query.replace(/[%_,()*$]/g, "").replace(/\b(stock|shares?|token)\b/gi, " ").trim();
  if (!q) return { match: "none" };
  const like = `%${q}%`;
  const rows = must(
    await db().from("assets").select("*").eq("can_browse", true).or(`ticker.ilike.${like},symbol.ilike.${like},name.ilike.${like}`).limit(40),
  ) as AssetRow[];
  if (!rows.length) return { match: "none" };
  const byTicker = new Map<string, AssetRow>();
  for (const a of rows) {
    const cur = byTicker.get(a.ticker);
    if (!cur || stockRank(a) > stockRank(cur)) byTicker.set(a.ticker, a);
  }
  const exact = byTicker.get(q.toUpperCase());
  const picks = exact ? [exact] : [...byTicker.values()];
  if (picks.length > 1) return { match: "many", options: picks.slice(0, 5).map((a) => ({ ticker: a.ticker, name: a.name })) };
  return { match: "one", asset: picks[0]! };
}

async function priceRow(address: string): Promise<AssetPriceRow | null> {
  return must(await db().from("asset_prices").select("*").eq("address", address).maybeSingle()) as AssetPriceRow | null;
}

/** A single stock token by ticker or company name: price, 24h move and market state. */
export async function botStock(query: string) {
  const m = await findStock(query);
  if (m.match !== "one") return m;
  return { match: "one" as const, stock: stockOut(m.asset, await priceRow(m.asset.address)) };
}

/** "stocks": the tradable stocks, most traded first, or the day's biggest movers. */
export async function botStocks(sort: "volume" | "gainers" | "losers" = "volume", limit = 6) {
  const assets = must(await db().from("assets").select("*").eq("can_browse", true).eq("can_trade", true)) as AssetRow[];
  const prices = must(await db().from("asset_prices").select("*").in("address", assets.map((a) => a.address))) as AssetPriceRow[];
  const priceBy = new Map(prices.map((p) => [p.address, p]));
  const byTicker = new Map<string, AssetRow>();
  for (const a of assets) {
    const cur = byTicker.get(a.ticker);
    if (!cur || stockRank(a) > stockRank(cur)) byTicker.set(a.ticker, a);
  }
  const n = (v: string | null | undefined) => (v == null ? null : Number(v));
  const rows = [...byTicker.values()].map((a) => ({ a, p: priceBy.get(a.address) ?? null }));
  rows.sort((x, y) => {
    if (sort === "gainers") return (n(y.p?.change_24h) ?? -1e9) - (n(x.p?.change_24h) ?? -1e9);
    if (sort === "losers") return (n(x.p?.change_24h) ?? 1e9) - (n(y.p?.change_24h) ?? 1e9);
    return (n(y.p?.volume_24h) ?? 0) - (n(x.p?.volume_24h) ?? 0);
  });
  return { sort, items: rows.slice(0, limit).map(({ a, p }) => stockOut(a, p)), total: rows.length };
}

/**
 * What the user means by a name: a stock first, a basket second. An exact ticker always wins; a
 * name that fits both kinds comes back as a choice.
 */
export async function botLookup(query: string) {
  const [stock, basket] = await Promise.all([findStock(query), findBasket(query)]);
  const q = query.replace(/^\$/, "").trim().toUpperCase();
  if (stock.match === "one" && (stock.asset.ticker === q || basket.kind === "none")) {
    return { match: "stock" as const, stock: stockOut(stock.asset, await priceRow(stock.asset.address)) };
  }
  if (basket.kind === "one" && stock.match === "none") {
    const r = await botPrice(basket.basket.ticker);
    return r.match === "one" ? { match: "basket" as const, basket: r.basket } : { match: "none" as const };
  }
  const options = [
    ...(stock.match === "one" ? [{ kind: "stock" as const, ticker: stock.asset.ticker, name: stock.asset.name }] : []),
    ...(stock.match === "many" ? stock.options.map((o) => ({ kind: "stock" as const, ...o })) : []),
    ...(basket.kind === "one" ? [{ kind: "basket" as const, ticker: basket.basket.ticker, name: basket.basket.name }] : []),
    ...(basket.kind === "many" ? basket.options.map((o) => ({ kind: "basket" as const, ticker: o.ticker, name: o.name })) : []),
  ];
  return options.length ? { match: "many" as const, options: options.slice(0, 6) } : { match: "none" as const };
}

/** A link that opens the stock's (or basket's) buy form with the amount filled in. Nothing is bought. */
export async function botBuyLinkAny(query: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return { match: "bad_amount" as const };
  const usd = Math.round(amount * 100) / 100;
  const found = await botLookup(query);
  if (found.match === "none" || found.match === "many") return found;
  if (found.match === "basket") {
    const r = await botBuyLink(found.basket.ticker, usd);
    return r.match === "one" ? { ...r, match: "basket" as const } : r;
  }
  const s = found.stock;
  const target = { kind: "stock" as const, ticker: s.ticker, name: s.name };
  if (!s.canTrade) return { match: "not_tradable" as const, target };
  if (usd < MIN_BUY_USD_SMALL) return { match: "below_min" as const, basket: { name: s.ticker, ticker: s.ticker }, minUsd: MIN_BUY_USD_SMALL };
  if (usd > BOT_MAX_BUY_USD) return { match: "above_max" as const, basket: { name: s.ticker, ticker: s.ticker }, maxUsd: BOT_MAX_BUY_USD };
  return { match: "stock" as const, target, amountUsd: usd, url: `${s.url}?buy=${usd}`, closed: s.marketOpen === false ? [s.ticker] : [] };
}

type NewsOut = { headline: string; summary: string; source: string; url: string; at: number; tickers?: string[] };
const newsOut = (n: NewsItem & { tickers?: string[] }): NewsOut => ({ headline: n.headline, summary: n.summary.slice(0, 220), source: n.source, url: n.url, at: n.at, ...(n.tickers ? { tickers: n.tickers } : {}) });

/**
 * "news": with a name, the latest stories on that stock plus its price, so a reply can set one
 * beside the other. Without one, a briefing: stories on the stocks this user holds, then the
 * market's top headlines. `connected: false` when no news provider key is set.
 */
export async function botNews(user: BotUser, query?: string) {
  if (query?.trim()) {
    const m = await findStock(query);
    if (m.match !== "one") return m;
    const [items, price] = await Promise.all([companyNews(m.asset.ticker), priceRow(m.asset.address)]);
    return { match: "one" as const, connected: items !== null, stock: stockOut(m.asset, price), items: (items ?? []).slice(0, 6).map(newsOut) };
  }
  const held = must(await db().from("holders").select("target_id, net_units").eq("profile_id", user.profile.id).eq("target_type", "asset")) as Pick<HolderRow, "target_id" | "net_units">[];
  const addresses = held.filter((h) => Number(h.net_units) > 0).map((h) => h.target_id);
  const tickers = addresses.length
    ? [...new Set((must(await db().from("assets").select("ticker").in("address", addresses)) as Pick<AssetRow, "ticker">[]).map((a) => a.ticker))].slice(0, 5)
    : [];
  const [mine, market] = await Promise.all([tickers.length ? basketNews(tickers) : Promise.resolve([]), marketNews("general")]);
  return {
    match: "briefing" as const,
    connected: market !== null && mine !== null,
    holdings: tickers,
    yours: (mine ?? []).slice(0, 5).map(newsOut),
    market: (market ?? []).slice(0, 5).map(newsOut),
  };
}
