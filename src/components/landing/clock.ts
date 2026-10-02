"use client";

import { useEffect, useState } from "react";

/*
 * NYSE regular session (9:30 to 16:00 New York time, Monday to Friday) for the landing page's
 * live clock and the week ring. Display only: trading itself reads each token's own market status.
 */

// Full-day closures and 13:00 early closes, from the NYSE holiday calendar.
const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);
const EARLY_CLOSE = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

export const OPEN_MIN = 9 * 60 + 30;
export const CLOSE_MIN = 16 * 60;
/** Regular-session hours in a normal week: 6.5 a day, five days. */
export const WALL_STREET_WEEK_HOURS = ((CLOSE_MIN - OPEN_MIN) / 60) * 5;

const ny = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function newYork(d: Date) {
  const p = Object.fromEntries(ny.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: p.weekday!, date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

export function nyseOpenAt(d: Date): boolean {
  const t = newYork(d);
  if (t.day === "Sat" || t.day === "Sun" || HOLIDAYS.has(t.date)) return false;
  return t.min >= OPEN_MIN && t.min < (EARLY_CLOSE.has(t.date) ? 13 * 60 : CLOSE_MIN);
}

const HALF_HOUR = 30 * 60_000;

/** Whether the session is open now, and when that next changes. Sessions start and end on half hours. */
export function nyseStatus(now: Date): { open: boolean; next: Date } {
  const open = nyseOpenAt(now);
  let t = Math.floor(now.getTime() / HALF_HOUR) * HALF_HOUR + HALF_HOUR;
  for (let i = 0; i < 24 * 2 * 10 && nyseOpenAt(new Date(t)) === open; i++) t += HALF_HOUR;
  return { open, next: new Date(t) };
}

/** The session or closure we're in: whether it's open, when it began and when it ends. */
export function nysePeriod(now: Date): { open: boolean; since: Date; next: Date } {
  const { open, next } = nyseStatus(now);
  let t = Math.floor(now.getTime() / HALF_HOUR) * HALF_HOUR;
  for (let i = 0; i < 24 * 2 * 10 && nyseOpenAt(new Date(t - HALF_HOUR)) === open; i++) t -= HALF_HOUR;
  return { open, since: new Date(t), next };
}

/** "6:28:14", or "64:04:11" over a weekend: total hours, minutes, seconds. */
export function clockCountdown(from: Date, to: Date): string {
  const s = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "2d 4h", "3h 20m", "12m". */
export function until(from: Date, to: Date): string {
  const m = Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m % 60}m` : `${m % 60}m`;
}

/** The current time, ticking. Null until mounted so the server and first client render agree. */
export function useNow(everyMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** "3:12" and "AM" in the visitor's own clock. */
export function localTime(d: Date): { hm: string; ampm: string } {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return { hm: `${get("hour")}:${get("minute")}`, ampm: get("dayPeriod").toUpperCase() };
}
