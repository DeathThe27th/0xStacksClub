import { describe, expect, it } from "vitest";
import { maskPhone, maskPhonesIn, normalizePhone, smsLink } from "./phone";

describe("normalizePhone", () => {
  it("accepts E.164 with common separators", () => {
    expect(normalizePhone("+2348012344321")).toBe("+2348012344321");
    expect(normalizePhone(" +1 (415) 555-0132 ")).toBe("+14155550132");
    expect(normalizePhone("+44 20.7946.0958")).toBe("+442079460958");
  });

  it("rejects numbers without a country code and junk", () => {
    for (const bad of ["", "08012344321", "4155550132", "+0123456789", "+12", "+1415555013299999999", "+1415abc0132", "sms:+14155550132"]) {
      expect(normalizePhone(bad), bad).toBeNull();
    }
  });
});

describe("maskPhone", () => {
  it("keeps the first four and last four characters", () => {
    expect(maskPhone("+2348012344321")).toBe("+234******4321");
    expect(maskPhone("+14155550132")).toBe("+141****0132");
  });

  it("hides short numbers completely", () => {
    expect(maskPhone("+1234567")).toBe("********");
  });

  it("masks numbers inside a message", () => {
    expect(maskPhonesIn("user +2348012344321 already exists")).toBe("user +234******4321 already exists");
  });
});

describe("smsLink", () => {
  it("pre-fills the body", () => {
    expect(smsLink("+14155550132", "link 123456")).toBe("sms:+14155550132&body=link%20123456");
  });
});
