/* eslint-disable @next/next/no-img-element */
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, BatteryFull, Camera, Flashlight, Lock, Signal, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Change } from "@/components/ui/Change";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/constants";
import { price as fmtPrice } from "@/lib/format";
import { nyseStatus, until, useNow } from "./clock";
import type { LandingStock } from "./data";
import { LINKS, Phone, StartButton, type Start } from "./parts";

/*
 * Hero. The page's own header, then the promise beside a phone on its lock screen at 3:04: the
 * texting assistant's messages arrive one by one (a price, "Reply YES", a floating "yes", "Done"),
 * and a live NVDA card sits at the phone's edge. A tape of the real stock list runs underneath.
 * Plays once on load; with reduced motion it renders finished.
 *
 * Heights are in viewport units divided by --app-zoom (desktop renders at 80%), as --uvh.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero({ start, stocks, still }: { start: Start; stocks: { list: LandingStock[]; pick: (t: string, i: number) => LandingStock }; still: boolean }) {
  const now = useNow();
  const nvda = stocks.pick("NVDA", 0);
  return (
    <section id="top" aria-labelledby="hero-title" className="relative [--uvh:calc(1svh/var(--app-zoom))]">
      <header className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-gutter lg:h-20 lg:px-8">
        <a href="#top" aria-label={`${APP_NAME}, top of the page`} className="rounded-md text-text">
          <Wordmark size={26} />
        </a>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="grid h-10 place-items-center rounded-full px-4 text-[15px] font-medium text-text-muted transition-colors hover:bg-surface hover:text-text">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <StartButton start={start} small />
      </header>

      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-gutter pb-14 pt-8 lg:min-h-[calc(100*var(--uvh)-80px-72px)] lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:px-8 lg:pb-10 lg:pt-0">
        <motion.div
          initial={still ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="max-lg:text-center"
        >
          <NysePill now={now} />
          <h1
            id="hero-title"
            className="mt-6 font-display text-[clamp(50px,13.5vw,112px)] font-extrabold leading-[0.9] tracking-[-0.045em] [text-wrap:balance] max-lg:mx-auto max-lg:max-w-[9ch]"
          >
            Trade while Wall&nbsp;Street sleeps.
          </h1>
          <p className="mt-6 max-w-[34ch] text-[17px] leading-[1.45] text-text-muted max-lg:mx-auto lg:mt-8 lg:text-[21px]">
            Nvidia, Tesla, Apple and more as tokens on BNB Chain. Buy after the bell, sell on a Sunday, or just text it at 3am.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 max-lg:justify-center lg:mt-10">
            <StartButton start={start} />
            <a href="#text" className="group inline-flex h-14 items-center gap-2 rounded-full px-2 text-[17px] font-semibold text-text underline-offset-4 hover:underline">
              See it by text
              <ArrowDown size={18} strokeWidth={2.4} className="transition-transform group-hover:translate-y-0.5" aria-hidden />
            </a>
          </div>
        </motion.div>

        <LockScene nvda={nvda} still={still} />
      </div>

      <Tape stocks={stocks} still={still} />
    </section>
  );
}

function NysePill({ now }: { now: Date | null }) {
  const s = now ? nyseStatus(now) : null;
  return (
    <p className="inline-flex h-9 items-center gap-2.5 rounded-full border border-border bg-bg px-4 text-[14px] font-medium text-text-muted shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <span className="relative flex size-2">
        {s && !s.open && <span className="absolute inset-0 animate-ping rounded-full bg-warn/60" />}
        <span className={cn("relative size-2 rounded-full", !s ? "bg-text-dim" : s.open ? "bg-up" : "bg-warn")} />
      </span>
      {!s || !now ? (
        "NYSE"
      ) : (
        <span>
          <span className="text-text">{s.open ? "NYSE open" : "NYSE closed"}</span>
          {s.open ? ` · closes in ${until(now, s.next)}` : ` · opens in ${until(now, s.next)}`}
        </span>
      )}
    </p>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* The lock screen.                                                                           */

type Note = { id: string; text: string };

function LockScene({ nvda, still }: { nvda: LandingStock; still: boolean }) {
  const t = nvda.ticker;
  const notes: Note[] = [
    {
      id: "price",
      text:
        nvda.price !== null
          ? `${t} is at ${fmtPrice(nvda.price)}, ${nvda.change !== null && nvda.change < 0 ? "down" : "up"} ${Math.abs(nvda.change ?? 0).toFixed(2)}% in 24h.`
          : `Here's ${t}: the price, today's move and the latest news.`,
    },
    { id: "ask", text: `Buy $20 of ${t}? Fee $0.20. Reply YES to buy, or NO to cancel.` },
    { id: "done", text: `Done. Bought $20 of ${t}.` },
  ];

  // How far the exchange has got: notes shown, and whether the "yes" has gone out.
  const [step, setStep] = useState(still ? 4 : 0);
  useEffect(() => {
    if (still) {
      setStep(4);
      return;
    }
    const at = [900, 2100, 3300, 4300];
    const ids = at.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => ids.forEach(clearTimeout);
  }, [still]);
  const shown = notes.slice(0, step >= 4 ? 3 : Math.min(step, 2)).reverse();
  const replied = step >= 3;

  return (
    <motion.div
      aria-hidden
      initial={still ? false : { opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, ease: EASE, delay: 0.1 }}
      className="relative mx-auto"
    >
      <Phone className="h-[560px] lg:h-[min(calc(78*var(--uvh)),720px)]">
        <div className="relative flex h-full flex-col text-white">
          <img src="/landing/sky.webp" alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-[50%_65%]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/45" />

          <div className="relative flex items-center justify-end gap-1.5 px-6 pt-4 text-white">
            <Signal size={14} strokeWidth={2.6} />
            <Wifi size={14} strokeWidth={2.6} />
            <BatteryFull size={18} strokeWidth={2} />
          </div>

          <div className="relative mt-5 flex flex-col items-center">
            <Lock size={15} strokeWidth={2.6} className="text-white/90" />
            <LockDate />
            <p className="font-display text-[72px] lg:text-[80px] font-extrabold leading-[0.95] tracking-[-0.04em] [text-shadow:0_2px_24px_rgb(0_0_0/0.25)]">3:04</p>
          </div>

          <div className="relative mt-auto flex flex-col gap-2 px-2.5 pb-3">
            <AnimatePresence initial={false}>
              {shown.map((n, i) => (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: -18, scale: 0.94, filter: "blur(6px)" }}
                  animate={{ opacity: i > 1 ? 0.9 : 1, y: 0, scale: i > 1 ? 0.97 : 1, filter: "blur(0px)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <Notification text={n.text} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="relative flex items-center justify-between px-10 pb-3">
            <span className="grid size-11 place-items-center rounded-full bg-black/35 backdrop-blur-md">
              <Flashlight size={18} strokeWidth={2.2} />
            </span>
            <span className="grid size-11 place-items-center rounded-full bg-black/35 backdrop-blur-md">
              <Camera size={18} strokeWidth={2.2} />
            </span>
          </div>
          <span className="relative mx-auto mb-2 h-[5px] w-[38%] rounded-full bg-white/90" />
        </div>
      </Phone>

      {/* The reply, floating off the phone's left edge */}
      <AnimatePresence>
        {replied && (
          <motion.div
            initial={still ? false : { opacity: 0, scale: 0.6, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="absolute -left-12 top-[44%] origin-bottom-right sm:-left-20"
          >
            <p className="relative rounded-[20px] rounded-br-[6px] bg-[#0A84FF] px-4 py-2 text-[17px] font-medium text-white shadow-[0_12px_30px_-10px_rgb(10_132_255/0.6)]">yes</p>
            <p className="mt-1 text-right text-[11px] font-medium text-text-muted max-sm:hidden">Read 3:04 AM</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The stock, live, at the phone's right edge */}
      <motion.div
        initial={still ? false : { opacity: 0, y: 24, rotate: 0 }}
        animate={{ opacity: 1, y: 0, rotate: 4 }}
        transition={{ duration: 1, ease: EASE, delay: 0.5 }}
        className="absolute -right-24 top-[34%] w-[210px] max-sm:hidden rounded-[20px] border border-border bg-bg p-4 shadow-[0_2px_4px_rgb(0_0_0/0.04),0_20px_40px_-16px_rgb(0_0_0/0.22)]"
      >
        <div className="flex items-center gap-3">
          <TokenLogo src={nvda.logo} label={nvda.ticker} size={36} />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight text-text">{nvda.ticker}</p>
            <p className="truncate text-[12px] leading-tight text-text-muted">{nvda.name}</p>
          </div>
        </div>
        {nvda.price !== null ? (
          <p className="mt-3 flex items-baseline justify-between gap-2">
            <span className="tnum text-[22px] font-semibold tracking-[-0.02em] text-text">{fmtPrice(nvda.price)}</span>
            <Change value={nvda.change} />
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-text-muted">Onchain, any hour</p>
        )}
      </motion.div>
    </motion.div>
  );
}

function LockDate() {
  const [label, setLabel] = useState(" ");
  useEffect(() => setLabel(new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date())), []);
  return <p className="mt-2 text-[17px] font-semibold leading-tight text-white/90">{label}</p>;
}

function Notification({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5 rounded-[22px] bg-white/70 p-3 text-black shadow-[0_8px_24px_-12px_rgb(0_0_0/0.4)] backdrop-blur-xl backdrop-saturate-150">
      <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-[#6C47FF]">
        <Wordmark size={11} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2 text-[14px] font-semibold leading-tight">
          {APP_NAME}
          <span className="text-[12px] font-normal text-black/50">now</span>
        </p>
        <p className="mt-0.5 text-[14px] leading-[1.3] text-black/85">{text}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* The tape: the real list, running.                                                          */

const TAPE_FALLBACK = ["NVDA", "TSLA", "AAPL", "SPY", "META", "MSFT", "AMZN", "GOOGL", "QQQ", "COIN"];

function Tape({ stocks, still }: { stocks: { list: LandingStock[]; pick: (t: string, i: number) => LandingStock }; still: boolean }) {
  const rows = stocks.list.length ? stocks.list : TAPE_FALLBACK.map((t, i) => stocks.pick(t, i));
  return (
    <div className="group relative h-[72px] overflow-hidden border-y border-border bg-surface/60 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
      <div className={cn("flex h-full w-max", !still && "animate-marquee group-hover:[animation-play-state:paused]")}>
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1} aria-label={copy === 0 ? "Stocks on " + APP_NAME : undefined} className="flex h-full shrink-0 items-center">
            {rows.map((s) => (
              <li key={s.ticker} className="flex items-center gap-2.5 px-7">
                <TokenLogo src={s.logo} label={s.ticker} size={26} />
                <span className="text-[15px] font-semibold text-text">{s.ticker}</span>
                {s.price !== null ? (
                  <>
                    <span className="tnum text-[15px] text-text-muted">{fmtPrice(s.price)}</span>
                    <Change value={s.change} />
                  </>
                ) : (
                  <span className="text-[15px] text-text-muted">{s.name}</span>
                )}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
