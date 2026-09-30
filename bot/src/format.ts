import type { BasketRef, Baskets, Buy, Club, Portfolio, Price } from "./api.js";

// Every reply is built here, by code: links come from the site's API as-is and money is formatted
// from its numbers. A missing number is said out loud ("price unavailable"), never filled in.

export function usd(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function signedUsd(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Whole dollars lose the cents: $25, $25.50. */
export function plainUsd(n: number): string {
  return Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : usd(n);
}

export function pct(n: number): string {
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** A basket has no token price: its value is an index, shown without "$". */
export function indexNumber(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function price(n: number): string {
  return n < 1 ? `$${Number(n.toPrecision(4))}` : usd(n);
}

export function helpText(appName: string): string {
  return [
    `${appName} by text:`,
    "baskets: top baskets",
    "price <basket>: value and what's inside",
    "portfolio: your positions",
    "buy <amount> <basket>: get a link to confirm",
    "club <basket>: the holders' Telegram",
    "stop: disconnect this number",
  ].join("\n");
}

export const welcome = (appName: string, username: string) => `You're connected to ${appName} as @${username}. Text "help" to see what I can do.`;

// Sent to numbers that haven't linked. Text only: no link before the person has an account link.
export const notLinked = (appName: string) =>
  `This number isn't connected to ${appName} yet. In the app, open Settings on your profile and tap Connect iMessage.`;

export const needPhone = () =>
  "I can only work with a phone number. On your iPhone, go to Settings, Messages, Send & Receive and start new conversations from your number, then connect again.";

export const linkUsage = () => "Send the 6-digit code from Connect iMessage in the app, like: link 123456";
export const badCode = () => "That code didn't work. Codes last 10 minutes and only work from the number you entered. Get a new one in the app.";
export const tooFast = () => "That's a lot of tries. Wait a few minutes and try again.";
export const unlinked = (appName: string) => `Disconnected. This number no longer has access to your ${appName} account. You can connect again from the app.`;
export const notConnected = () => "This number isn't connected, so there's nothing to disconnect.";
export const unreachable = (appName: string) => `I can't reach ${appName} right now. Try again in a bit.`;
export const clarify = () => `I didn't catch that. Text "help" to see what I can do.`;
export const textOnly = () => "I can only read text messages.";

export function whichBasket(options: BasketRef[]): string {
  return ["Which basket?", ...options.map((o, i) => `${i + 1}. ${o.name} ($${o.ticker})`), "Reply with the number."].join("\n");
}

export const notFound = (query: string) => `I couldn't find a basket called "${query.slice(0, 40)}". Text "baskets" to see the top ones.`;
export const needBasket = (verb: string) => `Which basket? For example: ${verb} ai kings`;
export const needAmount = (basket: string) => `How much? For example: buy 25 ${basket}`;

export function basketsReply(d: Baskets): string {
  if (!d.items.length) return "There are no baskets yet.";
  const rows = d.items.map((b, i) => {
    const value = b.index === null ? "no price yet" : indexNumber(b.index);
    const move = b.change24h === null ? "" : ` ${pct(b.change24h)}`;
    return `${i + 1}. ${b.name} ($${b.ticker}) ${value}${move}`;
  });
  return ["Top baskets (index, 24h):", ...rows, 'Text "price <name>" for more.'].join("\n");
}

export function priceReply(p: Extract<Price, { match: "one" }>): string {
  const b = p.basket;
  const head = [`${b.name} ($${b.ticker})`];
  if (b.index === null) head.push("Index unavailable right now.");
  else {
    const moves = [b.change24h === null ? null : `${pct(b.change24h)} 24h`, b.change7d === null ? null : `${pct(b.change7d)} 7d`].filter(Boolean);
    head.push(`Index ${indexNumber(b.index)}${moves.length ? `, ${moves.join(", ")}` : ""}`);
  }
  const rows = b.components.map((c) => {
    const weight = `${Number(c.weightPct.toFixed(2))}%`;
    const px = c.priceUsd === null ? "price unavailable" : `${price(c.priceUsd)}${c.change24h === null ? "" : ` ${pct(c.change24h)}`}`;
    return `${c.ticker} ${weight}: ${px}${c.marketOpen === false ? " (market closed)" : ""}`;
  });
  return [...head, ...rows, b.url].join("\n");
}

const MAX_ROWS = 6;

export function portfolioReply(p: Portfolio): string {
  const lines: string[] = [];
  if (p.totalUsd === null) lines.push("Total unavailable right now.");
  else lines.push(`Total ${usd(p.totalUsd)}${p.change24hUsd === null || Math.abs(p.change24hUsd) < 0.005 ? "" : ` (${signedUsd(p.change24hUsd)} 24h)`}`);
  lines.push(`USDT ${usd(p.usdt)}`);
  const rows = [
    ...p.positions.map((x) => {
      const name = `${x.name ?? (x.ticker ? `$${x.ticker}` : "Basket")} #${x.id}`;
      if (x.valueUsd === null) return `${name}: value unavailable`;
      const pnl = x.pnlUsd === null ? "" : `, ${signedUsd(x.pnlUsd)}${x.pnlPct === null ? "" : ` (${pct(x.pnlPct)})`}`;
      return `${name}: ${usd(x.valueUsd)}${pnl}`;
    }),
    ...p.stocks.map((s) => (s.valueUsd === null ? `${s.ticker}: value unavailable` : `${s.ticker}: ${usd(s.valueUsd)}${s.pnlUsd === null ? "" : `, ${signedUsd(s.pnlUsd)}`}`)),
  ];
  if (!rows.length) lines.push("No positions yet.");
  else {
    lines.push(...rows.slice(0, MAX_ROWS));
    if (rows.length > MAX_ROWS) lines.push(`+${rows.length - MAX_ROWS} more in the app`);
  }
  lines.push(p.url);
  return lines.join("\n");
}

export function buyReply(b: Exclude<Buy, { match: "many" | "none" }>): string {
  switch (b.match) {
    case "bad_amount":
      return "That amount doesn't look right. For example: buy 25 ai kings";
    case "below_min":
      return `The minimum buy for ${b.basket.name} is ${plainUsd(b.minUsd)}.`;
    case "above_max":
      return `I can set up buys up to ${plainUsd(b.maxUsd)} by text. For more, buy in the app.`;
    case "one": {
      const note = b.closed.length ? `\nMarket closed for ${b.closed.join(", ")}, so the buy may not go through until it opens.` : "";
      return `Buy ${plainUsd(b.amountUsd)} of ${b.basket.name}? Tap to open it and confirm:\n${b.url}${note}`;
    }
  }
}

const NO_DM = "Admins will never DM you first.";

export function clubReply(c: Extract<Club, { match: "one" }>): string {
  if (!c.isMember) return `You need to buy in to join the ${c.basket.name} club. Text "buy <amount> ${c.basket.name}" to get a link. ${NO_DM}`;
  if (!c.url) return `${c.basket.name} doesn't have a club link yet.`;
  return `${c.basket.name} club on Telegram:\n${c.url}\n${NO_DM}`;
}

/** Facts for "how did my baskets do this week": figures by code; the model only adds a sentence. */
export function weekReply(p: Portfolio, sentence: string | null): string {
  if (!p.positions.length) return `You don't hold any baskets yet.\n${p.url}`;
  const rows = p.positions.slice(0, MAX_ROWS).map((x) => {
    const name = x.name ?? (x.ticker ? `$${x.ticker}` : `Basket #${x.id}`);
    const week = x.basketChange7d === null || x.basketChange7d === undefined ? "7d move unavailable" : `basket ${pct(x.basketChange7d)} 7d`;
    const pnl = x.pnlUsd === null ? "" : `, you ${signedUsd(x.pnlUsd)}${x.pnlPct === null ? "" : ` (${pct(x.pnlPct)})`} since buying`;
    return `${name}: ${week}${pnl}`;
  });
  const lines = [...(sentence ? [sentence] : []), ...rows];
  if (p.positions.length > MAX_ROWS) lines.push(`+${p.positions.length - MAX_ROWS} more in the app`);
  lines.push(p.url);
  return lines.join("\n");
}
