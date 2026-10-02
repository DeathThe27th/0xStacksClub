"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { useId } from "react";
import { CLOSE_MIN, OPEN_MIN, WALL_STREET_WEEK_HOURS } from "./clock";

/*
 * The week as a dial: 336 half-hour ticks, Monday 00:00 New York time at the top. Wall Street's
 * regular session lights up first in amber (32½ hours), then a violet sweep runs round the rest of
 * the week while the count climbs to 168.
 */

const TICKS = 7 * 48;
const C = 500;
const SESSION = { from: OPEN_MIN / 30, to: CLOSE_MIN / 30 }; // half-hour indexes within a day
const isSession = (i: number) => Math.floor(i / 48) < 5 && i % 48 >= SESSION.from && i % 48 < SESSION.to;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function polar(r: number, i: number) {
  const a = (i / TICKS) * 2 * Math.PI;
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
}

function ticks(filter: (i: number) => boolean) {
  let d = "";
  for (let i = 0; i < TICKS; i++) {
    if (!filter(i)) continue;
    const dayStart = i % 48 === 0;
    const [x1, y1] = polar(dayStart ? 392 : 418, i);
    const [x2, y2] = polar(dayStart ? 482 : 470, i);
    d += `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d;
}

const ALL = ticks(() => true);
const REST = ticks((i) => !isSession(i));
const WALL = ticks(isSession);

/** Pie slice from 12 o'clock, clockwise through `deg`. */
function pie(deg: number) {
  if (deg <= 0) return "M500,500Z";
  if (deg >= 359.9) return "M500,-40A540,540 0 1,1 499.9,-40Z";
  const a = (deg * Math.PI) / 180;
  return `M500,500L500,-40A540,540 0 ${deg > 180 ? 1 : 0},1 ${(C + 540 * Math.sin(a)).toFixed(1)},${(C - 540 * Math.cos(a)).toFixed(1)}Z`;
}

function hours(v: number) {
  const half = Math.round(v * 2) / 2;
  const whole = Math.floor(half);
  return half % 1 ? `${whole}½` : String(whole);
}

export function Week({ progress, still }: { progress: MotionValue<number>; still: boolean }) {
  const clip = `week-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ringIn = useTransform(progress, [0, 0.16], [0.15, 1]);
  const ringTurn = useTransform(progress, [0, 0.22], [-40, 0]);
  const wallIn = useTransform(progress, [0.12, 0.28], [0, 1]);
  const sweep = useTransform(progress, [0.38, 0.84], [0, 360]);
  const sweepPath = useTransform(sweep, pie);
  const count = useTransform(progress, [0.12, 0.28, 0.38, 0.84], [0, WALL_STREET_WEEK_HOURS, WALL_STREET_WEEK_HOURS, 168]);
  const countText = useTransform(count, hours);
  const labelA = useTransform(progress, [0.34, 0.4], [1, 0]);
  const labelB = useTransform(progress, [0.4, 0.46], [0, 1]);
  const dotX = useTransform(sweep, (d) => C + 444 * Math.sin((d * Math.PI) / 180));
  const dotY = useTransform(sweep, (d) => C - 444 * Math.cos((d * Math.PI) / 180));
  const dotOpacity = useTransform(progress, [0.37, 0.4, 0.82, 0.86], [0, 1, 1, 0]);

  return (
    <div className="relative mx-auto aspect-square w-[min(86vw,calc(56*var(--uvh)),620px)]">
      <motion.svg viewBox="-40 -40 1080 1080" className="absolute inset-0 h-full w-full overflow-visible" style={still ? undefined : { opacity: ringIn, rotate: ringTurn }} aria-hidden>
        <clipPath id={clip}>
          <motion.path d={still ? pie(360) : sweepPath} />
        </clipPath>
        <path d={ALL} className="stroke-text-dim/40" strokeWidth={5} strokeLinecap="round" />
        <path d={REST} clipPath={`url(#${clip})`} className="stroke-link" strokeWidth={6} strokeLinecap="round" />
        <motion.path d={WALL} style={still ? undefined : { opacity: wallIn }} className="stroke-warn" strokeWidth={6} strokeLinecap="round" />
        {DAYS.map((d, i) => {
          const [x, y] = polar(330, i * 48 + 24);
          return (
            <text key={d} x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-text-muted font-sans text-[30px] font-medium">
              {d}
            </text>
          );
        })}
        {!still && <motion.circle cx={dotX} cy={dotY} r={14} style={{ opacity: dotOpacity }} className="fill-link drop-shadow-[0_0_12px_rgb(var(--primary))]" />}
      </motion.svg>

      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="relative h-6 text-[15px] font-medium text-text-muted lg:text-[17px]">
            {!still && (
              <motion.p style={{ opacity: labelA }} className="absolute inset-0 whitespace-nowrap">
                Wall Street is open
              </motion.p>
            )}
            <motion.p style={still ? undefined : { opacity: labelB }} className="absolute inset-0 whitespace-nowrap">
              Onchain, it&apos;s
            </motion.p>
          </div>
          <p className="font-sans text-[clamp(72px,19vw,150px)] font-semibold leading-[0.95] tracking-[-0.04em] tnum">
            {still ? "168" : <motion.span>{countText}</motion.span>}
          </p>
          <p className="text-[15px] font-medium text-text-muted lg:text-[17px]">hours a week</p>
        </div>
      </div>
    </div>
  );
}

/** Legend for the dial. */
export function WeekKey() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-text-muted">
      <li className="flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-warn" />
        Wall Street, 9:30 to 4 New York time
      </li>
      <li className="flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-link" />
        Everything else
      </li>
    </ul>
  );
}
