import { describe, expect, it } from "vitest";
import { equalWeights, MIN_BPS, moveBoundary, proportionalWeights, setWeight, TOTAL_BPS } from "./weights";

const sum = (w: number[]) => w.reduce((a, b) => a + b, 0);

describe("weights", () => {
  it("splits equally and always sums to 100%", () => {
    expect(equalWeights(2)).toEqual([5000, 5000]);
    expect(equalWeights(3)).toEqual([3334, 3333, 3333]);
    for (const n of [2, 3, 4, 5]) expect(sum(equalWeights(n))).toBe(TOTAL_BPS);
  });

  it("weights by size with a 1% floor", () => {
    const w = proportionalWeights([4_000, 3_000, 1])!;
    expect(sum(w)).toBe(TOTAL_BPS);
    expect(w[2]! >= MIN_BPS && w[2]! <= MIN_BPS + 2).toBe(true);
    expect(w[0]! > w[1]!).toBe(true);
    expect(proportionalWeights([1, null])).toBeNull();
  });

  it("takes a change from the others in proportion", () => {
    expect(setWeight([5000, 3000, 2000], 0, 6000)).toEqual([6000, 2400, 1600]);
    expect(sum(setWeight([3334, 3333, 3333], 1, 4777))).toBe(TOTAL_BPS);
  });

  it("leaves locked stocks alone", () => {
    expect(setWeight([5000, 3000, 2000], 0, 6000, new Set([1]))).toEqual([6000, 3000, 1000]);
    // Nothing left to take from: the value is clamped.
    expect(setWeight([5000, 3000, 2000], 0, 9000, new Set([1]))).toEqual([6900, 3000, 100]);
    expect(setWeight([5000, 5000], 0, 7000, new Set([1]))).toEqual([5000, 5000]);
  });

  it("never lets a stock fall under 1% or the total drift", () => {
    expect(setWeight([5000, 3000, 2000], 0, 99_999)).toEqual([9800, 100, 100]);
    expect(setWeight([5000, 3000, 2000], 0, 0)[0]).toBe(MIN_BPS);
    for (const v of [1, 137, 4242, 9999]) expect(sum(setWeight([2500, 2500, 2500, 2500], 2, v))).toBe(TOTAL_BPS);
  });

  it("moves a boundary between two neighbours only", () => {
    expect(moveBoundary([5000, 3000, 2000], 0, 500)).toEqual([5500, 2500, 2000]);
    expect(moveBoundary([5000, 3000, 2000], 1, -5000)).toEqual([5000, 100, 4900]);
    expect(moveBoundary([5000, 3000, 2000], 0, 99_999)).toEqual([7900, 100, 2000]);
  });
});
