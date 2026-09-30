import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createQuota } from "./quota.js";

const dir = mkdtempSync(join(tmpdir(), "quota-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("createQuota", () => {
  it("stops at the limit, survives a restart and resets the next day", () => {
    const file = join(dir, "q.json");
    let day = new Date("2026-09-30T10:00:00Z");
    const q = createQuota(2, file, () => day);
    expect(q.take()).toBe(true);
    expect(q.take()).toBe(true);
    expect(q.take()).toBe(false);
    expect(createQuota(2, file, () => day).take()).toBe(false);
    day = new Date("2026-10-01T00:00:01Z");
    expect(q.take()).toBe(true);
    expect(q.sent()).toBe(1);
  });
});
