import { describe, expect, it } from "vitest";
import { matchBasket } from "./basketMatch";

const baskets = [
  { id: 1, name: "AI Kings", ticker: "AIK" },
  { id: 2, name: "AI Infrastructure", ticker: "AINF" },
  { id: 3, name: "Chip Makers", ticker: "CHIP" },
  { id: 4, name: "Space Race", ticker: "SPACE" },
];

function one(q: string) {
  const m = matchBasket(q, baskets);
  return m.kind === "one" ? m.basket.id : m.kind;
}

describe("matchBasket", () => {
  it("matches an exact name or ticker, with or without $", () => {
    expect(one("AI Kings")).toBe(1);
    expect(one("$aik")).toBe(1);
    expect(one("chip")).toBe(3);
  });

  it("matches a prefix, a word and the words 'the basket'", () => {
    expect(one("space")).toBe(4);
    expect(one("kings")).toBe(1);
    expect(one("the chip makers basket")).toBe(3);
    expect(one("infra")).toBe(2);
  });

  it("forgives a small typo on longer words", () => {
    expect(one("chip makrs")).toBe(3);
    expect(one("space rase")).toBe(4);
    expect(one("ai kigns")).toBe(1);
    expect(one("kigns")).toBe("none");
  });

  it("asks when several baskets fit equally", () => {
    const m = matchBasket("ai", baskets);
    expect(m.kind).toBe("many");
    if (m.kind === "many") expect(m.options.map((o) => o.id)).toEqual([1, 2]);
  });

  it("returns nothing for no match or empty input", () => {
    expect(one("bananas")).toBe("none");
    expect(one("   ")).toBe("none");
    expect(one("basket")).toBe("none");
    expect(one("xy")).toBe("none");
  });
});
