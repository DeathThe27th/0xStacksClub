/**
 * Guard against swap routes that fill far from the market. Binance's best route can come from a
 * thin pool (a $0.99 AVGO leg once paid $1,602 per token against a $354 market), and slippage
 * limits only protect against drift from that quote, not a bad quote. Floats are fine here: this
 * is a sanity check, never an amount sent onchain.
 */
export const MAX_PRICE_DEVIATION_PCT = 5;

export type PriceCheck = {
  /** USD per token this quote implies. */
  quotedUsd: number;
  /** USD per token the market says it's worth. */
  fairUsd: number;
  /** How much worse than fair the quote is, in percent. Negative means better than fair. */
  worsePct: number;
  ok: boolean;
};

/**
 * `side` is from the user's view: "buy" spends USDT for tokens, "sell" gets USDT for tokens.
 * Amounts are raw units with their decimals.
 */
export function checkQuotePrice(p: {
  side: "buy" | "sell";
  usdtRaw: bigint;
  usdtDecimals: number;
  tokenRaw: bigint;
  tokenDecimals: number;
  fairUsd: number;
  maxPct?: number;
}): PriceCheck {
  const usdt = Number(p.usdtRaw) / 10 ** p.usdtDecimals;
  const tokens = Number(p.tokenRaw) / 10 ** p.tokenDecimals;
  const quotedUsd = tokens > 0 ? usdt / tokens : Infinity;
  // Buying: paying more than fair is worse. Selling: receiving less than fair is worse.
  const worsePct = p.side === "buy" ? (quotedUsd / p.fairUsd - 1) * 100 : (1 - quotedUsd / p.fairUsd) * 100;
  return { quotedUsd, fairUsd: p.fairUsd, worsePct, ok: Number.isFinite(worsePct) && worsePct <= (p.maxPct ?? MAX_PRICE_DEVIATION_PCT) };
}
