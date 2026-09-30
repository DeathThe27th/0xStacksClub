import "server-only";
import { z } from "zod";
import { matchBasket, type BasketMatch } from "@/lib/basketMatch";
import { APP_NAME, BOT_MAX_BUY_USD, BPS, CREATOR_SHARE_BPS, FEE_BPS, MIN_BUY_USD_LARGE, MIN_BUY_USD_SMALL } from "@/lib/constants";
import { serverEnv } from "@/lib/env";
import type { AssetPriceRow, AssetRow, StackRow } from "@/lib/supabase/types";
import { clubAccess, getClubLink } from "@/server/clubs";
import { db, must } from "@/server/db";
import { handler, HttpError, json, readJson } from "@/server/http";
import { botRateLimit, linkedUser, requireBot, type BotUser } from "@/server/imessage";
import { portfolioFor } from "@/server/portfolio";
import { componentAssets, getStackSummary, listStacks, summarize } from "@/server/stacks";

// Everything the iMessage bot can ask for. The bot holds no Binance, Supabase or wallet secrets:
// it sends a phone and a request, these helpers do the work with the same server code the site
// uses, and every link in a reply is built here from NEXT_PUBLIC_APP_URL.

export const phoneBody = z.object({ phone: z.string().min(8).max(20) });

type WithPhone = z.ZodType<{ phone: string }>;
const noStore = { headers: { "cache-control": "private, no-store" } };

/** A /api/bot route: shared-secret check, body validation and a per-phone rate limit. */
export function botRoute<T extends WithPhone>(schema: T, fn: (body: z.infer<T>) => Promise<unknown>) {
  return handler(async (req: Request) => {
    requireBot(req);
    const body = await readJson(req, schema);
    await botRateLimit(body.phone);
    return json(await fn(body), noStore);
  });
}

/** Same, for routes that need the account behind the phone. An unlinked phone gets 403 `not_linked`. */
export function linkedBotRoute<T extends WithPhone>(schema: T, fn: (body: z.infer<T>, user: BotUser) => Promise<unknown>) {
  return botRoute(schema, async (body) => {
    const user = await linkedUser(body.phone);
    if (!user) throw new HttpError(403, "This phone isn't connected to an account", "not_linked");
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
    `${APP_NAME} is a social market for tokenized stocks and baskets of them on BNB Smart Chain.`,
    "A basket is a fixed recipe of 2 to 5 tokenized stocks with set weights. The recipe never changes and nothing is rebalanced.",
    "Buying a basket creates the user's own position holding the exact tokens bought. A basket has no token or price of its own; its index starts at 1,000 at launch.",
    "Stock tokens are issued by providers (bStocks and Ondo). They are not direct shares in the company.",
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

/** A single stock token by ticker or company name: price, 24h move and market state. */
export async function botStock(query: string) {
  const q = query.replace(/[%_,()*$]/g, "").trim();
  if (!q) return { match: "none" as const };
  const like = `%${q}%`;
  const rows = must(
    await db().from("assets").select("*").eq("can_browse", true).or(`ticker.ilike.${like},symbol.ilike.${like},name.ilike.${like}`).limit(40),
  ) as AssetRow[];
  if (!rows.length) return { match: "none" as const };
  // One entry per stock, like the site's search: the tradable bStocks token stands for the ticker.
  const rank = (a: AssetRow) => (a.can_trade ? 2 : 0) + (a.provider === "bstock" ? 1 : 0);
  const byTicker = new Map<string, AssetRow>();
  for (const a of rows) {
    const cur = byTicker.get(a.ticker);
    if (!cur || rank(a) > rank(cur)) byTicker.set(a.ticker, a);
  }
  const exact = byTicker.get(q.toUpperCase());
  const picks = exact ? [exact] : [...byTicker.values()];
  if (picks.length > 1) return { match: "many" as const, options: picks.slice(0, 5).map((a) => ({ ticker: a.ticker, name: a.name })) };
  const a = picks[0]!;
  const price = must(await db().from("asset_prices").select("*").eq("address", a.address).maybeSingle()) as AssetPriceRow | null;
  return {
    match: "one" as const,
    stock: {
      ticker: a.ticker,
      name: a.name,
      provider: a.provider,
      priceUsd: price?.price_usd == null ? null : Number(price.price_usd),
      change24h: price?.change_24h == null ? null : Number(price.change_24h),
      marketOpen: price?.market_open ?? null,
      canTrade: a.can_trade,
      url: appUrl(`/app/stock/${a.provider}/${a.address}`),
    },
  };
}
