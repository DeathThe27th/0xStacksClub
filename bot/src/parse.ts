// Keyword parser. The exact commands are understood here without any model; `parseLoose` is the
// fallback for plain-English messages when Gemini is off, slow, rate limited or wrong.

export type Command =
  | { kind: "link"; code: string }
  | { kind: "stop" }
  | { kind: "help" }
  | { kind: "baskets" }
  | { kind: "portfolio" }
  | { kind: "price"; basket: string }
  | { kind: "club"; basket: string }
  | { kind: "buy"; amount: number | null; basket: string }
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
  if (/^link\b/.test(lower)) return { kind: "link", code: "" };
  if (/^(stop|unlink|disconnect|unsubscribe)$/.test(lower)) return { kind: "stop" };
  if (/^(help|\?|menu|commands|hi|hello|hey|start)$/.test(lower)) return { kind: "help" };
  if (/^(baskets?|top|top baskets|list)$/.test(lower)) return { kind: "baskets" };
  if (/^(portfolio|positions|holdings|balance|my portfolio)$/.test(lower)) return { kind: "portfolio" };

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

/** Best-effort reading of a sentence. Used only when the model can't be. */
export function parseLoose(input: string): Command {
  const text = clean(input);
  const lower = text.toLowerCase();

  const buy = /\bbuy\b (.+)$/i.exec(text);
  if (buy) {
    const cmd = parseCommand(`buy ${buy[1]!}`);
    if (cmd.kind === "buy") return cmd;
  }
  const club = /\b(?:club|telegram|group(?: chat)?)\b(?: (?:for|of|link for))? (.+)$/i.exec(text);
  if (club) return { kind: "club", basket: club[1]!.replace(/[?.!]+$/, "") };
  const price = /\b(?:price|value|how(?:'s| is| are)|what(?:'s| is) in|check)\b(?: (?:of|for|the))* (.+?)(?: doing| looking| worth| today| now)*[?.!]*$/i.exec(text);
  if (/\bmy\b/.test(lower) && /\b(week|weekly|7 days|month|perform\w*|how did|how have)\b/.test(lower)) return { kind: "question", text };
  if (/\b(portfolio|my positions|my holdings|my balance|how am i doing)\b/.test(lower)) return { kind: "portfolio" };
  if (/\b(baskets|trending|top)\b/.test(lower) && !price) return { kind: "baskets" };
  if (price && !/\b(my|i)\b/.test(price[1]!.toLowerCase())) return { kind: "price", basket: price[1]! };
  if (/\bhelp\b|what can you do/.test(lower)) return { kind: "help" };
  return { kind: "unknown" };
}
