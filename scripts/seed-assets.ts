/**
 * pnpm seed:assets [--no-routes] [--from-file catalog.json]
 *
 * The Binance Web3 API refuses US/UK/CA/NL IPs (docs/binance-notes.md §1), so the catalog is built
 * by the deployed app's /api/cron/seed-assets route (running in a permitted region), which also
 * upserts Supabase. This script calls it and writes the Foundry inputs:
 *   contracts/test/fork-assets.json  every bStock plus the Ondo token for the same tickers
 *   contracts/deploy/assets.json     assets with a USDT route (can_trade) and vault_ok !== false
 *
 * Env: SEED_BASE_URL (default NEXT_PUBLIC_APP_URL), CRON_SECRET,
 *      VERCEL_AUTOMATION_BYPASS_SECRET (only for protected preview deployments)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Asset = {
  provider: "bstock" | "ondo";
  address: string;
  ticker: string;
  symbol: string;
  decimals: number;
  canTrade: boolean;
  routeCheck: string;
  priceUsd: string | null;
};
type Catalog = { assets: Asset[]; skipped: { address: string; symbol: string; reason: string }[]; stored?: unknown };

const root = join(__dirname, "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function fetchCatalog(): Promise<Catalog> {
  const file = opt("--from-file");
  if (file) return JSON.parse(readFileSync(file, "utf8"));

  const base = process.env.SEED_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) throw new Error("Set SEED_BASE_URL (or NEXT_PUBLIC_APP_URL) and CRON_SECRET");
  const url = `${base.replace(/\/$/, "")}/api/cron/seed-assets${flag("--no-routes") ? "?routes=0" : ""}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  const res = await fetch(url, { headers });
  const body = await res.json();
  if (!res.ok) throw new Error(`Seed route failed (${res.status}): ${JSON.stringify(body)}`);
  return body as Catalog;
}

function forkSet(assets: Asset[]): Asset[] {
  const bstocks = assets.filter((a) => a.provider === "bstock");
  const tickers = new Set(bstocks.map((a) => a.ticker));
  const ondo = assets.filter((a) => a.provider === "ondo" && tickers.has(a.ticker));
  return [...bstocks, ...ondo];
}

function write(path: string, assets: Asset[]) {
  const json = {
    generatedAt: new Date().toISOString(),
    source: "binance-web3:rwa/tokens via /api/cron/seed-assets",
    assets: assets.map((a) => ({ provider: a.provider, symbol: a.symbol, ticker: a.ticker, address: a.address, decimals: a.decimals })),
    // Flat parallel arrays for Foundry's JSON cheatcodes.
    addresses: assets.map((a) => a.address),
    providers: assets.map((a) => a.provider),
    symbols: assets.map((a) => a.symbol),
  };
  writeFileSync(join(root, path), JSON.stringify(json, null, 2) + "\n");
  console.log(`wrote ${path} (${assets.length})`);
}

async function main() {
  const catalog = await fetchCatalog();
  const { assets, skipped } = catalog;

  const rows = assets.map((a) => ({
    provider: a.provider,
    symbol: a.symbol,
    ticker: a.ticker,
    price: a.priceUsd ? Number(a.priceUsd).toFixed(2) : "-",
    route: a.routeCheck,
  }));
  console.table(rows.slice(0, 60));
  if (rows.length > 60) console.log(`... ${rows.length - 60} more`);
  const noRoute = assets.filter((a) => !a.canTrade);
  console.log(`\n${assets.length} assets, ${assets.length - noRoute.length} with a USDT route, ${skipped.length} skipped`);
  for (const s of skipped) console.log(`  skipped ${s.symbol} ${s.address}: ${s.reason}`);
  if (catalog.stored) console.log("supabase:", JSON.stringify(catalog.stored));

  write("contracts/test/fork-assets.json", forkSet(assets));
  write("contracts/deploy/assets.json", assets.filter((a) => a.canTrade));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
