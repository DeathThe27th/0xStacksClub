import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Counts outbound messages per UTC day and refuses past the limit. Photon allows 5,000 a day per
 * server and treats that as a hard line, so we stop short of it. The count is kept in a small file
 * so a pm2 restart doesn't reset it.
 */
export function createQuota(limit: number, file: string, now: () => Date = () => new Date()) {
  const today = () => now().toISOString().slice(0, 10);
  let state = { day: today(), sent: 0 };
  try {
    const saved = JSON.parse(readFileSync(file, "utf8")) as { day?: unknown; sent?: unknown };
    if (saved.day === state.day && typeof saved.sent === "number") state.sent = saved.sent;
  } catch {
    // First run, or an unreadable file: start from zero.
  }

  function roll() {
    if (state.day !== today()) state = { day: today(), sent: 0 };
  }

  return {
    /** True if one more message may go out, and counts it. */
    take(): boolean {
      roll();
      if (state.sent >= limit) return false;
      state.sent++;
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(state));
      } catch {
        // Losing the file only loses the count across restarts.
      }
      return true;
    },
    sent(): number {
      roll();
      return state.sent;
    },
  };
}
