import { describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "./api.js";
import { createHandler, type Out } from "./handler.js";
import type { Assistant } from "./assistant.js";

const PHONE = "+2348012344321";
const basket = { name: "AI Kings", ticker: "AIK" };

function fakeApi(over: Partial<Api> = {}): Api {
  const base: Api = {
    config: async () => ({ appName: "App", maxBuyUsd: 10_000, facts: [] }),
    me: async () => ({ linked: true, username: "ada", number: "+14155550199" }),
    link: async () => ({ ok: true, username: "ada", number: "+14155550199" }),
    unlink: async () => ({ wasLinked: true, photonUserId: "6a4d2e8c-7b1f-4d3a-9a8e-2c5d6f7e8a9b" }),
    release: async () => ({ ok: true }),
    baskets: async () => ({ total: 1, items: [{ ...basket, stocks: 3, index: 1000, change24h: 1, investedUsd: 10 }] }),
    price: async () => ({ match: "many", options: [basket, { name: "AI Infrastructure", ticker: "AINF" }] }),
    portfolio: async () => ({ totalUsd: 10, change24hUsd: 0, usdt: 10, positions: [], stocks: [], url: "https://example.test/app/u/ada" }),
    buy: async (_p, _q, amount) => ({ match: "one", basket, amountUsd: amount, url: `https://example.test/app/basket/1?buy=${amount}`, closed: [] }),
    club: async () => ({ match: "one", basket, isMember: false, hasLink: true, url: null, basketUrl: "https://example.test/app/basket/1" }),
    stock: async () => ({ match: "none" }),
  };
  return { ...base, ...over };
}

const make = (api: Api, assistant?: Assistant) => createHandler({ api, assistant, config: () => ({ appName: "App", maxBuyUsd: 10_000, facts: [] }) });
const texts = (outs: Out[]) => outs.filter((o): o is { text: string } => "text" in o).map((o) => o.text);

describe("linking", () => {
  it("welcomes without a link, then shares the contact card", async () => {
    const outs = await make(fakeApi())(PHONE, "link 123456");
    expect(outs).toHaveLength(2);
    expect(texts(outs)[0]).toBe(`You're connected to App as @ada. Text "help" to see what I can do.`);
    expect(texts(outs)[0]).not.toMatch(/https?:/);
    expect(outs[1]).toEqual({ contactCard: { number: "+14155550199" } });
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

describe("conversation", () => {
  it("sends every message from a linked phone to the assistant, with recent history", async () => {
    const reply = vi.fn<Assistant["reply"]>(async ({ text }) => ({ text: `re: ${text}`, contactCard: false, grounding: "" }));
    const h = make(fakeApi(), { reply });
    expect(texts(await h(PHONE, "what's hot right now"))).toEqual(["re: what's hot right now"]);
    expect(texts(await h(PHONE, "and the first one?"))).toEqual(["re: and the first one?"]);
    expect(reply.mock.calls[1]![0].history).toEqual([
      { role: "user", text: "what's hot right now" },
      { role: "model", text: "re: what's hot right now" },
    ]);
    expect(reply.mock.calls[1]![0].username).toBe("ada");
  });

  it("answers exact commands instantly and keeps them in the conversation", async () => {
    const reply = vi.fn<Assistant["reply"]>(async () => ({ text: "sure", contactCard: false, grounding: "" }));
    const h = make(fakeApi(), { reply });
    expect(texts(await h(PHONE, "baskets"))[0]).toContain("Top baskets");
    expect(reply).not.toHaveBeenCalled();
    await h(PHONE, "tell me more about the first one");
    expect(reply.mock.calls[0]![0].history[1]!.text).toContain("1. AI Kings ($AIK)");
    expect(reply.mock.calls[0]![0].grounding.join("")).toContain("1,000.00");
  });

  it("lets the assistant's tools build a buy link but never trade", async () => {
    const buy = vi.fn(fakeApi().buy);
    const assistant: Assistant = {
      reply: async ({ tools }) => {
        const r = await tools.run("make_buy_link", { basket: "ai kings", amount_usd: 40 });
        return { text: r.fallback, contactCard: false, grounding: JSON.stringify(r.data) };
      },
    };
    const out = texts(await make(fakeApi({ buy }), assistant)(PHONE, "put forty bucks into ai kings"))[0]!;
    expect(out).toBe("Buy $40 of AI Kings? Tap to open it and confirm:\nhttps://example.test/app/basket/1?buy=40");
    expect(buy).toHaveBeenCalledWith(PHONE, "ai kings", 40);
  });

  it("checks tool arguments in code whatever the model asks for", async () => {
    const buy = vi.fn(fakeApi().buy);
    const tools = (await import("./tools.js")).createTools(fakeApi({ buy }), PHONE, { appName: "App", maxBuyUsd: 10_000, facts: [] });
    expect((await tools.run("make_buy_link", { basket: "ai kings", amount_usd: 99_999 })).data).toMatchObject({ status: "over_limit" });
    expect((await tools.run("make_buy_link", { basket: "ai kings", amount_usd: -5 })).data).toMatchObject({ status: "need_amount" });
    expect((await tools.run("make_buy_link", { basket: "ai kings", amount_usd: "lots" })).data).toMatchObject({ status: "need_amount" });
    expect(buy).not.toHaveBeenCalled();
    const club = await tools.run("get_club_link", { basket: "ai kings" });
    expect(JSON.stringify(club.data)).not.toContain("t.me");
    expect(club.mustInclude).toEqual(["Admins will never DM you first."]);
  });

  it("falls back to keyword commands when the assistant can't answer", async () => {
    const h = make(fakeApi(), { reply: async () => null });
    expect(texts(await h(PHONE, "can you show my portfolio please"))[0]).toContain("Total $10.00");
    expect(texts(await h(PHONE, "tell me a joke"))[0]).toContain("I'm having trouble thinking");
  });

  it("keeps link and stop out of the model's hands", async () => {
    const reply = vi.fn<Assistant["reply"]>(async () => ({ text: "x", contactCard: false, grounding: "" }));
    const h = make(fakeApi(), { reply });
    await h(PHONE, "link 123456");
    await h(PHONE, "stop");
    expect(reply).not.toHaveBeenCalled();
  });

  it("does not talk to an unlinked phone through the model", async () => {
    const reply = vi.fn<Assistant["reply"]>(async () => ({ text: "x", contactCard: false, grounding: "" }));
    const h = make(fakeApi({ me: async () => ({ linked: false }) }), { reply });
    expect(texts(await h(PHONE, "what can you do"))[0]).toContain("isn't connected to App yet");
    expect(reply).not.toHaveBeenCalled();
  });

  it("sends the named contact card when the assistant asks for it", async () => {
    const h = make(fakeApi(), { reply: async () => ({ text: "Here you go.", contactCard: true, grounding: "" }) });
    expect(await h(PHONE, "send me your contact")).toEqual([{ text: "Here you go." }, { contactCard: { number: "+14155550199" } }]);
  });
});
