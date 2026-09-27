import "server-only";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { CHAIN_ID, USDT_ADDRESS, type Provider } from "@/lib/constants";
import { BinanceError, getQuote, getRwaTokens, type RwaToken } from "@/server/binance";
import { readTokenMeta } from "@/server/chain";

export type CatalogAsset = {
  provider: Provider;
  chainId: number;
  address: Address;
  ticker: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  decimals: number;
  shareMultiplier: string | null;
  priceUsd: string | null;
  referencePriceUsd: string | null;
  marketCap: string | null;
  volume24h: string | null;
  marketOpen: boolean | null;
  canTrade: boolean;
  routeCheck: string; // "SWAP" | "RFQ" | "SWAP+RFQ" | error code/message
  source: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** USD amount used to probe for a route. Above the Ondo minimum example in the docs ($20). */
const PROBE_USD = "25";
/** Quotes need a user address for RFQ routes; nothing is signed or submitted. */
const PROBE_WALLET = "0x000000000000000000000000000000000000dEaD";

/**
 * Pull bStocks and Ondo tokens on BSC from Binance, verify each against the chain, and check for a
 * USDT route. Nothing here trusts client input.
 */
export async function buildCatalog(opts: { checkRoutes: boolean }): Promise<{
  assets: CatalogAsset[];
  skipped: { address: string; symbol: string; reason: string }[];
}> {
  const raw: RwaToken[] = [];
  for (const p of ["bstock", "ondo"] as const) raw.push(...(await getRwaTokens(p)));

  const skipped: { address: string; symbol: string; reason: string }[] = [];
  const candidates = raw.filter((t) => {
    if (t.binanceChainId !== String(CHAIN_ID)) return false;
    if (t.platformId !== "bstock" && t.platformId !== "ondo") return false;
    if (!isAddress(t.tokenContractAddress, { strict: false })) {
      skipped.push({ address: t.tokenContractAddress, symbol: t.tokenSymbol, reason: "invalid address" });
      return false;
    }
    return true;
  });

  const metas = await readTokenMeta(candidates.map((t) => getAddress(t.tokenContractAddress)));
  const usdtDecimals = 18;
  const probeAmount = parseUnits(PROBE_USD, usdtDecimals);

  const assets: CatalogAsset[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const t = candidates[i]!;
    const m = metas[i]!;
    if (!m.hasCode) {
      skipped.push({ address: m.address, symbol: t.tokenSymbol, reason: "no contract code on BSC" });
      continue;
    }
    if (m.decimals === undefined) {
      skipped.push({ address: m.address, symbol: t.tokenSymbol, reason: "decimals() call failed" });
      continue;
    }
    if (t.decimals != null && Number(t.decimals) !== m.decimals) {
      skipped.push({
        address: m.address,
        symbol: t.tokenSymbol,
        reason: `decimals mismatch: Binance ${t.decimals}, chain ${m.decimals}`,
      });
      continue;
    }

    let canTrade = false;
    let routeCheck = "not checked";
    if (opts.checkRoutes) {
      try {
        const routes = await getQuote({ from: USDT_ADDRESS, to: m.address, amount: probeAmount, userAddress: PROBE_WALLET });
        const modes = [...new Set(routes.map((r) => r.executionMode))].sort();
        canTrade = routes.length > 0;
        routeCheck = modes.length ? modes.join("+") : "no routes";
      } catch (e) {
        routeCheck = e instanceof BinanceError && e.code ? `${e.code} ${e.message}` : (e as Error).message;
      }
      await sleep(250); // 5 RPS per endpoint limit
    }

    assets.push({
      provider: t.platformId as Provider,
      chainId: CHAIN_ID,
      address: m.address,
      ticker: (t.underlyingTicker ?? t.tokenSymbol).toUpperCase(),
      symbol: m.symbol ?? t.tokenSymbol,
      name: t.underlyingName ?? m.name ?? t.tokenSymbol,
      logoUrl: t.tokenLogoUrl ?? null,
      decimals: m.decimals,
      shareMultiplier: t.tokenToShareRatio ?? null,
      priceUsd: t.tokenPrice ?? null,
      referencePriceUsd: t.referencePrice ?? null,
      marketCap: t.marketCap ?? null,
      volume24h: t.volume24H ?? null,
      marketOpen: t.statusInfo?.openState ?? null,
      canTrade,
      routeCheck,
      source: "binance-web3:rwa/tokens",
    });
  }
  return { assets, skipped };
}
