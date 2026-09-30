import { describe, expect, it } from "vitest";
import { parseAmount, parseCommand, parseLoose } from "./parse.js";

describe("parseAmount", () => {
  it("reads plain dollar amounts", () => {
    expect(parseAmount("25")).toBe(25);
    expect(parseAmount("$25.50")).toBe(25.5);
    expect(parseAmount("1,000")).toBe(1000);
    expect(parseAmount("40 usd")).toBe(40);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "0", "-5", "abc", "25.555", "1e9", "25 kings", "$"]) expect(parseAmount(bad), bad).toBeNull();
  });
});

describe("parseCommand", () => {
  it("reads link codes and stop words", () => {
    expect(parseCommand("link 123456")).toEqual({ kind: "link", code: "123456" });
    expect(parseCommand(" Link: 123456 ")).toEqual({ kind: "link", code: "123456" });
    expect(parseCommand("link 12345")).toEqual({ kind: "link", code: "" });
    expect(parseCommand("STOP")).toEqual({ kind: "stop" });
    expect(parseCommand("unlink")).toEqual({ kind: "stop" });
    expect(parseCommand("/start AbCdEfGhIjKlMnOpQrStUvWx")).toEqual({ kind: "link", code: "AbCdEfGhIjKlMnOpQrStUvWx" });
    expect(parseCommand("/start")).toEqual({ kind: "help" });
  });

  it("reads the simple commands in any case", () => {
    expect(parseCommand("Help")).toEqual({ kind: "help" });
    expect(parseCommand("hey")).toEqual({ kind: "unknown" });
    expect(parseLoose("hey")).toEqual({ kind: "help" });
    expect(parseCommand("baskets")).toEqual({ kind: "baskets" });
    expect(parseCommand("Stocks")).toEqual({ kind: "stocks", sort: "volume" });
    expect(parseCommand("movers")).toEqual({ kind: "stocks", sort: "gainers" });
    expect(parseCommand("price NVDA")).toEqual({ kind: "price", basket: "NVDA" });
    expect(parseCommand("buy 20 nvda")).toEqual({ kind: "buy", amount: 20, basket: "nvda" });
    expect(parseCommand("Portfolio")).toEqual({ kind: "portfolio" });
    expect(parseCommand("price AI Kings")).toEqual({ kind: "price", basket: "AI Kings" });
    expect(parseCommand("club ai kings")).toEqual({ kind: "club", basket: "ai kings" });
  });

  it("reads buy with the amount before or after the basket", () => {
    expect(parseCommand("buy 25 ai kings")).toEqual({ kind: "buy", amount: 25, basket: "ai kings" });
    expect(parseCommand("buy $25.50 of AI Kings")).toEqual({ kind: "buy", amount: 25.5, basket: "AI Kings" });
    expect(parseCommand("buy ai kings 25")).toEqual({ kind: "buy", amount: 25, basket: "ai kings" });
    expect(parseCommand("buy ai kings")).toEqual({ kind: "buy", amount: null, basket: "ai kings" });
  });

  it("leaves sentences for the model", () => {
    expect(parseCommand("how did my baskets do this week")).toEqual({ kind: "unknown" });
    expect(parseCommand("stop sending me this")).toEqual({ kind: "unknown" });
  });
});

describe("parseLoose", () => {
  it("finds the command inside a sentence", () => {
    expect(parseLoose("can you show my portfolio please")).toEqual({ kind: "portfolio" });
    expect(parseLoose("what are the top baskets")).toEqual({ kind: "baskets" });
    expect(parseLoose("what's hot today")).toEqual({ kind: "stocks", sort: "volume" });
    expect(parseLoose("show me the top gainers")).toEqual({ kind: "stocks", sort: "gainers" });
    expect(parseLoose("how is ai kings doing?")).toEqual({ kind: "price", basket: "ai kings" });
    expect(parseLoose("i want to buy 50 of chip makers")).toEqual({ kind: "buy", amount: 50, basket: "chip makers" });
    expect(parseLoose("telegram for ai kings")).toEqual({ kind: "club", basket: "ai kings" });
    expect(parseLoose("i want to sell my nvda")).toEqual({ kind: "sell", name: "nvda" });
    expect(parseLoose("sell all my tesla please")).toEqual({ kind: "sell", name: "tesla", percent: 100 });
    expect(parseCommand("news")).toEqual({ kind: "news", name: "" });
    expect(parseCommand("news on nvda")).toEqual({ kind: "news", name: "nvda" });
    expect(parseLoose("any news about tesla?")).toEqual({ kind: "news", name: "tesla" });
    expect(parseLoose("what's happening today")).toEqual({ kind: "news", name: "" });
    expect(parseCommand("sell nvda")).toEqual({ kind: "sell", name: "nvda" });
    expect(parseCommand("sell all nvda")).toEqual({ kind: "sell", name: "nvda", percent: 100 });
    expect(parseCommand("sell half of my NVDA")).toEqual({ kind: "sell", name: "NVDA", percent: 50 });
    expect(parseCommand("sell 25% of nvda")).toEqual({ kind: "sell", name: "nvda", percent: 25 });
    expect(parseCommand("sell $5 of nvda")).toEqual({ kind: "sell", name: "nvda", usd: 5 });
    expect(parseCommand("sell 5 nvda")).toEqual({ kind: "sell", name: "nvda", usd: 5 });
    expect(parseCommand("sell")).toEqual({ kind: "sell", name: "" });
  });

  it("gives up on the rest", () => {
    expect(parseLoose("lol ok")).toEqual({ kind: "unknown" });
    expect(parseLoose("what's the weather in lagos")).toEqual({ kind: "unknown" });
  });

  it("treats a question about their own performance as a question", () => {
    expect(parseLoose("how did my baskets do this week")).toEqual({ kind: "question", text: "how did my baskets do this week" });
    expect(parseLoose("what's in ai kings")).toEqual({ kind: "price", basket: "ai kings" });
  });
});
