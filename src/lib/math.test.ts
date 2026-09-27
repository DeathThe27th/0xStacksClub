import { describe, expect, it } from "vitest";
import {
  allocate,
  buyFee,
  formatUnitsExact,
  indexValue,
  launchUnits,
  percentToBps,
  pnl,
  positionValueScaled,
  releaseAmount,
  remainingCostBasis,
  scaledToNumber,
  sellFee,
  toScaled,
  valueUsdScaled,
} from "./math";

const e18 = 10n ** 18n;

describe("fee math (mirrors StacksClubVault)", () => {
  it("charges 1% once on the gross amount", () => {
    expect(buyFee(100n * e18, false)).toEqual({ fee: e18, net: 99n * e18, creatorCut: 0n, platformCut: e18 });
  });
  it("splits a Stack fee 25% creator / 75% platform", () => {
    const f = buyFee(5n * e18, true);
    expect(f.fee).toBe(5n * 10n ** 16n);
    expect(f.creatorCut).toBe(125n * 10n ** 14n);
    expect(f.platformCut).toBe(375n * 10n ** 14n);
    expect(f.creatorCut + f.platformCut).toBe(f.fee);
  });
  it("rounds down like Solidity on tiny amounts", () => {
    expect(buyFee(399n, true)).toEqual({ fee: 3n, net: 396n, creatorCut: 0n, platformCut: 3n });
    expect(buyFee(400n, true)).toEqual({ fee: 4n, net: 396n, creatorCut: 1n, platformCut: 3n });
    expect(buyFee(99n, false).fee).toBe(0n);
  });
  it("sell fee is 1% of proceeds", () => {
    expect(sellFee(250n * e18)).toBe(25n * 10n ** 17n);
  });
});

describe("allocation", () => {
  it("floors each share and gives the remainder to the largest weight", () => {
    expect(allocate(100n, [3334, 3333, 3333])).toEqual([34n, 33n, 33n]);
    expect(allocate(10n, [2500, 5000, 2500])).toEqual([2n, 6n, 2n]);
  });
  it("always sums to net", () => {
    for (const net of [1n, 7n, 999_999n, 4_950_000_000_000_000_000n]) {
      const out = allocate(net, [1234, 4321, 4445]);
      expect(out.reduce((a, b) => a + b, 0n)).toBe(net);
    }
  });
  it("picks the first largest on ties", () => {
    expect(allocate(11n, [5000, 5000])).toEqual([6n, 5n]);
  });
  it("rejects bad weights", () => {
    expect(() => allocate(1n, [5000, 4999])).toThrow();
    expect(() => allocate(1n, [10_000, 0])).toThrow();
    expect(() => allocate(1n, [])).toThrow();
  });
});

describe("release", () => {
  it("matches the contract's rounding", () => {
    expect(releaseAmount(1_000_001n, 2_500)).toBe(250_000n);
    expect(releaseAmount(7n, 5_000)).toBe(3n);
    expect(releaseAmount(7n, 10_000)).toBe(7n);
    expect(() => releaseAmount(1n, 0)).toThrow();
  });
  it("converts percent to bps", () => {
    expect(percentToBps(33.33)).toBe(3333);
    expect(percentToBps(100)).toBe(10_000);
    expect(percentToBps(0.001)).toBe(1);
  });
});

describe("decimal parsing", () => {
  it("parses plain, long and exponent forms", () => {
    expect(toScaled("1.5", 18)).toBe(15n * 10n ** 17n);
    expect(toScaled("159.63170321432773128036139513579828", 6)).toBe(159_631_703n);
    expect(toScaled("1e-7", 9)).toBe(100n);
    expect(toScaled("2.5E3", 0)).toBe(2500n);
    expect(() => toScaled("-1", 18)).toThrow();
  });
  it("formats raw units exactly", () => {
    expect(formatUnitsExact(1_500_000n, 6)).toBe("1.5");
    expect(formatUnitsExact(10n ** 18n, 18)).toBe("1");
    expect(formatUnitsExact(1n, 18)).toBe("0.000000000000000001");
  });
});

describe("Stack index (FLOWS.md §6)", () => {
  it("starts at 1000 with launch prices", () => {
    const u = launchUnits([5000, 2500, 2500], ["200", "400", "50"]);
    expect(u).toEqual(["2.5", "0.625", "5"]);
    expect(indexValue(u, ["200", "400", "50"])).toBeCloseTo(1000, 9);
  });
  it("moves with component prices, no rebalancing", () => {
    const u = launchUnits([5000, 5000], ["100", "10"]);
    // first doubles, second flat: 500*2 + 500 = 1500
    expect(indexValue(u, ["200", "10"])).toBeCloseTo(1500, 9);
  });
  it("returns null if any price is missing", () => {
    expect(indexValue(["1", "2"], ["1", null])).toBeNull();
  });
});

describe("position valuation (FLOWS.md §7)", () => {
  it("values exact units at current marks across decimals", () => {
    const v = positionValueScaled([
      { units: 2n * e18, decimals: 18, price: "185.2" },
      { units: 150_000_000n, decimals: 8, price: "400" },
    ]);
    expect(scaledToNumber(v!)).toBeCloseTo(370.4 + 600, 9);
  });
  it("refuses to guess when a price is missing", () => {
    expect(positionValueScaled([{ units: 1n, decimals: 18, price: null }])).toBeNull();
  });
  it("reduces cost basis by each release's bps", () => {
    expect(remainingCostBasis(100n * e18, [5_000])).toBe(50n * e18);
    expect(remainingCostBasis(100n * e18, [5_000, 10_000])).toBe(0n);
  });
  it("computes PnL against the fee-inclusive cost basis", () => {
    const value = valueUsdScaled(1n * e18, 18, "110");
    const r = pnl(value, 100n * e18, 18);
    expect(r.usd).toBeCloseTo(10, 9);
    expect(r.pct).toBeCloseTo(10, 9);
  });
});
