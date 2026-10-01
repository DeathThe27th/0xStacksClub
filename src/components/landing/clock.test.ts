import { describe, expect, it } from "vitest";
import { nyseOpenAt, nyseStatus, until, WALL_STREET_WEEK_HOURS } from "./clock";

// Thursday 2026-10-01. New York is on EDT (UTC-4).
const at = (iso: string) => new Date(iso);

describe("NYSE session", () => {
  it("is open from 9:30 to 16:00 New York time on a weekday", () => {
    expect(nyseOpenAt(at("2026-10-01T13:29:00Z"))).toBe(false);
    expect(nyseOpenAt(at("2026-10-01T13:30:00Z"))).toBe(true);
    expect(nyseOpenAt(at("2026-10-01T19:59:00Z"))).toBe(true);
    expect(nyseOpenAt(at("2026-10-01T20:00:00Z"))).toBe(false);
  });

  it("is closed on weekends, holidays, and after 13:00 on early-close days", () => {
    expect(nyseOpenAt(at("2026-10-03T15:00:00Z"))).toBe(false); // Saturday
    expect(nyseOpenAt(at("2026-11-26T15:00:00Z"))).toBe(false); // Thanksgiving (EST, UTC-5)
    expect(nyseOpenAt(at("2026-11-27T17:59:00Z"))).toBe(true);
    expect(nyseOpenAt(at("2026-11-27T18:00:00Z"))).toBe(false);
  });

  it("finds the next open across a weekend", () => {
    const s = nyseStatus(at("2026-10-02T21:00:00Z")); // Friday 17:00
    expect(s.open).toBe(false);
    expect(s.next.toISOString()).toBe("2026-10-05T13:30:00.000Z");
    expect(until(at("2026-10-02T21:00:00Z"), s.next)).toBe("2d 16h");
  });

  it("finds the close while open", () => {
    const s = nyseStatus(at("2026-10-01T18:10:00Z"));
    expect(s).toEqual({ open: true, next: at("2026-10-01T20:00:00Z") });
    expect(until(at("2026-10-01T18:10:00Z"), s.next)).toBe("1h 50m");
  });

  it("counts 32.5 regular hours a week", () => {
    expect(WALL_STREET_WEEK_HOURS).toBe(32.5);
  });
});
