import { stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import { parseTypedDataToSign } from "./typed-data";

const sample = {
  types: { EIP712Domain: [{ name: "name", type: "string" }], Order: [{ name: "maker", type: "address" }] },
  primaryType: "Order",
  domain: { name: "X", chainId: 56 },
  message: { maker: "0x0000000000000000000000000000000000000001" },
};

describe("parseTypedDataToSign", () => {
  it("accepts a JSON string", () => {
    expect(parseTypedDataToSign(JSON.stringify(sample)).primaryType).toBe("Order");
  });
  it("accepts hex-encoded JSON", () => {
    expect(parseTypedDataToSign(stringToHex(JSON.stringify(sample))).domain.chainId).toBe(56);
  });
  it("rejects other shapes loudly", () => {
    expect(() => parseTypedDataToSign("0xdeadbeef")).toThrow();
    expect(() => parseTypedDataToSign(JSON.stringify({ foo: 1 }))).toThrow(/EIP-712/);
  });
});
