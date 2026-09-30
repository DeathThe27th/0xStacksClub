// Basket weight editing, in basis points. Every function returns weights that sum to exactly
// 10,000, so the create flow can never hold a recipe that doesn't add up to 100%.

export const TOTAL_BPS = 10_000;
/** Smallest weight the editor allows for one stock: 1%. */
export const MIN_BPS = 100;

/** Shares `total` by `parts`, as integers that sum to `total` exactly (largest remainder). */
function share(total: number, parts: readonly number[]): number[] {
  const sum = parts.reduce((a, b) => a + b, 0);
  const exact = parts.map((p) => (sum > 0 ? (total * p) / sum : total / parts.length));
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (let k = 0; left > 0; k++, left--) out[byRemainder[k % byRemainder.length]!.i]! += 1;
  return out;
}

export function equalWeights(n: number): number[] {
  return share(TOTAL_BPS, Array.from({ length: n }, () => 1));
}

/** Weights in proportion to `sizes` (market caps, say), each at least the minimum. Null if a size is missing. */
export function proportionalWeights(sizes: readonly (number | null)[]): number[] | null {
  if (sizes.some((s) => s === null || !Number.isFinite(s) || s! <= 0)) return null;
  const free = TOTAL_BPS - MIN_BPS * sizes.length;
  return share(free, sizes as number[]).map((w) => w + MIN_BPS);
}

/**
 * Sets one stock's weight and takes the difference from (or gives it to) the others that aren't
 * locked, in proportion to what they have. The value is clamped to what the others can absorb.
 */
export function setWeight(weights: readonly number[], index: number, value: number, locked: ReadonlySet<number> = new Set()): number[] {
  const others = weights.map((_, i) => i).filter((i) => i !== index && !locked.has(i));
  if (!others.length) return [...weights];
  const fixed = weights.reduce((s, w, i) => (i !== index && locked.has(i) ? s + w : s), 0);
  const max = TOTAL_BPS - fixed - MIN_BPS * others.length;
  const v = Math.round(Math.min(max, Math.max(MIN_BPS, value)));
  const rest = share(TOTAL_BPS - fixed - v, others.map((i) => weights[i]!));
  // Lift anything that fell under the minimum and take that from the largest of the rest.
  for (let k = 0; k < rest.length; k++) {
    while (rest[k]! < MIN_BPS) {
      const big = rest.indexOf(Math.max(...rest));
      const take = Math.min(MIN_BPS - rest[k]!, rest[big]! - MIN_BPS);
      if (take <= 0) break;
      rest[k]! += take;
      rest[big]! -= take;
    }
  }
  const out = [...weights];
  out[index] = v;
  others.forEach((i, k) => (out[i] = rest[k]!));
  return out;
}

/** Moves the boundary between two neighbours by `delta` bps: one grows, the other shrinks. */
export function moveBoundary(weights: readonly number[], left: number, delta: number): number[] {
  const a = weights[left]!;
  const b = weights[left + 1]!;
  const d = Math.round(Math.min(b - MIN_BPS, Math.max(MIN_BPS - a, delta)));
  const out = [...weights];
  out[left] = a + d;
  out[left + 1] = b - d;
  return out;
}
