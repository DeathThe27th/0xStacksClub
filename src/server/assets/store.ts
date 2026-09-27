import "server-only";
import { getAddress } from "viem";
import type { AssetPriceRow, AssetRow } from "@/lib/supabase/types";
import { db, must } from "@/server/db";
import type { CatalogAsset } from "./catalog";

/**
 * Upserts the catalog into `assets` and `asset_prices`. `vault_ok` is not touched here: it comes
 * from the fork test via scripts/mark-vault-ok.ts. can_stack/can_trade need both a USDT route and
 * a passing fork test.
 */
export async function upsertCatalog(assets: CatalogAsset[]): Promise<{ ok: boolean; count?: number; reason?: string }> {
  const existing = must(await db().from("assets").select("address, vault_ok")) as Pick<AssetRow, "address" | "vault_ok">[];
  const vaultOk = new Map(existing.map((a) => [a.address, a.vault_ok]));
  const now = new Date().toISOString();

  const rows = assets.map((a) => {
    const ok = vaultOk.get(a.address) ?? null;
    return {
      provider: a.provider,
      chain_id: a.chainId,
      address: a.address,
      ticker: a.ticker,
      symbol: a.symbol,
      name: a.name,
      logo_url: a.logoUrl,
      decimals: a.decimals,
      share_multiplier: a.shareMultiplier,
      can_browse: true,
      can_trade: a.canTrade && ok === true,
      can_stack: a.canTrade && ok === true,
      route_check: a.routeCheck === "not checked" ? undefined : a.routeCheck,
      source: a.source,
      verified_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += 200) {
    must(await db().from("assets").upsert(rows.slice(i, i + 200), { onConflict: "chain_id,address" }));
  }

  const prices = assets.map((a) => ({
    chain_id: a.chainId,
    address: a.address,
    price_usd: a.priceUsd,
    reference_price_usd: a.referencePriceUsd,
    market_cap: a.marketCap,
    volume_24h: a.volume24h,
    market_open: a.marketOpen,
    updated_at: now,
  }));
  for (let i = 0; i < prices.length; i += 200) {
    must(await db().from("asset_prices").upsert(prices.slice(i, i + 200), { onConflict: "chain_id,address" }));
  }
  return { ok: true, count: rows.length };
}

export type AssetWithPrice = AssetRow & { price: AssetPriceRow | null };

export async function listAssets(opts: { tradableOnly?: boolean } = {}): Promise<AssetWithPrice[]> {
  let q = db().from("assets").select("*").eq("can_browse", true);
  if (opts.tradableOnly) q = q.eq("can_trade", true);
  const assets = must(await q) as AssetRow[];
  const prices = must(await db().from("asset_prices").select("*")) as AssetPriceRow[];
  const byAddr = new Map(prices.map((p) => [p.address, p]));
  return assets.map((a) => ({ ...a, price: byAddr.get(a.address) ?? null }));
}

export async function getAsset(address: string): Promise<AssetWithPrice | null> {
  const addr = getAddress(address);
  const a = must(await db().from("assets").select("*").eq("address", addr).maybeSingle()) as AssetRow | null;
  if (!a) return null;
  const p = must(await db().from("asset_prices").select("*").eq("address", addr).maybeSingle()) as AssetPriceRow | null;
  return { ...a, price: p };
}

/** Allowlist check for anything that moves money. Never trust a client-supplied token. */
export async function requireTradable(address: string, purpose: "trade" | "stack"): Promise<AssetRow> {
  const a = await getAsset(address);
  if (!a) throw new Error(`Unknown asset ${address}`);
  if (purpose === "trade" && !a.can_trade) throw new Error(`${a.symbol} is not enabled for trading`);
  if (purpose === "stack" && !a.can_stack) throw new Error(`${a.symbol} is not enabled for Stacks`);
  return a;
}
