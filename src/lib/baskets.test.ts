import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { BASKET_CATEGORIES, basketCategory, CURATED_BASKETS } from "./baskets";

describe("curated baskets", () => {
  it("are valid recipes: 2 to 5 unique stocks, weights sum to 10,000", () => {
    for (const b of CURATED_BASKETS) {
      expect(b.ticker).toMatch(/^[A-Z]{2,6}$/);
      expect(b.name.length).toBeGreaterThanOrEqual(3);
      expect(b.name.length).toBeLessThanOrEqual(32);
      expect(b.description.length).toBeLessThanOrEqual(280);
      expect(b.components.length).toBeGreaterThanOrEqual(2);
      expect(b.components.length).toBeLessThanOrEqual(5);
      expect(new Set(b.components.map((c) => c.address.toLowerCase())).size).toBe(b.components.length);
      expect(b.components.reduce((s, c) => s + c.weightBps, 0)).toBe(10_000);
      for (const c of b.components) {
        expect(c.weightBps).toBeGreaterThan(0);
        expect(getAddress(c.address)).toBe(c.address);
      }
    }
  });

  it("have unique tickers and known categories", () => {
    expect(new Set(CURATED_BASKETS.map((b) => b.ticker)).size).toBe(CURATED_BASKETS.length);
    for (const b of CURATED_BASKETS) expect(BASKET_CATEGORIES.some((c) => c.id === b.category)).toBe(true);
  });

  it("files anything uncurated under Community", () => {
    expect(basketCategory("CHIPS").id).toBe("semis");
    expect(basketCategory("chips").id).toBe("semis");
    expect(basketCategory("SOCIAL").id).toBe("community");
    expect(basketCategory(null).id).toBe("community");
  });
});
