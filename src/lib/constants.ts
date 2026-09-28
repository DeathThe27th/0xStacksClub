import { getAddress } from "viem";

/** User-facing app name. Change the spelling here only. */
export const APP_NAME = "Stocks n Clubs";

export const CHAIN_ID = 56;
export const BINANCE_CHAIN_ID = "56";
export const USDT_ADDRESS = getAddress("0x55d398326f99059fF775485246999027B3197955");
export const PROVIDERS = ["bstock", "ondo"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABEL: Record<Provider, string> = { bstock: "bStocks", ondo: "Ondo" };

/** Settled product rules (CLAUDE.md). */
export const FEE_BPS = 100n;
export const CREATOR_SHARE_BPS = 2_500n;
export const BPS = 10_000n;
export const MIN_BUY_USD_SMALL = 1; // single stock, and baskets with 1 to 3 components
export const MIN_BUY_USD_LARGE = 10; // baskets with 4 to 5 components
export const DEFAULT_SLIPPAGE_PERCENT = "1";
