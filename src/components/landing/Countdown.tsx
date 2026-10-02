"use client";

import { cn } from "@/lib/cn";
import { clockCountdown, nysePeriod } from "./clock";

/*
 * Wall Street's clock as a ring of 60 ticks. The lit arc is what's left of the current closure
 * (violet: 3AM's hours) or session (green), draining clockwise from 12 o'clock as the seconds
 * tick down in the middle.
 */

const N = 60;
const C = 200;

function polar(r: number, i: number) {
  const a = (i / N) * 2 * Math.PI;
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
}

const TICKS = Array.from({ length: N }, (_, i) => {
  const major = i % 5 === 0;
  const [x1, y1] = polar(major ? 160 : 168, i);
  const [x2, y2] = polar(188, i);
  return { x1, y1, x2, y2, major };
});

const nextFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export function NyseCountdown({ now, className }: { now: Date | null; className?: string }) {
  const p = now ? nysePeriod(now) : null;
  const left = p && now ? (p.next.getTime() - now.getTime()) / (p.next.getTime() - p.since.getTime()) : 1;
  // Ticks still to run, counted back from 12 o'clock so the arc drains clockwise.
  const lit = Math.ceil(Math.max(0, Math.min(1, left)) * N);
  const [dx, dy] = polar(200, N - left * N);
  return (
    <div
      role="timer"
      aria-label={p && now ? `NYSE ${p.open ? "closes" : "opens"} in ${clockCountdown(now, p.next)}` : "NYSE status"}
      className={cn("relative aspect-square [container-type:inline-size]", className)}
    >
      <svg viewBox="-10 -10 420 420" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {TICKS.map((t, i) => {
          const on = i >= N - lit || (i === 0 && lit > 0);
          return (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              strokeWidth={t.major ? 6 : 4}
              strokeLinecap="round"
              className={cn("transition-colors duration-700", on ? (p?.open ? "stroke-up" : "stroke-primary") : "stroke-white/80")}
            />
          );
        })}
        {p && <circle cx={dx} cy={dy} r={9} className={cn(p.open ? "fill-up" : "fill-primary")} />}
      </svg>

      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="flex items-center justify-center gap-2 text-[max(14px,4.4cqw)] font-medium text-text/70">
            <span className={cn("size-2 rounded-full", !p ? "bg-text-dim" : p.open ? "bg-up" : "animate-live-dot bg-primary")} />
            {!p ? "NYSE" : p.open ? "NYSE closes in" : "NYSE opens in"}
          </p>
          <p className="tnum mt-2 font-sans text-[17cqw] font-semibold leading-none tracking-[-0.04em] text-text">
            {p && now ? clockCountdown(now, p.next) : "–:––:––"}
          </p>
          <p className="mt-3 text-[max(13px,3.8cqw)] text-text/70">{p ? `${nextFmt.format(p.next)} your time` : " "}</p>
        </div>
      </div>
    </div>
  );
}
