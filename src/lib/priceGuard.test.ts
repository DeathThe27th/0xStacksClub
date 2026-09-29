import { describe, expect, it } from "vitest";
import { checkQuotePrice } from "./priceGuard";

const e18 = 10n ** 18n;

describe("checkQuotePrice", () => {
  it("blocks the real AVGO fill that paid 4.5x market", () => {
    const r = checkQuotePrice({ side: "buy", usdtRaw: 990000000000000000n, usdtDecimals: 18, tokenRaw: 618049187475361n, tokenDecimals: 18, fairUsd: 354.52 });
    expect(r.quotedUsd).toBeCloseTo(1601.8, 0);
    expect(r.ok).toBe(false);
  });

  it("allows a buy a little over market", () => {
    // NVDA leg: $1.485 for 0.006428 tokens = $231 vs $225.5 fair, ~2.4% over.
    const r = checkQuotePrice({ side: "buy", usdtRaw: 1485000000000000000n, usdtDecimals: 18, tokenRaw: 6427931955102059n, tokenDecimals: 18, fairUsd: 225.53 });
    expect(r.worsePct).toBeCloseTo(2.4, 1);
    expect(r.ok).toBe(true);
  });

  it("treats a buy below market as fine", () => {
    const r = checkQuotePrice({ side: "buy", usdtRaw: 90n * e18, usdtDecimals: 18, tokenRaw: e18, tokenDecimals: 18, fairUsd: 100 });
    expect(r.worsePct).toBeCloseTo(-10);
    expect(r.ok).toBe(true);
  });

  it("blocks a sell that receives far under market", () => {
    const r = checkQuotePrice({ side: "sell", usdtRaw: 80n * e18, usdtDecimals: 18, tokenRaw: e18, tokenDecimals: 18, fairUsd: 100 });
    expect(r.worsePct).toBeCloseTo(20);
    expect(r.ok).toBe(false);
  });

  it("allows a sell just under market and handles mixed decimals", () => {
    const r = checkQuotePrice({ side: "sell", usdtRaw: 97_000_000n, usdtDecimals: 6, tokenRaw: e18, tokenDecimals: 18, fairUsd: 100 });
    expect(r.ok).toBe(true);
  });

  it("blocks a quote with zero tokens out", () => {
    expect(checkQuotePrice({ side: "buy", usdtRaw: e18, usdtDecimals: 18, tokenRaw: 0n, tokenDecimals: 18, fairUsd: 100 }).ok).toBe(false);
  });
});
