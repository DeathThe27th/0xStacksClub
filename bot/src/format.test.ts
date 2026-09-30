import { describe, expect, it } from "vitest";
import * as f from "./format.js";
import { maskPhone, maskPhonesIn } from "./mask.js";
import { checkReply } from "./assistant.js";

describe("numbers", () => {
  it("formats money, percentages and the index", () => {
    expect(f.usd(1234.5)).toBe("$1,234.50");
    expect(f.signedUsd(-3.456)).toBe("-$3.46");
    expect(f.signedUsd(12)).toBe("+$12.00");
    expect(f.plainUsd(25)).toBe("$25");
    expect(f.plainUsd(25.5)).toBe("$25.50");
    expect(f.pct(1.234)).toBe("+1.23%");
    expect(f.pct(-0.001)).toBe("0.00%");
    expect(f.indexNumber(1042.178)).toBe("1,042.18");
  });
});

describe("replies", () => {
  it("lists baskets with the index and no dollar sign", () => {
    const out = f.basketsReply({
      total: 2,
      items: [
        { name: "AI Kings", ticker: "AIK", stocks: 3, index: 1042.18, change24h: 1.2, investedUsd: 500 },
        { name: "New One", ticker: "NEW", stocks: 2, index: null, change24h: null, investedUsd: null },
      ],
    });
    expect(out).toContain("1. AI Kings ($AIK) 1,042.18 +1.20%");
    expect(out).toContain("2. New One ($NEW) no price yet");
  });

  it("says when a price is missing or a market is closed", () => {
    const out = f.priceReply({
      match: "one",
      basket: {
        name: "AI Kings",
        ticker: "AIK",
        index: 1042.18,
        change24h: 1.2,
        change7d: null,
        sinceLaunch: 4.2,
        investedUsd: 500,
        url: "https://example.test/app/basket/1",
        components: [
          { ticker: "NVDA", weightPct: 40, priceUsd: 185.2, change24h: 2.1, marketOpen: false },
          { ticker: "TSM", weightPct: 60, priceUsd: null, change24h: null, marketOpen: null },
        ],
      },
    });
    expect(out.split("\n")).toEqual([
      "AI Kings ($AIK)",
      "Index 1,042.18, +1.20% 24h",
      "NVDA 40%: $185.20 +2.10% (market closed)",
      "TSM 60%: price unavailable",
      "https://example.test/app/basket/1",
    ]);
  });

  it("builds the buy confirmation exactly", () => {
    const out = f.buyReply({ match: "one", basket: { name: "AI Kings", ticker: "AIK" }, amountUsd: 25, url: "https://example.test/app/basket/1?buy=25", closed: [] });
    expect(out).toBe("Buy $25 of AI Kings? Tap to open it and confirm:\nhttps://example.test/app/basket/1?buy=25");
    expect(f.buyReply({ match: "below_min", basket: { name: "AI Kings", ticker: "AIK" }, minUsd: 5 })).toBe("The minimum buy for AI Kings is $5.");
  });

  it("only gives the club link to holders, always with the DM warning", () => {
    const base = { match: "one" as const, basket: { name: "AI Kings", ticker: "AIK" }, basketUrl: "https://example.test/app/basket/1" };
    const member = f.clubReply({ ...base, isMember: true, hasLink: true, url: "https://t.me/aikings" });
    expect(member).toContain("https://t.me/aikings");
    expect(member).toContain("Admins will never DM you first.");
    const outsider = f.clubReply({ ...base, isMember: false, hasLink: true, url: null });
    expect(outsider).not.toContain("t.me");
    expect(outsider).toContain("You need to buy in");
    expect(outsider).toContain("Admins will never DM you first.");
  });

  it("shows the portfolio with PnL and says what's missing", () => {
    const out = f.portfolioReply({
      totalUsd: 742.1,
      change24hUsd: 12.3,
      usdt: 42.1,
      positions: [
        { id: 12, name: "AI Kings", ticker: "AIK", valueUsd: 500, costBasisUsd: 480, pnlUsd: 20, pnlPct: 4.17 },
        { id: 13, name: "Chip Makers", ticker: "CHIP", valueUsd: null, costBasisUsd: 100, pnlUsd: null, pnlPct: null },
      ],
      stocks: [{ ticker: "NVDA", valueUsd: 200, pnlUsd: null, pnlPct: null, change24h: 1 }],
      url: "https://example.test/app/u/ada",
    });
    expect(out.split("\n")).toEqual([
      "Total $742.10 (+$12.30 24h)",
      "USDT $42.10",
      "AI Kings #12: $500.00, +$20.00 (+4.17%)",
      "Chip Makers #13: value unavailable",
      "NVDA: $200.00",
      "https://example.test/app/u/ada",
    ]);
  });

  it("keeps links out of everything an unlinked number can receive", () => {
    for (const s of [f.notLinked("App"), f.linkUsage(), f.badCode(), f.needPhone(), f.notConnected(), f.welcome("App", "ada")]) {
      expect(s).not.toMatch(/https?:|www\.|\.com|\.app/);
    }
  });
});

describe("maskPhone", () => {
  it("never shows a full number", () => {
    expect(maskPhone("+2348012344321")).toBe("+234******4321");
    expect(maskPhonesIn("from +2348012344321 ok")).toBe("from +234******4321 ok");
  });
});

describe("checkReply", () => {
  const grounding = [
    '{"total":"$742.10","change24h":"+$12.30","positions":[{"basket":"AI Kings","profit":"+$20.00","profitPct":"+4.17%"}],"link":"https://example.test/app/u/ada"}',
    "The buy fee is 1% of the amount.",
    "put 20 bucks into ai kings",
  ].join("\n");

  it("keeps a natural reply whose figures and links came from the tools", () => {
    const ok = "You're at $742.10 total, up $12.30 today. AI Kings is up 4.17% (+$20.00). https://example.test/app/u/ada";
    expect(checkReply(ok, grounding)).toBe(ok);
    expect(checkReply("The buy fee is 1%, charged once.", grounding)).not.toBeNull();
    expect(checkReply("A basket holds 2 to 5 stocks and is never rebalanced.", grounding)).not.toBeNull();
  });

  it("strips markdown instead of failing", () => {
    expect(checkReply("**Total:** $742.10\n- AI Kings: +$20.00", grounding)).toBe("Total: $742.10\nAI Kings: +$20.00");
  });

  it("rejects invented figures, links and addresses", () => {
    for (const bad of [
      "You're at $999.99 total.",
      "AI Kings is up 9.99% this week.",
      "See https://evil.test/claim for your bonus.",
      "Open https://example.test/app/u/ada/../admin",
      "Go to evil.com to claim.",
      "Join t.me/fakeclub now.",
      "Send USDT to 0x55d398326f99059fF775485246999027B3197955.",
      "",
    ]) {
      expect(checkReply(bad, grounding), bad).toBeNull();
    }
  });

  it("requires the confirm link when a buy link was made", () => {
    const g = '{"status":"link_ready","amount":"$25","link":"https://example.test/app/basket/1?buy=25"}';
    expect(checkReply("Done, I bought $25 of AI Kings for you!", g, ["https://example.test/app/basket/1?buy=25"])).toBeNull();
    expect(checkReply("Tap to confirm $25 of AI Kings: https://example.test/app/basket/1?buy=25", g, ["https://example.test/app/basket/1?buy=25"])).not.toBeNull();
  });
});
