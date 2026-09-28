import { describe, expect, it } from "vitest";
import { normalizeTelegramUrl } from "./telegram";

describe("normalizeTelegramUrl", () => {
  it("accepts public groups and invite links", () => {
    expect(normalizeTelegramUrl("https://t.me/stocks_club")).toBe("https://t.me/stocks_club");
    expect(normalizeTelegramUrl("t.me/stocks_club")).toBe("https://t.me/stocks_club");
    expect(normalizeTelegramUrl("http://telegram.me/stocks_club/")).toBe("https://t.me/stocks_club");
    expect(normalizeTelegramUrl("https://t.me/+AbCdEf123_-x")).toBe("https://t.me/+AbCdEf123_-x");
    expect(normalizeTelegramUrl("https://telegram.me/joinchat/AbCdEf123456")).toBe("https://t.me/+AbCdEf123456");
    expect(normalizeTelegramUrl("  https://www.t.me/stocks_club  ")).toBe("https://t.me/stocks_club");
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      "https://t.me.evil.com/group",
      "https://evil.com/t.me/group",
      "https://telegram.org/group",
      "https://t.me/ab",
      "https://t.me/+short",
      "https://t.me/group?start=x",
      "https://t.me/group#x",
      "https://user@t.me/group",
      "javascript:alert(1)",
      "ftp://t.me/group",
      "https://t.me/a/b/c",
      "https://t.me/1group",
    ]) {
      expect(normalizeTelegramUrl(bad), bad).toBeNull();
    }
  });
});
