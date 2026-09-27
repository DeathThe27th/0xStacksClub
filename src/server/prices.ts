import "server-only";
import type { AssetRow } from "@/lib/supabase/types";
import { getCandles, getRwaTokens } from "@/server/binance";
import { db, must } from "@/server/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Refreshes asset_prices from the Binance RWA token list (price, reference price, market cap,
 * volume, market status). 24h change comes from 1h candles for tradable assets only, to stay
 * inside the 5 RPS per-endpoint limit.
 */
export async function refreshPrices(): Promise<{ updated: number; changes: number; errors: string[] }> {
  const errors: string[] = [];
  const known = must(await db().from("assets").select("address, can_trade")) as Pick<AssetRow, "address" | "can_trade">[];
  const byLower = new Map(known.map((a) => [a.address.toLowerCase(), a]));
  const now = new Date().toISOString();

  const rows: Record<string, unknown>[] = [];
  for (const p of ["bstock", "ondo"] as const) {
    try {
      for (const t of await getRwaTokens(p)) {
        const a = byLower.get(t.tokenContractAddress.toLowerCase());
        if (!a) continue;
        rows.push({
          chain_id: 56,
          address: a.address,
          price_usd: t.tokenPrice ?? null,
          reference_price_usd: t.referencePrice ?? null,
          market_cap: t.marketCap ?? null,
          volume_24h: t.volume24H ?? null,
          market_open: t.statusInfo?.openState ?? null,
          market_status: t.statusInfo?.marketStatus ?? null,
          next_open_at: t.statusInfo?.nextOpenTime ? new Date(Number(t.statusInfo.nextOpenTime)).toISOString() : null,
          updated_at: now,
        });
      }
    } catch (e) {
      errors.push(`rwa/tokens ${p}: ${(e as Error).message}`);
    }
  }
  for (let i = 0; i < rows.length; i += 200) {
    must(await db().from("asset_prices").upsert(rows.slice(i, i + 200), { onConflict: "chain_id,address" }));
  }

  let changes = 0;
  for (const a of known.filter((k) => k.can_trade)) {
    try {
      const c = await getCandles(a.address, "1h", 25);
      const last = c.at(-1);
      const first = c.length >= 25 ? c[0] : undefined;
      if (last && first && first.o > 0) {
        const change = ((last.c - first.o) / first.o) * 100;
        must(await db().from("asset_prices").update({ change_24h: change.toFixed(4) }).eq("address", a.address));
        changes++;
      }
    } catch (e) {
      errors.push(`candles ${a.address}: ${(e as Error).message}`);
    }
    await sleep(220);
  }
  return { updated: rows.length, changes, errors };
}
