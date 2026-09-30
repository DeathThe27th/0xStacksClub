import type { Api, BotConfig } from "./api.js";
import * as f from "./format.js";

// The things the assistant can look up or set up. Each tool calls the site's /api/bot routes and
// returns two views of the same result: `data` for the model (figures already formatted as text,
// so it copies them instead of doing arithmetic) and `fallback`, the reply our own code would
// send. If the model's wording fails the checks in assistant.ts, the fallback is sent instead.

export type ToolResult = {
  data: Record<string, unknown>;
  fallback: string;
  /** Links the reply must contain, e.g. the confirm link for a buy. */
  mustInclude?: string[];
  /** Send the contact card after the reply. */
  contactCard?: boolean;
};

export type Tools = {
  declarations: { name: string; description: string; parametersJsonSchema: unknown }[];
  run(name: string, args: Record<string, unknown>): Promise<ToolResult>;
};

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object", properties, required });
const basketArg = { basket: { type: "string", description: "Basket name or ticker, as the user wrote it" } };

export const declarations: Tools["declarations"] = [
  { name: "list_baskets", description: "Top baskets right now with their index value and 24h change.", parametersJsonSchema: obj() },
  { name: "get_basket", description: "One basket: index, 24h and 7d change, and each stock in it with weight, price and market state.", parametersJsonSchema: obj(basketArg, ["basket"]) },
  {
    name: "get_stock",
    description: "One tokenized stock by ticker or company name: price, 24h change and whether its market is open.",
    parametersJsonSchema: obj({ stock: { type: "string", description: "Ticker or company name" } }, ["stock"]),
  },
  { name: "get_portfolio", description: "The user's own total value, USDT balance, basket positions with profit and loss, and single stocks. Also gives each held basket's 7-day move.", parametersJsonSchema: obj() },
  {
    name: "make_buy_link",
    description: "Creates a link that opens the basket's buy form with the amount filled in. It does not buy anything: the user must tap the link and confirm in the app.",
    parametersJsonSchema: obj({ ...basketArg, amount_usd: { type: "number", description: "US dollars to buy" } }, ["basket", "amount_usd"]),
  },
  { name: "get_club_link", description: "The Telegram club link for a basket. Only given to users who hold the basket.", parametersJsonSchema: obj(basketArg, ["basket"]) },
  { name: "send_contact_card", description: "Sends the user a contact card for this number so they can save it under the app's name.", parametersJsonSchema: obj() },
];

const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
const orNA = (n: number | null | undefined, fmt: (n: number) => string) => (n === null || n === undefined ? "unavailable" : fmt(n));

function unresolved(query: string, r: { match: "many"; options: { name: string; ticker: string }[] } | { match: "none" }): ToolResult {
  if (r.match === "none") return { data: { status: "not_found", searched: query }, fallback: f.notFound(query) };
  return {
    data: { status: "ambiguous", options: r.options.map((o) => `${o.name} ($${o.ticker})`), instruction: "Ask the user which one they mean." },
    fallback: ["Which one?", ...r.options.map((o) => `${o.name} ($${o.ticker})`)].join("\n"),
  };
}

export function createTools(api: Api, phone: string, config: BotConfig): Tools {
  async function run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case "list_baskets": {
        const d = await api.baskets(phone);
        return {
          data: {
            note: "index is a number without a currency sign; a basket has no price",
            baskets: d.items.map((b) => ({ name: b.name, ticker: `$${b.ticker}`, stocks: b.stocks, index: orNA(b.index, f.indexNumber), change24h: orNA(b.change24h, f.pct) })),
          },
          fallback: f.basketsReply(d),
        };
      }
      case "get_basket": {
        const q = str(args.basket);
        if (!q) return { data: { status: "need_basket_name" }, fallback: f.needBasket("price") };
        const r = await api.price(phone, q);
        if (r.match !== "one") return unresolved(q, r);
        const b = r.basket;
        return {
          data: {
            name: b.name,
            ticker: `$${b.ticker}`,
            index: orNA(b.index, f.indexNumber),
            change24h: orNA(b.change24h, f.pct),
            change7d: orNA(b.change7d, f.pct),
            sinceLaunch: orNA(b.sinceLaunch, f.pct),
            investedByAllHolders: orNA(b.investedUsd, f.usd),
            stocks: b.components.map((c) => ({
              ticker: c.ticker,
              weight: `${Number(c.weightPct.toFixed(2))}%`,
              price: orNA(c.priceUsd, f.price),
              change24h: orNA(c.change24h, f.pct),
              market: c.marketOpen === false ? "closed" : c.marketOpen === true ? "open" : "unknown",
            })),
            link: b.url,
          },
          fallback: f.priceReply(r),
        };
      }
      case "get_stock": {
        const q = str(args.stock);
        if (!q) return { data: { status: "need_stock_name" }, fallback: "Which stock? For example: NVDA" };
        const r = await api.stock(phone, q);
        if (r.match === "none") return { data: { status: "not_found", searched: q }, fallback: `I couldn't find a stock matching "${q.slice(0, 40)}".` };
        if (r.match === "many") {
          const options = r.options.map((o) => `${o.ticker} (${o.name})`);
          return { data: { status: "ambiguous", options, instruction: "Ask the user which one they mean." }, fallback: ["Which one?", ...options].join("\n") };
        }
        const s = r.stock;
        return {
          data: {
            ticker: s.ticker,
            name: s.name,
            issuer: s.provider === "bstock" ? "bStocks" : "Ondo",
            price: orNA(s.priceUsd, f.price),
            change24h: orNA(s.change24h, f.pct),
            market: s.marketOpen === false ? "closed" : s.marketOpen === true ? "open" : "unknown",
            tradableInApp: s.canTrade,
            link: s.url,
          },
          fallback: f.stockReply(r),
        };
      }
      case "get_portfolio": {
        const p = await api.portfolio(phone, true);
        return {
          data: {
            total: orNA(p.totalUsd, f.usd),
            change24h: orNA(p.change24hUsd, f.signedUsd),
            usdt: f.usd(p.usdt),
            positions: p.positions.map((x) => ({
              basket: x.name ?? x.ticker ?? "unknown",
              position: `#${x.id}`,
              value: orNA(x.valueUsd, f.usd),
              paid: f.usd(x.costBasisUsd),
              profit: orNA(x.pnlUsd, f.signedUsd),
              profitPct: orNA(x.pnlPct, f.pct),
              basketMove7d: orNA(x.basketChange7d, f.pct),
            })),
            stocks: p.stocks.map((s) => ({ ticker: s.ticker, value: orNA(s.valueUsd, f.usd), profit: orNA(s.pnlUsd, f.signedUsd), change24h: orNA(s.change24h, f.pct) })),
            note: "basketMove7d is the basket's index move over 7 days, not the user's own profit for the week. Weekly profit per position isn't tracked.",
            link: p.url,
          },
          fallback: f.portfolioReply(p),
        };
      }
      case "make_buy_link": {
        const q = str(args.basket);
        const amount = typeof args.amount_usd === "number" ? Math.round(args.amount_usd * 100) / 100 : NaN;
        if (!q) return { data: { status: "need_basket_name" }, fallback: f.needBasket("buy 25") };
        if (!Number.isFinite(amount) || amount <= 0) return { data: { status: "need_amount", instruction: "Ask how many dollars." }, fallback: f.needAmount(q) };
        if (amount > config.maxBuyUsd) {
          const r = { match: "above_max" as const, basket: { name: q, ticker: "" }, maxUsd: config.maxBuyUsd };
          return { data: { status: "over_limit", limit: f.plainUsd(config.maxBuyUsd) }, fallback: f.buyReply(r) };
        }
        const r = await api.buy(phone, q, amount);
        if (r.match === "many" || r.match === "none") return unresolved(q, r);
        if (r.match === "below_min") return { data: { status: "below_minimum", basket: r.basket.name, minimum: f.plainUsd(r.minUsd) }, fallback: f.buyReply(r) };
        if (r.match !== "one") return { data: { status: r.match === "above_max" ? "over_limit" : "bad_amount" }, fallback: f.buyReply(r) };
        return {
          data: {
            status: "link_ready",
            basket: r.basket.name,
            amount: f.plainUsd(r.amountUsd),
            link: r.url,
            ...(r.closed.length ? { warning: `The market is closed for ${r.closed.join(", ")}. Those stocks may not be buyable until it opens. Say only that.` } : {}),
            instruction: "Nothing has been bought. Give the user the link and tell them to tap it and confirm in the app.",
          },
          fallback: f.buyReply(r),
          mustInclude: [r.url],
        };
      }
      case "get_club_link": {
        const q = str(args.basket);
        if (!q) return { data: { status: "need_basket_name" }, fallback: f.needBasket("club") };
        const r = await api.club(phone, q);
        if (r.match !== "one") return unresolved(q, r);
        const warning = "Admins will never DM you first.";
        if (!r.isMember) return { data: { status: "not_a_holder", basket: r.basket.name, instruction: "They must buy the basket to join.", warning }, fallback: f.clubReply(r), mustInclude: [warning] };
        if (!r.url) return { data: { status: "no_club_link_yet", basket: r.basket.name }, fallback: f.clubReply(r) };
        return { data: { status: "ok", basket: r.basket.name, link: r.url, warning }, fallback: f.clubReply(r), mustInclude: [r.url, warning] };
      }
      case "send_contact_card":
        return { data: { status: "sent", instruction: "Tell the user to tap the card and save it." }, fallback: "Here's my contact card. Tap it to save this number.", contactCard: true };
      default:
        return { data: { status: "unknown_tool" }, fallback: f.clarify() };
    }
  }
  return { declarations, run };
}
