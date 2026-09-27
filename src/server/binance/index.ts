import "server-only";
import { z } from "zod";
import { BINANCE_CHAIN_ID } from "@/lib/constants";
import { binanceFetch } from "./client";
import * as s from "./schemas";

export { BinanceError, BinanceSchemaError } from "./client";
export type { QuoteRoute, RfqStatus, RwaPrice, RwaToken, SwapBuild } from "./schemas";

// All paths and parameters: docs/binance-notes.md

export function getRwaPlatforms() {
  return binanceFetch("GET", "/api/v1/dex/market/rwa/platforms", { schema: s.rwaPlatforms });
}

export function getRwaTokens(platformId?: "bstock" | "ondo") {
  return binanceFetch("GET", "/api/v1/dex/market/rwa/tokens", {
    query: { binanceChainId: BINANCE_CHAIN_ID, platformId },
    schema: s.rwaTokens,
  });
}

export function searchRwa(keyword: string, platformId?: "bstock" | "ondo") {
  return binanceFetch("GET", "/api/v1/dex/market/rwa/search", {
    query: { keyword, platformId },
    schema: s.rwaSearch,
  });
}

/** Onchain price and reference price, up to 100 addresses per call. */
export async function getRwaPrices(addresses: string[]) {
  const out: z.infer<typeof s.rwaPrices> = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const batch = await binanceFetch("GET", "/api/v1/dex/market/rwa/price", {
      query: { binanceChainId: BINANCE_CHAIN_ID, tokenContractAddresses: addresses.slice(i, i + 100).join(",") },
      schema: s.rwaPrices,
    });
    out.push(...batch);
  }
  return out;
}

export function getRwaUnderlyingMarket(address: string) {
  return binanceFetch("GET", "/api/v1/dex/market/rwa/underlying-market", {
    query: { binanceChainId: BINANCE_CHAIN_ID, tokenContractAddress: address },
    schema: s.rwaUnderlyingMarket,
  });
}

export const CANDLE_BARS = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"] as const;
export type CandleBar = (typeof CANDLE_BARS)[number];

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export async function getCandles(address: string, bar: CandleBar, limit = 100): Promise<Candle[]> {
  const rows = await binanceFetch("GET", "/api/v1/dex/market/candles", {
    query: { binanceChainId: BINANCE_CHAIN_ID, tokenContractAddress: address, bar, limit },
    schema: s.candles,
  });
  return rows
    .map((r) => ({ o: +r[0]!, h: +r[1]!, l: +r[2]!, c: +r[3]!, v: +r[4]!, t: +r[5]! }))
    .sort((a, b) => a.t - b.t);
}

export function getQuote(p: { from: string; to: string; amount: bigint; userAddress: string }) {
  return binanceFetch("GET", "/api/v1/dex/aggregator/quote", {
    query: {
      binanceChainId: BINANCE_CHAIN_ID,
      amount: p.amount.toString(),
      fromTokenAddress: p.from,
      toTokenAddress: p.to,
      userWalletAddress: p.userAddress,
    },
    schema: s.quoteRoutes,
  });
}

export function getApproveTx(p: { token: string; amount: bigint; vendor?: string }) {
  return binanceFetch("GET", "/api/v1/dex/aggregator/approve-transaction", {
    query: {
      binanceChainId: BINANCE_CHAIN_ID,
      tokenContractAddress: p.token,
      approveAmount: p.amount.toString(),
      vendor: p.vendor,
    },
    schema: s.approveTxs,
  });
}

export function buildSwap(p: {
  from: string;
  to: string;
  amount: bigint;
  userAddress: string;
  quoteId: string;
  slippagePercent: string;
}) {
  return binanceFetch("GET", "/api/v1/dex/aggregator/swap", {
    query: {
      binanceChainId: BINANCE_CHAIN_ID,
      amount: p.amount.toString(),
      fromTokenAddress: p.from,
      toTokenAddress: p.to,
      userWalletAddress: p.userAddress,
      quoteId: p.quoteId,
      slippagePercent: p.slippagePercent,
    },
    schema: s.swapBuild,
  });
}

/** Never retried automatically. Reuse `requestId` to retry the same attempt. */
export function submitRfqOrder(p: {
  requestId: string;
  userSignature: string;
  vendor: string;
  quoteId: string;
  signingScheme?: string | null;
}) {
  return binanceFetch("POST", "/api/v1/dex/aggregator/order/submit", {
    body: {
      requestId: p.requestId,
      userSignature: p.userSignature,
      vendor: p.vendor,
      quoteId: p.quoteId,
      ...(p.signingScheme ? { signingScheme: p.signingScheme } : {}),
    },
    schema: s.rfqSubmit,
    retry: false,
  });
}

export function getOrderStatus(orderId: string) {
  return binanceFetch("GET", `/api/v1/dex/aggregator/order/${encodeURIComponent(orderId)}`, {
    schema: s.rfqStatus,
  });
}

/** Binance statuses → the four our API exposes (docs/binance-notes.md §5). */
export function normalizeOrderStatus(status: string): "PENDING" | "FILLED" | "FAILED" | "EXPIRED" {
  switch (status) {
    case "FILLED":
      return "FILLED";
    case "EXPIRED":
      return "EXPIRED";
    case "FAILED":
    case "CANCELLED":
      return "FAILED";
    default:
      return "PENDING";
  }
}
