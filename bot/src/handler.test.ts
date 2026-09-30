import { describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "./api.js";
import { createHandler, type Out } from "./handler.js";
import type { Nlu } from "./nlu.js";

const PHONE = "+2348012344321";
const basket = { name: "AI Kings", ticker: "AIK" };

function fakeApi(over: Partial<Api> = {}): Api {
  const base: Api = {
    config: async () => ({ appName: "App", maxBuyUsd: 10_000 }),
    me: async () => ({ linked: true, username: "ada" }),
    link: async () => ({ ok: true, username: "ada" }),
    unlink: async () => ({ wasLinked: true, photonUserId: "6a4d2e8c-7b1f-4d3a-9a8e-2c5d6f7e8a9b" }),
    release: async () => ({ ok: true }),
    baskets: async () => ({ total: 1, items: [{ ...basket, stocks: 3, index: 1000, change24h: 1, investedUsd: 10 }] }),
    price: async () => ({ match: "many", options: [basket, { name: "AI Infrastructure", ticker: "AINF" }] }),
    portfolio: async () => ({ totalUsd: 10, change24hUsd: 0, usdt: 10, positions: [], stocks: [], url: "https://example.test/app/u/ada" }),
    buy: async (_p, _q, amount) => ({ match: "one", basket, amountUsd: amount, url: `https://example.test/app/basket/1?buy=${amount}`, closed: [] }),
    club: async () => ({ match: "one", basket, isMember: false, hasLink: true, url: null, basketUrl: "https://example.test/app/basket/1" }),
  };
  return { ...base, ...over };
}

const make = (api: Api, nlu?: Nlu) => createHandler({ api, nlu, config: () => ({ appName: "App", maxBuyUsd: 10_000 }) });
const texts = (outs: Out[]) => outs.filter((o): o is { text: string } => "text" in o).map((o) => o.text);

describe("linking", () => {
  it("welcomes without a link, then shares the contact card", async () => {
    const outs = await make(fakeApi())(PHONE, "link 123456");
    expect(outs).toHaveLength(2);
    expect(texts(outs)[0]).toBe(`You're connected to App as @ada. Text "help" to see what I can do.`);
    expect(texts(outs)[0]).not.toMatch(/https?:/);
    expect(outs[1]).toEqual({ contactCard: true });
  });

  it("explains a bad code and a rate limit", async () => {
    const bad = fakeApi({ link: async () => Promise.reject(new ApiError(400, "bad_code", "x")) });
    expect(texts(await make(bad)(PHONE, "link 000000"))[0]).toContain("That code didn't work");
    const limited = fakeApi({ link: async () => Promise.reject(new ApiError(429, "rate_limited", "x")) });
    expect(texts(await make(limited)(PHONE, "link 000000"))[0]).toContain("Wait a few minutes");
  });

  it("tells an unlinked number to connect, text only, and then goes quiet", async () => {
    const h = make(fakeApi({ me: async () => ({ linked: false }) }));
    const first = texts(await h(PHONE, "portfolio"));
    expect(first[0]).toContain("isn't connected to App yet");
    expect(first[0]).not.toMatch(/https?:/);
    await h(PHONE, "hello");
    await h(PHONE, "hello");
    expect(await h(PHONE, "hello")).toEqual([]);
  });

  it("unlinks on stop and frees the Photon user after the goodbye", async () => {
    const release = vi.fn(async () => ({ ok: true }));
    const outs = await make(fakeApi({ release }))(PHONE, "stop");
    expect(texts(outs)[0]).toContain("Disconnected");
    expect(release).not.toHaveBeenCalled();
    const run = outs.find((o): o is { run: () => Promise<void> } => "run" in o);
    await run!.run();
    expect(release).toHaveBeenCalledWith(PHONE, "6a4d2e8c-7b1f-4d3a-9a8e-2c5d6f7e8a9b");
  });
});

describe("commands", () => {
  it("builds the buy link reply and never calls anything that trades", async () => {
    const buy = vi.fn(fakeApi().buy);
    const outs = await make(fakeApi({ buy }))(PHONE, "buy 25 ai kings");
    expect(texts(outs)[0]).toBe("Buy $25 of AI Kings? Tap to open it and confirm:\nhttps://example.test/app/basket/1?buy=25");
    expect(buy).toHaveBeenCalledWith(PHONE, "ai kings", 25);
  });

  it("refuses amounts over the limit without asking the site", async () => {
    const buy = vi.fn(fakeApi().buy);
    const outs = await make(fakeApi({ buy }))(PHONE, "buy 50000 ai kings");
    expect(texts(outs)[0]).toContain("up to $10,000");
    expect(buy).not.toHaveBeenCalled();
  });

  it("asks which basket when several match, then takes a number", async () => {
    const price = vi
      .fn<Api["price"]>()
      .mockResolvedValueOnce({ match: "many", options: [basket, { name: "AI Infrastructure", ticker: "AINF" }] })
      .mockResolvedValueOnce({
        match: "one",
        basket: { ...{ name: "AI Infrastructure", ticker: "AINF" }, index: 990, change24h: -1, change7d: null, sinceLaunch: -1, investedUsd: 0, url: "https://example.test/app/basket/2", components: [] },
      });
    const h = make(fakeApi({ price }));
    expect(texts(await h(PHONE, "price ai"))[0]).toBe("Which basket?\n1. AI Kings ($AIK)\n2. AI Infrastructure ($AINF)\nReply with the number.");
    expect(texts(await h(PHONE, "2"))[0]).toContain("AI Infrastructure ($AINF)");
    expect(price).toHaveBeenLastCalledWith(PHONE, "AINF");
  });

  it("says a holder-only club needs a position", async () => {
    const outs = texts(await make(fakeApi())(PHONE, "club ai kings"));
    expect(outs[0]).toContain("You need to buy in");
    expect(outs[0]).toContain("Admins will never DM you first.");
  });

  it("turns a site outage into a short apology", async () => {
    const h = make(fakeApi({ baskets: async () => Promise.reject(new ApiError(0, "network", "x")) }));
    expect(texts(await h(PHONE, "baskets"))[0]).toBe("I can't reach App right now. Try again in a bit.");
  });
});

describe("plain English", () => {
  const nlu = (parse: Nlu["parse"], answer: Nlu["answer"] = async () => null): Nlu => ({ parse, answer });

  it("uses the model's label but validates it in code", async () => {
    const buy = vi.fn(fakeApi().buy);
    const h = make(fakeApi({ buy }), nlu(async () => ({ intent: "buy", basket: "ai kings", amount: 40, confidence: 0.9 })));
    expect(texts(await h(PHONE, "put forty bucks into ai kings"))[0]).toContain("Buy $40 of AI Kings?");
    const over = make(fakeApi({ buy }), nlu(async () => ({ intent: "buy", basket: "ai kings", amount: 99_999, confidence: 0.9 })));
    expect(texts(await over(PHONE, "put everything into ai kings"))[0]).toContain("up to $10,000");
    const negative = make(fakeApi({ buy }), nlu(async () => ({ intent: "buy", basket: "ai kings", amount: -5, confidence: 0.9 })));
    expect(texts(await negative(PHONE, "put some into ai kings"))[0]).toBe("How much? For example: buy 25 ai kings");
  });

  it("falls back to keywords when the model fails", async () => {
    const h = make(fakeApi(), nlu(async () => null));
    expect(texts(await h(PHONE, "can you show my portfolio please"))[0]).toContain("Total $10.00");
  });

  it("asks again when confidence is low", async () => {
    const h = make(fakeApi(), nlu(async () => ({ intent: "club", basket: null, amount: null, confidence: 0.3 })));
    expect(texts(await h(PHONE, "hmm what about that thing"))[0]).toContain("I didn't catch that");
  });

  it("skips the model for exact commands", async () => {
    const parse = vi.fn<Nlu["parse"]>(async () => null);
    await make(fakeApi(), nlu(parse))(PHONE, "baskets");
    expect(parse).not.toHaveBeenCalled();
  });

  it("answers a performance question with our figures and the model's sentence", async () => {
    const portfolio: Api["portfolio"] = async () => ({
      totalUsd: 500,
      change24hUsd: 1,
      usdt: 0,
      positions: [{ id: 12, name: "AI Kings", ticker: "AIK", valueUsd: 500, costBasisUsd: 480, pnlUsd: 20, pnlPct: 4.17, basketChange7d: 2.1 }],
      stocks: [],
      url: "https://example.test/app/u/ada",
    });
    const answer = vi.fn<Nlu["answer"]>(async () => "AI Kings is up over the week.");
    const h = make(fakeApi({ portfolio }), nlu(async () => ({ intent: "question", basket: null, amount: null, confidence: 0.9 }), answer));
    const out = texts(await h(PHONE, "how did my baskets do this week"))[0]!;
    expect(out.split("\n")).toEqual(["AI Kings is up over the week.", "AI Kings: basket +2.10% 7d, you +$20.00 (+4.17%) since buying", "https://example.test/app/u/ada"]);
    // The model saw percentages only: no dollar figures, no link, no wallet.
    const facts = JSON.stringify(answer.mock.calls[0]![1]);
    expect(facts).not.toMatch(/500|480|example\.test|\$/);
  });
});
