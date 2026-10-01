/* eslint-disable @next/next/no-img-element */
"use client";

// Scatter mechanism adapted from Hyperiux Vault's "stack-spread" (https://vault.hyperiux.com).

import { motion, useMotionValue, useMotionValueEvent, useSpring, useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Change } from "@/components/ui/Change";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/client/media";
import { APP_NAME } from "@/lib/constants";
import { price as fmtPrice } from "@/lib/format";
import { localTime, nyseStatus, until, useNow } from "./clock";
import { useScrollProgress } from "./scroll";
import type { LandingStock } from "./data";

/*
 * Hero. A fanned pile of night photos and app cards sits on a poster-size wordmark. Scrolling
 * scatters the pile to the edges, the wordmark swells away and the headline comes up in the
 * clearing. Once spread, the cards drift against the pointer at depths set by their stack order.
 *
 * Positions are in viewport units divided by --app-zoom (desktop renders at 80%, and zoom scales
 * viewport units too), carried as --uvw and --uvh on the section.
 */

type Spot = { x: number; y: number; r: number; w: number; h: number };
type HeroCard = {
  id: string;
  /** Offset and angle while piled up. */
  pile: { x: number; y: number; r: number };
  desk: Spot;
  /** Phones and tablets; no spot means the card sits out on small screens. */
  phone?: Spot;
};

// Array order is paint order, back to front.
const CARDS: HeroCard[] = [
  { id: "sky", pile: { x: -7, y: -9, r: -16 }, desk: { x: -36, y: -27, r: -3, w: 15, h: 27 }, phone: { x: -27, y: -39, r: -4, w: 38, h: 17 } },
  { id: "city", pile: { x: 12, y: -8, r: 17 }, desk: { x: 36, y: 21, r: 3, w: 19, h: 29 } },
  { id: "moon", pile: { x: -14, y: 1, r: -5 }, desk: { x: 14, y: -34, r: 4, w: 13, h: 21 }, phone: { x: 28, y: -40, r: 5, w: 32, h: 15 } },
  { id: "street", pile: { x: 14, y: 2, r: 7 }, desk: { x: -37, y: 18, r: -2, w: 15, h: 33 }, phone: { x: 30, y: 36, r: 3, w: 30, h: 20 } },
  { id: "chat", pile: { x: 2, y: -9, r: -3 }, desk: { x: 36, y: -21, r: 2, w: 17, h: 29 } },
  { id: "clock", pile: { x: -5, y: 9, r: 5 }, desk: { x: -13, y: 34, r: -2, w: 18, h: 19 }, phone: { x: -20, y: 29, r: 2, w: 52, h: 12 } },
  { id: "nvda", pile: { x: 7, y: 6, r: 3 }, desk: { x: -14, y: -32, r: -3, w: 17, h: 15 }, phone: { x: 2, y: -31, r: -2, w: 46, h: 10 } },
  { id: "tsla", pile: { x: 16, y: 11, r: -7 }, desk: { x: 13, y: 37, r: 3, w: 17, h: 15 }, phone: { x: -20, y: 40, r: -2, w: 44, h: 10 } },
];

const PHOTOS: Record<string, { src: string; alt: string }> = {
  sky: { src: "/landing/sky.webp", alt: "" },
  city: { src: "/landing/city.webp", alt: "" },
  moon: { src: "/landing/moon.webp", alt: "" },
  street: { src: "/landing/street.webp", alt: "" },
};

// Scroll progress where the pile starts to scatter and where it lands.
const SCATTER_START = 0.08;
const SCATTER_END = 0.78;
const PILE_SCALE = 0.8;

const PARALLAX = { x: 2.6, y: 2.2 };
const PARALLAX_SPRING = { stiffness: 90, damping: 22, mass: 0.6 };
const depth = (i: number) => 0.55 + (i / (CARDS.length - 1)) * 0.75;

export function StackSpread({ nvda, tsla, still, action }: { nvda: LandingStock; tsla: LandingStock; still: boolean; action: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const desk = useIsDesktop();
  const scroll = useScrollProgress(ref);
  const finished = useMotionValue(1);
  const p = useTransform(scroll, [0, SCATTER_START, SCATTER_END, 1], [0, 0, 1, 1]);
  const progress = still ? finished : p;

  const [spread, setSpread] = useState(still);
  useMotionValueEvent(p, "change", (v) => setSpread((was) => (was ? v > 0.97 : v >= 0.995)));
  const pointer = usePointerParallax(desk && !still && spread);

  // Wordmark swells and goes; headline comes up in the clearing.
  const markScale = useTransform(progress, [0, 0.55], [1, 1.5]);
  const markOpacity = useTransform(progress, [0, 0.4], [1, 0]);
  const copyOpacity = useTransform(progress, [0.5, 0.85], [0, 1]);
  const copyScale = useTransform(progress, [0.5, 0.95], [0.88, 1]);
  const copyEvents = useTransform(copyOpacity, (o) => (o > 0.6 ? "auto" : "none"));
  const introOpacity = useTransform(progress, [0, 0.12], [1, 0]);

  const now = useNow();

  return (
    <section
      ref={ref}
      aria-labelledby="hero-title"
      className="theme-night relative bg-bg text-text [--uvh:calc(1svh/var(--app-zoom))] [--uvw:calc(1vw/var(--app-zoom))]"
      style={{ height: still ? "calc(100 * var(--uvh))" : "calc(270 * var(--uvh))" }}
    >
      <div className="sticky top-0 h-[calc(100*var(--uvh))] w-full overflow-hidden">
        <NightGlow />

        {/* Poster wordmark behind the pile */}
        <motion.div
          aria-hidden
          style={{ scale: markScale, opacity: markOpacity }}
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <Wordmark size={desk ? "calc(40 * var(--uvw))" : "calc(52 * var(--uvw))"} className="text-link" />
        </motion.div>

        {/* Headline */}
        <motion.div
          style={{ opacity: copyOpacity, scale: copyScale, pointerEvents: copyEvents }}
          className="absolute inset-0 z-[5] flex flex-col items-center justify-center px-gutter text-center"
        >
          <NysePill now={now} />
          <h1
            id="hero-title"
            className="mt-5 max-w-[11ch] font-display text-[clamp(46px,12.5vw,128px)] font-extrabold leading-[0.9] tracking-[-0.045em] [text-wrap:balance] lg:max-w-[13ch]"
          >
            Trade while Wall&nbsp;Street sleeps.
          </h1>
          <p className="mx-auto mt-5 max-w-[32ch] text-[16px] leading-snug text-text-muted lg:mt-6 lg:max-w-[38ch] lg:text-[20px]">
            Nvidia, Tesla, Apple and more as tokens on BNB Chain. Buy after the bell, sell on a Sunday, or just text it at 3am.
          </p>
          <div className="mt-7 lg:mt-9">{action}</div>
        </motion.div>

        {/* The pile */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
          {CARDS.map((c, i) => {
            const spot = desk ? c.desk : c.phone;
            if (!spot) return null;
            return (
              <Card key={c.id} card={c} spot={spot} progress={progress} still={still} pointer={pointer} depth={desk && !still ? depth(i) : 0} z={i + 1}>
                {c.id in PHOTOS ? (
                  <img src={PHOTOS[c.id]!.src} alt={PHOTOS[c.id]!.alt} draggable={false} className="h-full w-full object-cover" />
                ) : c.id === "chat" ? (
                  <ChatFace ticker={nvda.ticker} />
                ) : c.id === "clock" ? (
                  <ClockFace now={now} />
                ) : (
                  <StockFace s={c.id === "nvda" ? nvda : tsla} />
                )}
              </Card>
            );
          })}
        </div>

        {/* First frame: where you are in the night, and a nudge to scroll */}
        {!still && (
          <>
            <motion.p style={{ opacity: introOpacity }} className="pointer-events-none absolute inset-x-0 top-[calc(5*var(--uvh))] z-20 px-gutter text-center text-[15px] font-medium text-text-muted lg:text-[17px]">
              {now ? <IntroLine now={now} /> : " "}
            </motion.p>
            <motion.div
              style={{ opacity: introOpacity }}
              className="pointer-events-none absolute inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted"
            >
              <span>Scroll</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="animate-bounce" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </motion.div>
          </>
        )}
      </div>
      {/* Dawn: the night fades into the page's own background (invisible in dark themes). */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full z-[1] h-[calc(50*var(--uvh))] bg-gradient-to-b from-black via-[rgb(108_71_255/0.22)] to-transparent" />
    </section>
  );
}

function usePointerParallax(active: boolean) {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, PARALLAX_SPRING);
  const y = useSpring(rawY, PARALLAX_SPRING);
  useEffect(() => {
    if (!active) {
      rawX.set(0);
      rawY.set(0);
      return;
    }
    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onLeave = () => {
      rawX.set(0);
      rawY.set(0);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [active, rawX, rawY]);
  return { x, y };
}

function Card({
  card,
  spot,
  progress,
  still,
  pointer,
  depth,
  z,
  children,
}: {
  card: HeroCard;
  spot: Spot;
  progress: MotionValue<number>;
  still: boolean;
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
  depth: number;
  z: number;
  children: React.ReactNode;
}) {
  const { pile } = card;
  const x = useTransform([progress, pointer.x], ([p, px]: number[]) => `calc(${pile.x + (spot.x - pile.x) * p! - px! * PARALLAX.x * depth * p!} * var(--uvw))`);
  const y = useTransform([progress, pointer.y], ([p, py]: number[]) => `calc(${pile.y + (spot.y - pile.y) * p! - py! * PARALLAX.y * depth * p!} * var(--uvh))`);
  const rotate = useTransform(progress, [0, 1], [still ? spot.r : pile.r, spot.r]);
  const scale = useTransform(progress, [0, 1], [PILE_SCALE, 1]);
  return (
    <motion.div className="absolute left-1/2 top-1/2 will-change-transform" style={{ x, y, rotate, scale, zIndex: z }}>
      <div
        className="-translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[18px] shadow-[0_30px_60px_-24px_rgb(0_0_0/0.7)] ring-1 ring-white/10 lg:rounded-[22px]"
        style={{ width: `calc(${spot.w} * var(--uvw))`, height: `calc(${spot.h} * var(--uvh))` }}
      >
        {children}
      </div>
    </motion.div>
  );
}

/** A faint violet dusk behind everything, with a few slow stars. */
function NightGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-[-20%] bottom-[-35%] h-[80%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(var(--primary)/0.28),transparent)] blur-2xl" />
      {STARS.map(([l, t, d], i) => (
        <span key={i} className="absolute size-[2px] animate-live-dot rounded-full bg-text/60" style={{ left: `${l}%`, top: `${t}%`, animationDelay: `${d}s`, animationDuration: `${2.4 + d}s` }} />
      ))}
    </div>
  );
}

const STARS: [number, number, number][] = [
  [8, 12, 0.2], [22, 6, 1.1], [41, 15, 0.6], [57, 8, 1.6], [73, 13, 0.3], [91, 7, 1.2],
  [5, 52, 0.9], [96, 46, 0.4], [14, 88, 1.4], [86, 84, 0.7], [49, 93, 1.9], [65, 58, 1.0],
];

function StockFace({ s }: { s: LandingStock }) {
  return (
    <div className="flex h-full w-full items-center gap-3 bg-surface px-3.5 lg:flex-col lg:items-start lg:justify-between lg:p-[calc(1.5*var(--uvh))]">
      <TokenLogo src={s.logo} label={s.ticker} size={34} />
      <div className="min-w-0 flex-1 lg:flex-none">
        <p className="text-[15px] font-semibold leading-tight text-text lg:text-[18px]">{s.ticker}</p>
        {s.price !== null ? (
          <p className="flex items-center gap-2 text-[13px] leading-5 text-text lg:text-[15px]">
            <span className="tnum">{fmtPrice(s.price)}</span>
            <Change value={s.change} />
          </p>
        ) : (
          <p className="truncate text-[13px] leading-5 text-text-muted lg:text-[14px]">{s.name}</p>
        )}
      </div>
    </div>
  );
}

/** The visitor's own clock, and whether Wall Street is up. */
function ClockFace({ now }: { now: Date | null }) {
  const t = now ? localTime(now) : null;
  const s = now ? nyseStatus(now) : null;
  return (
    <div className="flex h-full w-full items-center justify-between gap-3 bg-[#0B0B10] px-4 text-white lg:flex-col lg:items-start lg:justify-between lg:p-[calc(1.8*var(--uvh))]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50 max-lg:hidden">Your time</p>
      <p className="font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] lg:text-[clamp(36px,4.2vw,64px)]">
        {t ? t.hm : "–:––"}
        <span className="ml-1 text-[0.42em] tracking-normal text-white/60">{t?.ampm}</span>
      </p>
      <p className="flex items-center gap-1.5 whitespace-nowrap text-[12px] leading-tight text-white/70 lg:text-[13px]">
        <span className={cn("size-1.5 shrink-0 rounded-full", s?.open ? "bg-up" : "bg-warn")} />
        {s ? (s.open ? "NYSE open" : "NYSE closed") : "NYSE"}
      </p>
    </div>
  );
}

/** A late-night text exchange. Messages' own colours in every theme. */
function ChatFace({ ticker }: { ticker: string }) {
  const lines: { out?: boolean; text: string }[] = [
    { out: true, text: `buy $20 of ${ticker.toLowerCase()}` },
    { text: `Buy $20 of ${ticker}? Reply YES to buy.` },
    { out: true, text: "yes" },
    { text: `Done. Bought $20 of ${ticker}.` },
  ];
  return (
    <div className="flex h-full w-full flex-col justify-end gap-1.5 bg-black p-3 text-white">
      <p className="mb-auto text-center text-[11px] text-white/45">
        {APP_NAME} · Today 3:04 AM
      </p>
      {lines.map((l, i) => (
        <p
          key={i}
          className={cn(
            "w-fit max-w-[88%] rounded-[16px] px-2.5 py-1.5 text-[13px] leading-[1.25]",
            l.out ? "self-end rounded-br-[5px] bg-[#0A84FF]" : "rounded-bl-[5px] bg-[#26262A]",
          )}
        >
          {l.text}
        </p>
      ))}
    </div>
  );
}

function IntroLine({ now }: { now: Date }) {
  const t = localTime(now);
  const s = nyseStatus(now);
  return (
    <>
      It&apos;s {t.hm} {t.ampm} where you are.{" "}
      <span className="text-text">{s.open ? "Wall Street is up." : "Wall Street is asleep."}</span>
    </>
  );
}

function NysePill({ now }: { now: Date | null }) {
  const s = now ? nyseStatus(now) : null;
  return (
    <p className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-surface/80 px-3.5 text-[13px] font-medium text-text-muted backdrop-blur">
      <span className={cn("size-2 rounded-full", !s ? "bg-text-dim" : s.open ? "bg-up" : "animate-live-dot bg-warn")} />
      {!s || !now ? "NYSE" : s.open ? `NYSE open · closes in ${until(now, s.next)}` : `NYSE closed · opens in ${until(now, s.next)}`}
    </p>
  );
}
