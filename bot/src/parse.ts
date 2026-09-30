// Keyword parser. The exact commands are understood here without any model; `parseLoose` is the
// fallback for plain-English messages when Gemini is off, slow, rate limited or wrong.

export type Command =
  | { kind: "link"; code: string }
  | { kind: "stop" }
  | { kind: "help" }
  | { kind: "stocks"; sort: "volume" | "gainers" | "losers" }
  | { kind: "baskets" }
  | { kind: "portfolio" }
  | { kind: "price"; basket: string }
  | { kind: "club"; basket: string }
  | { kind: "buy"; amount: number | null; basket: string }
  | { kind: "sell"; name: string; percent?: number; usd?: number }
  | { kind: "news"; name: string }
  | { kind: "question"; text: string }
  | { kind: "unknown" };

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** "25", "$25", "25.50", "1,000", "25 usd". Null when it isn't a plain positive number. */
export function parseAmount(s: string): number | null {
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(?:usd|usdt|dollars?|bucks)?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(`${m[1]!.replace(/,/g, "")}${m[2] ?? ""}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The documented commands, exactly as `help` lists them. Anything else is `unknown`. */
export function parseCommand(input: string): Command {
  const text = clean(input);
  const lower = text.toLowerCase();

  const link = /^link[\s:]*(\d{6})$/.exec(lower);
  if (link) return { kind: "link", code: link[1]! };
  // Telegram's deep link arrives as "/start <code>"; a bare "/start" is just hello.
  const start = /^\/start(?:@\w+)? ([A-Za-z0-9_-]{16,64})$/.exec(text);
  if (start) return { kind: "link", code: start[1]! };
  if (/^\/start(?:@\w+)?$/.test(lower)) return { kind: "help" };
  if (/^link\b/.test(lower)) return { kind: "link", code: "" };
  if (/^(stop|unlink|disconnect|unsubscribe)$/.test(lower)) return { kind: "stop" };
  if (/^\/?(help|\?|menu|commands)$/.test(lower)) return { kind: "help" };
  if (/^(stocks?|top|top stocks|trending|list)$/.test(lower)) return { kind: "stocks", sort: "volume" };
  if (/^(movers|gainers|top gainers)$/.test(lower)) return { kind: "stocks", sort: "gainers" };
  if (/^(losers|top losers)$/.test(lower)) return { kind: "stocks", sort: "losers" };
  if (/^(baskets?|top baskets)$/.test(lower)) return { kind: "baskets" };
  if (/^(portfolio|positions|holdings|balance|my portfolio)$/.test(lower)) return { kind: "portfolio" };

  const sell = /^sell\b ?(.*)$/i.exec(text);
  if (sell) return parseSell(sell[1]!);
  const news = /^(?:news|briefing|brief|headlines)(?: (?:on|for|about))?(?: (.+))?$/i.exec(text);
  if (news) return { kind: "news", name: news[1] ?? "" };

  const price = /^price(?: of)? (.+)$/i.exec(text);
  if (price) return { kind: "price", basket: price[1]! };
  const club = /^club (.+)$/i.exec(text);
  if (club) return { kind: "club", basket: club[1]! };

  // buy <amount> <basket>, also "buy $25 of ai kings" and "buy ai kings 25".
  const buy = /^buy (.+)$/i.exec(text);
  if (buy) {
    const rest = buy[1]!;
    const lead = /^(\$?[\d.,]+(?:\s?(?:usd|usdt|dollars?|bucks))?) (?:of |in |into |worth of )?(.+)$/i.exec(rest);
    if (lead && parseAmount(lead[1]!) !== null) return { kind: "buy", amount: parseAmount(lead[1]!), basket: lead[2]! };
    const tail = /^(.+?) (?:for )?(\$?[\d.,]+)$/i.exec(rest);
    if (tail && parseAmount(tail[2]!) !== null) return { kind: "buy", amount: parseAmount(tail[2]!), basket: tail[1]! };
    return { kind: "buy", amount: null, basket: rest };
  }
  return { kind: "unknown" };
}

/** What follows "sell": "all nvda", "half my tesla", "25% of nvda", "$5 of nvda", "nvda". */
function parseSell(rest: string): Command {
  let s = clean(rest).replace(/\b(my|the|shares?|stock|position|please|pls|now|for me)\b/gi, " ").replace(/\s+/g, " ").trim();
  let percent: number | undefined;
  let usd: number | undefined;
  const all = /\b(all|everything|100%)\b(?: of)?/i;
  const half = /\b(half|50%)\b(?: of)?/i;
  const pct = /(\d{1,3}(?:\.\d+)?) ?%(?: of)?/;
  const money = /\$ ?(\d+(?:\.\d{1,2})?)|\b(\d+(?:\.\d{1,2})?) ?(?:usd|usdt|dollars?|bucks)?\b(?: (?:of|worth of))?/i;
  if (all.test(s)) {
    percent = 100;
    s = s.replace(all, " ");
  } else if (half.test(s)) {
    percent = 50;
    s = s.replace(half, " ");
  } else if (pct.test(s)) {
    percent = Number(pct.exec(s)![1]);
    s = s.replace(pct, " ");
  } else {
    const m = money.exec(s);
    const n = m ? Number(m[1] ?? m[2]) : NaN;
    if (m && n > 0) {
      usd = n;
      s = s.replace(m[0], " ");
    }
  }
  const name = s.replace(/\b(of|worth)\b/gi, " ").replace(/\s+/g, " ").trim();
  return { kind: "sell", name, ...(percent !== undefined ? { percent } : {}), ...(usd !== undefined ? { usd } : {}) };
}

/** Best-effort reading of a sentence. Used only when the model can't be. */
export function parseLoose(input: string): Command {
  const text = clean(input);
  const lower = text.toLowerCase();

  const buy = /\bbuy\b (.+)$/i.exec(text);
  if (buy) {
    const cmd = parseCommand(`buy ${buy[1]!}`);
    if (cmd.kind === "buy") return cmd;
  }
  const selling = /\b(?:sell|cash out(?: of)?|dump)\b ?(.*?)[?.!]*$/i.exec(text);
  if (selling) return parseSell(selling[1]!);
  const newsOn = /\b(?:news|headlines|happening|going on)\b(?: (?:on|for|about|with))? ?(.*?)[?.!]*$/i.exec(text);
  if (newsOn) return { kind: "news", name: /^(today|now|me|in the market|the market)?$/i.test(newsOn[1] ?? "") ? "" : newsOn[1]! };
  if (/\b(briefing|brief me|catch me up)\b/.test(lower)) return { kind: "news", name: "" };
  const club = /\b(?:club|telegram|group(?: chat)?)\b(?: (?:for|of|link for))? (.+)$/i.exec(text);
  if (club) return { kind: "club", basket: club[1]!.replace(/[?.!]+$/, "") };
  const price = /\b(?:price|value|how(?:'s| is| are)|what(?:'s| is) in|check)\b(?: (?:of|for|the))* (.+?)(?: doing| looking| worth| today| now)*[?.!]*$/i.exec(text);
  if (/\bmy\b/.test(lower) && /\b(week|weekly|7 days|month|perform\w*|how did|how have)\b/.test(lower)) return { kind: "question", text };
  if (/\b(portfolio|my positions|my holdings|my balance|how am i doing)\b/.test(lower)) return { kind: "portfolio" };
  if (/\bbaskets?\b/.test(lower) && !price) return { kind: "baskets" };
  if (/\b(gainers|movers|up the most)\b/.test(lower)) return { kind: "stocks", sort: "gainers" };
  if (/\b(losers|down the most)\b/.test(lower)) return { kind: "stocks", sort: "losers" };
  if (/\b(stocks|trending|top|hot)\b/.test(lower) && !price) return { kind: "stocks", sort: "volume" };
  if (price && !/\b(my|i)\b/.test(price[1]!.toLowerCase())) return { kind: "price", basket: price[1]! };
  if (/\bhelp\b|what can you do|^(hi|hello|hey|yo|start)\b/.test(lower)) return { kind: "help" };
  return { kind: "unknown" };
}
