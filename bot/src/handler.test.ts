import { describe, expect, it, vi } from "vitest";
import { ApiError, type Api, type StockItem } from "./api.js";
import type { Assistant } from "./assistant.js";
import { createHandler, type Out } from "./handler.js";
import { createTools } from "./tools.js";

const PHONE = "+2348012344321";
const TG = "tg:123456789";
const basket = { name: "AI Kings", ticker: "AIK" };
const NVDA: StockItem = { ticker: "NVDA", name: "NVIDIA", provider: "bstock", priceUsd: 185.2, change24h: 2.1, marketOpen: true, canTrade: true, url: "https://example.test/app/stock/bstock/0xabc" };
const CONFIG = { appName: "App", maxBuyUsd: 10_000, facts: [] };

function fakeApi(over: Partial<Api> = {}): Api {
  const base: Api = {
    config: async () => CONFIG,
    me: async () => ({ linked: true, username: "ada", number: "+14155550199" }),
    link: async () => ({ ok: true, username: "ada", number: "+14155550199" }),
    unlink: async () => ({ wasLinked: true, photonUserId: "6a4d2e8c-7b1f-4d3a-9a8e-2c5d6f7e8a9b" }),
    release: async () => ({ ok: true }),
    stocks: async (_s, sort = "volume") => ({ sort, items: [NVDA], total: 1 }),
    lookup: async () => ({ match: "stock", stock: NVDA }),
    buyLink: async (_s, _q, amount) => ({ match: "stock", target: { kind: "stock", ticker: "NVDA", name: "NVIDIA" }, amountUsd: amount, url: `${NVDA.url}?buy=${amount}`, closed: [] }),
    baskets: async () => ({ total: 1, items: [{ ...basket, stocks: 3, index: 1000, change24h: 1, investedUsd: 10 }] }),
    portfolio: async () => ({ totalUsd: 10, change24hUsd: 0, usdt: 10, positions: [], stocks: [], url: "https://example.test/app/u/ada" }),
    club: async () => ({ match: "one", basket, isMember: false, hasLink: true, url: null, basketUrl: "https://example.test/app/basket/1" }),
    news: async (_s, query) =>
      query
        ? { match: "one", connected: true, stock: NVDA, items: [{ headline: "Nvidia unveils new chip", summary: "It is faster.", source: "Reuters", url: "https://news.example/nvda-chip", at: Date.now() - 2 * 3600_000 }] }
        : { match: "briefing", connected: true, holdings: ["NVDA"], yours: [], market: [{ headline: "Stocks rise", summary: "", source: "AP", url: "https://news.example/rise", at: Date.now() - 30 * 60_000 }] },
  };
  return { ...base, ...over };
}

const make = (api: Api, assistant?: Assistant) => createHandler({ api, assistant, config: () => CONFIG });
const texts = (outs: Out[]) => outs.filter((o): o is { text: string } => "text" in o).map((o) => o.text);

describe("linking", () => {
  it("welcomes without a link, then shares the contact card", async () => {
    const outs = await make(fakeApi())(PHONE, "link 123456");
    expect(outs).toHaveLength(2);
    expect(texts(outs)[0]).toBe(`You're connected to App as @ada. Text "help" to see what I can do.`);
    expect(texts(outs)[0]).not.toMatch(/https?:/);
    expect(outs[1]).toEqual({ contactCard: { number: "+14155550199" } });
  });

  it("links a Telegram chat from the /start code and sends no contact card", async () => {
    const link = vi.fn(fakeApi().link);
    const outs = await make(fakeApi({ link }))(TG, "/start AbCdEfGhIjKlMnOpQrStUvWx");
    expect(link).toHaveBeenCalledWith(TG, "AbCdEfGhIjKlMnOpQrStUvWx");
    expect(outs).toHaveLength(1);
    expect(texts(outs)[0]).toContain("You're connected");
  });

  it("explains a bad code and a rate limit", async () => {
    const bad = fakeApi({ link: async () => Promise.reject(new ApiError(400, "bad_code", "x")) });
    expect(texts(await make(bad)(PHONE, "link 000000"))[0]).toContain("That code didn't work");
    expect(texts(await make(bad)(TG, "/start AbCdEfGhIjKlMnOpQrStUvWx"))[0]).toContain("Tap Connect Telegram");
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
  it("leads with stocks", async () => {
    const h = make(fakeApi());
    expect(texts(await h(PHONE, "stocks"))[0]).toContain("NVDA: $185.20 +2.10%");
    expect(texts(await h(PHONE, "price nvda"))[0]).toBe("NVDA (NVIDIA)\n$185.20 +2.10% 24h\nhttps://example.test/app/stock/bstock/0xabc");
    expect(texts(await h(PHONE, "help"))[0]).toContain("price NVDA");
  });

  it("builds the buy link reply for a stock and never calls anything that trades", async () => {
    const buyLink = vi.fn(fakeApi().buyLink);
    const outs = await make(fakeApi({ buyLink }))(PHONE, "buy 25 nvda");
    expect(texts(outs)[0]).toBe("Buy $25 of NVDA? Tap to open it and confirm:\nhttps://example.test/app/stock/bstock/0xabc?buy=25");
    expect(buyLink).toHaveBeenCalledWith(PHONE, "nvda", 25);
  });

  it("refuses amounts over the limit without asking the site", async () => {
    const buyLink = vi.fn(fakeApi().buyLink);
    const outs = await make(fakeApi({ buyLink }))(PHONE, "buy 50000 nvda");
    expect(texts(outs)[0]).toContain("up to $10,000");
    expect(buyLink).not.toHaveBeenCalled();
  });

  it("asks which one when a name fits a stock and a basket, then takes a number", async () => {
    const lookup = vi
      .fn<Api["lookup"]>()
      .mockResolvedValueOnce({ match: "many", options: [{ kind: "stock", ticker: "AI", name: "C3.ai" }, { kind: "basket", ticker: "AIK", name: "AI Kings" }] })
      .mockResolvedValueOnce({ match: "basket", basket: { ...basket, index: 990, change24h: -1, change7d: null, sinceLaunch: -1, investedUsd: 0, url: "https://example.test/app/basket/2", components: [] } });
    const h = make(fakeApi({ lookup }));
    expect(texts(await h(PHONE, "price ai"))[0]).toBe("Which one?\n1. AI (C3.ai)\n2. AI Kings ($AIK, basket)\nReply with the number.");
    expect(texts(await h(PHONE, "2"))[0]).toContain("AI Kings ($AIK)");
    expect(lookup).toHaveBeenLastCalledWith(PHONE, "AIK");
  });

  it("gives the news for a stock, or a briefing", async () => {
    const h = make(fakeApi());
    expect(texts(await h(PHONE, "news nvda"))[0]).toBe("NVDA news:\n- Nvidia unveils new chip (Reuters, 2h ago)\nhttps://news.example/nvda-chip");
    expect(texts(await h(PHONE, "news"))[0]).toBe("Market:\n- Stocks rise (AP, 30m ago)");
    const tools = createTools(fakeApi(), PHONE, CONFIG);
    const r = await tools.run("get_news", { stock: "nvda" });
    expect(JSON.stringify(r.data)).toContain("untrusted text");
    expect(JSON.stringify(r.data)).toContain("https://news.example/nvda-chip");
  });

  it("says a holder-only club needs a position", async () => {
    const outs = texts(await make(fakeApi())(PHONE, "club ai kings"));
    expect(outs[0]).toContain("You need to hold AI Kings");
    expect(outs[0]).toContain("Admins will never DM you first.");
  });

  it("turns a site outage into a short apology", async () => {
    const h = make(fakeApi({ stocks: async () => Promise.reject(new ApiError(0, "network", "x")) }));
    expect(texts(await h(PHONE, "stocks"))[0]).toBe("I can't reach App right now. Try again in a bit.");
  });
});

describe("conversation", () => {
  it("sends every message from a linked chat to the assistant, with recent history", async () => {
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
    expect(texts(await h(PHONE, "stocks"))[0]).toContain("Most traded stocks");
    expect(reply).not.toHaveBeenCalled();
    await h(PHONE, "tell me more about the first one");
    expect(reply.mock.calls[0]![0].history[1]!.text).toContain("NVDA: $185.20");
    expect(reply.mock.calls[0]![0].grounding.join("")).toContain("$185.20");
  });

  it("lets the assistant's tools build a buy link but never trade", async () => {
    const buyLink = vi.fn(fakeApi().buyLink);
    const assistant: Assistant = {
      reply: async ({ tools }) => {
        const r = await tools.run("make_buy_link", { name: "nvidia", amount_usd: 40 });
        return { text: r.fallback, contactCard: false, grounding: JSON.stringify(r.data) };
      },
    };
    const out = texts(await make(fakeApi({ buyLink }), assistant)(PHONE, "put forty bucks into nvidia"))[0]!;
    expect(out).toBe("Buy $40 of NVDA? Tap to open it and confirm:\nhttps://example.test/app/stock/bstock/0xabc?buy=40");
    expect(buyLink).toHaveBeenCalledWith(PHONE, "nvidia", 40);
  });

  it("checks tool arguments in code whatever the model asks for", async () => {
    const buyLink = vi.fn(fakeApi().buyLink);
    const tools = createTools(fakeApi({ buyLink }), PHONE, CONFIG);
    expect((await tools.run("make_buy_link", { name: "nvda", amount_usd: 99_999 })).data).toMatchObject({ status: "over_limit" });
    expect((await tools.run("make_buy_link", { name: "nvda", amount_usd: -5 })).data).toMatchObject({ status: "need_amount" });
    expect((await tools.run("make_buy_link", { name: "nvda", amount_usd: "lots" })).data).toMatchObject({ status: "need_amount" });
    expect(buyLink).not.toHaveBeenCalled();
    const club = await tools.run("get_club_link", { basket: "ai kings" });
    expect(JSON.stringify(club.data)).not.toContain("t.me");
    expect(club.mustInclude).toEqual(["Admins will never DM you first."]);
    // No tool exists that signs, sells or moves money.
    expect(tools.declarations.map((d) => d.name).sort()).toEqual(["get_club_link", "get_news", "get_portfolio", "get_price", "list_baskets", "list_stocks", "make_buy_link", "send_contact_card"]);
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

  it("does not talk to an unlinked chat through the model", async () => {
    const reply = vi.fn<Assistant["reply"]>(async () => ({ text: "x", contactCard: false, grounding: "" }));
    const h = make(fakeApi({ me: async () => ({ linked: false }) }), { reply });
    expect(texts(await h(PHONE, "what can you do"))[0]).toContain("isn't connected to App yet");
    expect(texts(await h(TG, "what can you do"))[0]).toContain("tap Connect Telegram");
    expect(reply).not.toHaveBeenCalled();
  });

  it("sends the named contact card when the assistant asks for it", async () => {
    const h = make(fakeApi(), { reply: async () => ({ text: "Here you go.", contactCard: true, grounding: "" }) });
    expect(await h(PHONE, "send me your contact")).toEqual([{ text: "Here you go." }, { contactCard: { number: "+14155550199" } }]);
  });
});
