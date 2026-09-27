import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildQuery, preHash, requestPath, signPreHash, signedHeaders } from "./sign";

describe("Binance request signing (docs/binance-notes.md §2)", () => {
  it("builds the pre-hash exactly as the auth doc's GET example", () => {
    const path = requestPath("/api/v1/dex/market/price", { chainId: 1, symbol: "ETH USDT" });
    expect(path).toBe("/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT");
    expect(preHash("2026-05-11T10:08:57.715Z", "get", path, "")).toBe(
      "2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT",
    );
  });

  it("puts /build in the signed path and includes the raw POST body", () => {
    const body = JSON.stringify({ requestId: "abc", vendor: "PcsXRfq" });
    const pre = preHash("2026-05-11T10:08:57.715Z", "POST", requestPath("/api/v1/dex/aggregator/order/submit"), body);
    expect(pre).toBe(`2026-05-11T10:08:57.715ZPOST/build/api/v1/dex/aggregator/order/submit${body}`);
  });

  it("signs with Base64(HMAC-SHA256) matching Node's reference implementation", () => {
    const pre = "2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT";
    const expected = createHmac("sha256", "test-secret").update(pre, "utf8").digest("base64");
    expect(signPreHash("test-secret", pre)).toBe(expected);
    expect(expected).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("keeps query insertion order and drops undefined values", () => {
    expect(buildQuery({ b: "2", a: 1, skip: undefined, c: "x/y" })).toBe("b=2&a=1&c=x%2Fy");
  });

  it("rejects paths without the /api prefix, so /build is never doubled", () => {
    expect(() => requestPath("/build/api/v1/x")).toThrow();
  });

  it("emits the three required headers with an ISO millisecond timestamp", () => {
    const h = signedHeaders({
      apiKey: "k",
      secret: "s",
      method: "GET",
      signedPath: "/build/api/v1/dex/market/rwa/platforms",
      body: "",
      now: new Date("2026-05-11T10:08:57.715Z"),
    });
    expect(h["X-OC-TIMESTAMP"]).toBe("2026-05-11T10:08:57.715Z");
    expect(h["X-OC-APIKEY"]).toBe("k");
    expect(h["X-OC-SIGN"]).toBe(
      signPreHash("s", "2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/rwa/platforms"),
    );
  });
});
