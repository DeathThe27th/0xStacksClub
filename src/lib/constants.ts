import { getAddress } from "viem";

/** User-facing app name. Change the spelling here only. */
export const APP_NAME = "3AM";

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
export const MIN_BUY_USD_LARGE = 5; // baskets with 4 to 5 components
export const DEFAULT_SLIPPAGE_PERCENT = "1";

/** iMessage bot: largest buy a text can pre-fill. The buy sheet still applies every real check. */
export const BOT_MAX_BUY_USD = 10_000;
/** Text buys: default and maximum limits a user can set. */
export const BOT_TRADE_CAP_DEFAULT_USD = 50;
export const BOT_TRADE_DAILY_DEFAULT_USD = 200;
/** How long a text buy waits for "yes". */
export const BOT_ORDER_TTL_MS = 5 * 60_000;
/** How long a Connect iMessage code stays valid. */
export const PHONE_CODE_TTL_MS = 10 * 60_000;
