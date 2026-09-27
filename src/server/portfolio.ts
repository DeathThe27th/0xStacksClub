import "server-only";
import { getAddress, type Address } from "viem";
import { USDT_ADDRESS } from "@/lib/constants";
import { formatUnitsExact, pnl, positionValueScaled, remainingCostBasis, scaledToNumber, valueUsdScaled } from "@/lib/math";
import type { AssetPriceRow, AssetRow, HolderRow, StackRow } from "@/lib/supabase/types";
import { publicClient, readErc20Balances } from "@/server/chain";
import { db, must } from "@/server/db";
import { getUsdtDecimals } from "@/server/intents";
import { readFeeReceipt, readPositionsOf, vaultAddress, type ChainPosition } from "@/server/vault";

export type HoldingOut = {
  address: Address;
  provider: string;
  ticker: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  units: string; // raw
  unitsDisplay: string;
  price: number | null;
  valueUsd: number | null;
  change24h: number | null;
  avgEntryUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
};

export type PositionOut = {
  id: number;
  stackId: number;
  stackTicker: string | null;
  stackName: string | null;
  stackImage: string | null;
  openedAt: number;
  components: { address: Address; ticker: string; symbol: string; provider: string; units: string; unitsDisplay: string; valueUsd: number | null; logoUrl: string | null }[];
  valueUsd: number | null;
  costBasisUsd: number;
  pnlUsd: number | null;
  pnlPct: number | null;
};

export type Portfolio = {
  address: Address;
  usdt: { raw: string; display: number };
  bnb: { raw: string; display: number };
  holdings: HoldingOut[];
  positions: PositionOut[];
  totalUsd: number | null;
  change24hUsd: number | null;
};

function change24hUsd(value: number, changePct: number | null): number {
  if (changePct === null) return 0;
  // value now = prev * (1 + c) => delta = value - value / (1 + c)
  return value - value / (1 + changePct / 100);
}

export async function portfolioFor(address: Address, profileId: string | null, opts: { includePositions?: boolean } = {}): Promise<Portfolio> {
  const assets = must(await db().from("assets").select("*").eq("can_browse", true)) as AssetRow[];
  const prices = must(await db().from("asset_prices").select("*")) as AssetPriceRow[];
  const priceBy = new Map(prices.map((p) => [p.address, p]));
  const usdtDec = await getUsdtDecimals();

  const tokens = [USDT_ADDRESS, ...assets.map((a) => getAddress(a.address))];
  const balances = new Map<Address, bigint>();
  for (let i = 0; i < tokens.length; i += 250) {
    const chunk = await readErc20Balances(address, tokens.slice(i, i + 250));
    chunk.forEach((v, k) => balances.set(k, v));
  }
  const bnb = await publicClient().getBalance({ address });
  const usdtRaw = balances.get(USDT_ADDRESS) ?? 0n;

  const entries = profileId
    ? (must(await db().from("holders").select("*").eq("profile_id", profileId).eq("target_type", "asset")) as HolderRow[])
    : [];
  const entryBy = new Map(entries.map((e) => [getAddress(e.target_id), e]));

  let total = scaledToNumber(usdtRaw, usdtDec);
  let dayChange = 0;
  let unpriced = false;

  const holdings: HoldingOut[] = [];
  for (const a of assets) {
    const units = balances.get(getAddress(a.address)) ?? 0n;
    if (units === 0n) continue;
    const p = priceBy.get(a.address);
    const value = p?.price_usd ? scaledToNumber(valueUsdScaled(units, a.decimals, p.price_usd)) : null;
    if (value === null) unpriced = true;
    else {
      total += value;
      dayChange += change24hUsd(value, p?.change_24h ? Number(p.change_24h) : null);
    }
    const entry = entryBy.get(getAddress(a.address));
    const avg = entry?.avg_entry_usd ? Number(entry.avg_entry_usd) : null;
    const tokensHeld = Number(formatUnitsExact(units, a.decimals));
    const cost = avg !== null ? avg * tokensHeld : null;
    holdings.push({
      address: getAddress(a.address),
      provider: a.provider,
      ticker: a.ticker,
      symbol: a.symbol,
      name: a.name,
      logoUrl: a.logo_url,
      units: units.toString(),
      unitsDisplay: formatUnitsExact(units, a.decimals),
      price: p?.price_usd ? Number(p.price_usd) : null,
      valueUsd: value,
      change24h: p?.change_24h ? Number(p.change_24h) : null,
      avgEntryUsd: avg,
      pnlUsd: value !== null && cost !== null ? value - cost : null,
      pnlPct: value !== null && cost ? ((value - cost) / cost) * 100 : null,
    });
  }

  const positions: PositionOut[] = [];
  if (opts.includePositions !== false && vaultAddress()) {
    const chainPositions = await readPositionsOf(address);
    const out = await valuePositions(chainPositions, assets, priceBy, usdtDec);
    for (const p of out) {
      positions.push(p);
      if (p.valueUsd === null) unpriced = true;
      else total += p.valueUsd;
    }
    for (const cp of chainPositions) {
      cp.assets.forEach((a, i) => {
        const pr = priceBy.get(getAddress(a));
        const asset = assets.find((x) => x.address === getAddress(a));
        if (!pr?.price_usd || !asset) return;
        const v = scaledToNumber(valueUsdScaled(cp.balances[i]!, asset.decimals, pr.price_usd));
        dayChange += change24hUsd(v, pr.change_24h ? Number(pr.change_24h) : null);
      });
    }
  }

  holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  return {
    address,
    usdt: { raw: usdtRaw.toString(), display: scaledToNumber(usdtRaw, usdtDec) },
    bnb: { raw: bnb.toString(), display: scaledToNumber(bnb, 18) },
    holdings,
    positions,
    totalUsd: unpriced && holdings.every((h) => h.valueUsd === null) && positions.length === 0 && holdings.length > 0 ? null : total,
    change24hUsd: dayChange,
  };
}

export async function valuePositions(
  chainPositions: ChainPosition[],
  assets: AssetRow[],
  priceBy: Map<string, AssetPriceRow>,
  usdtDec: number,
): Promise<PositionOut[]> {
  if (!chainPositions.length) return [];
  const stackIds = [...new Set(chainPositions.map((p) => p.stackId))];
  const stacks = must(await db().from("stacks").select("id, ticker, name, image_url").in("id", stackIds)) as Pick<
    StackRow,
    "id" | "ticker" | "name" | "image_url"
  >[];
  const stackBy = new Map(stacks.map((s) => [Number(s.id), s]));
  const releases = must(
    await db()
      .from("chain_events")
      .select("data")
      .eq("event", "PositionReleased")
      .in(
        "data->>positionId",
        chainPositions.map((p) => String(p.id)),
      ),
  ) as { data: { positionId: string; bps: number } }[];

  const out: PositionOut[] = [];
  for (const p of chainPositions) {
    const receipt = await readFeeReceipt(p.feeReceiptId);
    const bpsList = releases.filter((r) => Number(r.data.positionId) === p.id).map((r) => Number(r.data.bps));
    const basisRaw = remainingCostBasis(receipt.grossAmount, bpsList);
    const holdings = p.assets.map((a, i) => {
      const asset = assets.find((x) => x.address === getAddress(a));
      return { units: p.balances[i]!, decimals: asset?.decimals ?? 18, price: priceBy.get(getAddress(a))?.price_usd ?? null };
    });
    const valueScaled = positionValueScaled(holdings);
    const r = valueScaled !== null ? pnl(valueScaled, basisRaw, usdtDec) : null;
    const s = stackBy.get(p.stackId);
    out.push({
      id: p.id,
      stackId: p.stackId,
      stackTicker: s?.ticker ?? null,
      stackName: s?.name ?? null,
      stackImage: s?.image_url ?? null,
      openedAt: p.openedAt,
      components: p.assets.map((a, i) => {
        const asset = assets.find((x) => x.address === getAddress(a));
        const price = priceBy.get(getAddress(a))?.price_usd;
        return {
          address: getAddress(a),
          ticker: asset?.ticker ?? "?",
          symbol: asset?.symbol ?? "?",
          provider: asset?.provider ?? "?",
          logoUrl: asset?.logo_url ?? null,
          units: p.balances[i]!.toString(),
          unitsDisplay: formatUnitsExact(p.balances[i]!, asset?.decimals ?? 18),
          valueUsd: price && asset ? scaledToNumber(valueUsdScaled(p.balances[i]!, asset.decimals, price)) : null,
        };
      }),
      valueUsd: valueScaled !== null ? scaledToNumber(valueScaled) : null,
      costBasisUsd: scaledToNumber(basisRaw, usdtDec),
      pnlUsd: r?.usd ?? null,
      pnlPct: r?.pct ?? null,
    });
  }
  return out;
}
