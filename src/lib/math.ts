// Money math. All amounts are raw bigint units; conversion to display happens at the edge.

import { BPS, CREATOR_SHARE_BPS, FEE_BPS } from "@/lib/constants";

/** Buy fee on gross G, mirroring StacksClubVault.payBuyFee exactly. */
export function buyFee(gross: bigint, isStack: boolean): { fee: bigint; net: bigint; creatorCut: bigint; platformCut: bigint } {
  if (gross < 0n) throw new Error("negative amount");
  const fee = (gross * FEE_BPS) / BPS;
  const creatorCut = isStack ? (fee * CREATOR_SHARE_BPS) / BPS : 0n;
  return { fee, net: gross - fee, creatorCut, platformCut: fee - creatorCut };
}

/** Sell fee on actual proceeds, mirroring StacksClubVault.paySellFee. */
export function sellFee(proceeds: bigint): bigint {
  return (proceeds * FEE_BPS) / BPS;
}

/**
 * Split `net` across components by weight (FLOWS.md §3): floor each share, then add the
 * remainder to the largest weight (first one on ties). Sum always equals `net`.
 */
export function allocate(net: bigint, weightsBps: readonly number[]): bigint[] {
  if (weightsBps.length === 0) throw new Error("no components");
  if (weightsBps.some((w) => !Number.isInteger(w) || w <= 0)) throw new Error("weights must be positive integers");
  const total = weightsBps.reduce((a, b) => a + b, 0);
  if (total !== 10_000) throw new Error(`weights sum to ${total}, expected 10000`);
  const out = weightsBps.map((w) => (net * BigInt(w)) / BPS);
  const remainder = net - out.reduce((a, b) => a + b, 0n);
  let largest = 0;
  weightsBps.forEach((w, i) => {
    if (w > weightsBps[largest]!) largest = i;
  });
  out[largest] = out[largest]! + remainder;
  return out;
}

/** Amount released by `release(bps)`, mirroring the contract: full balance at 10,000, else floor. */
export function releaseAmount(balance: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) throw new Error("bps out of range");
  return bps === 10_000 ? balance : (balance * BigInt(bps)) / BPS;
}

/** Percent (e.g. 33.33) to bps, rounded to the nearest integer and clamped to 1..10,000. */
export function percentToBps(percent: number): number {
  return Math.min(10_000, Math.max(1, Math.round(percent * 100)));
}

// ---------------------------------------------------------------------------
// Decimal strings <-> raw units. Prices arrive as decimal strings from Binance and Postgres.
// ---------------------------------------------------------------------------

/** Parse a non-negative decimal string into a scaled bigint with `scale` fractional digits. */
export function toScaled(value: string | number, scale: number): bigint {
  const s = typeof value === "number" ? value.toFixed(Math.min(scale, 20)) : value.trim();
  const m = /^(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
  if (!m) throw new Error(`not a decimal: ${value}`);
  let int = m[1]!;
  let frac = m[2] ?? "";
  const exp = m[3] ? Number(m[3]) : 0;
  if (exp > 0) {
    frac = frac.padEnd(exp, "0");
    int = int + frac.slice(0, exp);
    frac = frac.slice(exp);
  } else if (exp < 0) {
    int = int.padStart(-exp + 1, "0");
    frac = int.slice(int.length + exp) + frac;
    int = int.slice(0, int.length + exp);
  }
  return BigInt(int + frac.padEnd(scale, "0").slice(0, scale));
}

/** Price scale used for valuation math: 18 fractional digits. */
export const PRICE_SCALE = 18;

/**
 * USD value (scaled by 1e18) of `units` raw token units at `price` USD per whole token.
 * value = units * price / 10^decimals.
 */
export function valueUsdScaled(units: bigint, decimals: number, price: string | number): bigint {
  return (units * toScaled(price, PRICE_SCALE)) / 10n ** BigInt(decimals);
}

/** Scaled 1e18 USD to a JS number for display only. */
export function scaledToNumber(v: bigint, scale = PRICE_SCALE): number {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(scale);
  const n = Number(a / base) + Number(a % base) / Number(base);
  return neg ? -n : n;
}

/** Raw units to a decimal string with `decimals`, trimming trailing zeros. */
export function formatUnitsExact(units: bigint, decimals: number): string {
  const neg = units < 0n;
  const a = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const frac = (a % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / base}${frac ? `.${frac}` : ""}`;
}

// ---------------------------------------------------------------------------
// Stack index (FLOWS.md §6)
// ---------------------------------------------------------------------------

export const INDEX_BASE = 1000;

/**
 * Notional units at launch: u[i] = (1000 * weight[i] / 10000) / p0[i], kept as decimal strings
 * with 18 fractional digits so the index is reproducible.
 */
export function launchUnits(weightsBps: readonly number[], launchPrices: readonly (string | number)[]): string[] {
  if (weightsBps.length !== launchPrices.length) throw new Error("length mismatch");
  return weightsBps.map((w, i) => {
    const p = toScaled(launchPrices[i]!, PRICE_SCALE);
    if (p === 0n) throw new Error(`zero launch price for component ${i}`);
    // dollars allocated, scaled 1e18 then divided by price scaled 1e18, keep 18 digits
    const dollars = (BigInt(INDEX_BASE) * BigInt(w) * 10n ** BigInt(PRICE_SCALE)) / BPS;
    const units = (dollars * 10n ** BigInt(PRICE_SCALE)) / p;
    return formatUnitsExact(units, PRICE_SCALE);
  });
}

/** index = sum(u[i] * p_now[i]). Returns a number for display and charting. */
export function indexValue(units: readonly string[], prices: readonly (string | number | null)[]): number | null {
  if (units.length !== prices.length) throw new Error("length mismatch");
  let total = 0n;
  for (let i = 0; i < units.length; i++) {
    const p = prices[i];
    if (p === null || p === undefined) return null;
    total += (toScaled(units[i]!, PRICE_SCALE) * toScaled(p, PRICE_SCALE)) / 10n ** BigInt(PRICE_SCALE);
  }
  return scaledToNumber(total);
}

// ---------------------------------------------------------------------------
// Position valuation (FLOWS.md §7)
// ---------------------------------------------------------------------------

export type Holding = { units: bigint; decimals: number; price: string | number | null };

/** Sum of units * price. Null if any component lacks a price (never guess a mark). */
export function positionValueScaled(holdings: readonly Holding[]): bigint | null {
  let total = 0n;
  for (const h of holdings) {
    if (h.price === null) return null;
    total += valueUsdScaled(h.units, h.decimals, h.price);
  }
  return total;
}

/** Cost basis after partial sells: reduced by the same bps as each release (floor). */
export function remainingCostBasis(gross: bigint, releasedBps: readonly number[]): bigint {
  return releasedBps.reduce((basis, bps) => basis - releaseAmount(basis, bps), gross);
}

/** PnL in scaled USD and percent. Cost basis is USDT raw (18 decimals, same as PRICE_SCALE). */
export function pnl(valueScaled: bigint, costBasisRaw: bigint, usdtDecimals: number): { usd: number; pct: number | null } {
  const basisScaled =
    usdtDecimals === PRICE_SCALE
      ? costBasisRaw
      : (costBasisRaw * 10n ** BigInt(PRICE_SCALE)) / 10n ** BigInt(usdtDecimals);
  const diff = valueScaled - basisScaled;
  return { usd: scaledToNumber(diff), pct: basisScaled === 0n ? null : (scaledToNumber(diff) / scaledToNumber(basisScaled)) * 100 };
}
