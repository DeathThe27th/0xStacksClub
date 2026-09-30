import { maskPhonesIn } from "./mask.js";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;
let min: Level = "info";

export function setLogLevel(l: Level) {
  min = l;
}

/**
 * One line per event on stderr (the terminal provider owns stdout). Every string is passed through
 * the phone mask, so a number that slips into an error message still can't be logged in full.
 */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (LEVELS[level] < LEVELS[min]) return;
  const extra = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  process.stderr.write(maskPhonesIn(`${new Date().toISOString()} ${level.toUpperCase()} ${msg}${extra ? ` ${extra}` : ""}`) + "\n");
}
