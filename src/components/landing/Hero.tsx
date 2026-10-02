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
import { useNow } from "./clock";
import { NyseCountdown } from "./Countdown";
import type { LandingStock } from "./data";
import { LINKS, Phone, StartButton, type Start } from "./parts";

/*
 * Hero. The page's own header, the promise centred, then a stage across the full width: Wall
 * Street's clock as a ticking ring on the left, a phone on its lock screen at 3:04 in the middle
 * where the texting assistant's messages arrive one by one (a price, "Reply YES", a "yes" going
 * out, "Done"), and the stocks moving most right now on the right. A tape of the real stock list
 * runs underneath. Plays once on load; with reduced motion it renders finished.
 *
 * Heights are in viewport units divided by --app-zoom (desktop renders at 80%), as --uvh.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

type Stocks = { list: LandingStock[]; pick: (t: string, i: number) => LandingStock };

export function Hero({ start, stocks, still }: { start: Start; stocks: Stocks; still: boolean }) {
  const now = useNow();
  const rise = (delay: number) =>
    still ? {} : { initial: { opacity: 0, y: 32 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1, ease: EASE, delay } };
  return (
    <section id="top" aria-labelledby="hero-title" className="relative [--uvh:calc(1svh/var(--app-zoom))]">
      <header className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-gutter lg:h-20 lg:px-8">
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

      <motion.div {...rise(0)} className="mx-auto max-w-[1320px] px-gutter pt-10 text-center lg:px-8 lg:pt-14">
        <h1 id="hero-title" className="mx-auto max-w-[12ch] text-[clamp(46px,10.5vw,112px)] font-semibold leading-[0.95] tracking-[-0.04em] [text-wrap:balance] lg:max-w-[18ch]">
          Trade while Wall&nbsp;Street sleeps.
        </h1>
        <p className="mx-auto mt-6 max-w-[44ch] text-[17px] leading-[1.45] text-text-muted lg:text-[20px]">
          Nvidia, Tesla, Apple and more as tokens on BNB Chain. Buy after the bell, sell on a Sunday, or just text it at 3am.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <StartButton start={start} />
          <a href="#text" className="group inline-flex h-14 items-center gap-2 rounded-full px-2 text-[17px] font-semibold text-text underline-offset-4 hover:underline">
            See it by text
            <ArrowDown size={18} strokeWidth={2.4} className="transition-transform group-hover:translate-y-0.5" aria-hidden />
          </a>
        </div>
      </motion.div>

      <div className="mx-auto grid max-w-[1320px] items-center gap-12 px-gutter pb-16 pt-14 lg:grid-cols-[1fr_auto_1fr] lg:gap-10 lg:px-8 lg:pb-20 lg:pt-16">
        <motion.div {...rise(0.25)} className="mx-auto w-[min(68vw,260px)] lg:w-[min(100%,360px)]">
          <NyseCountdown now={now} />
          <p className="mx-auto mt-5 max-w-[26ch] text-center text-[15px] leading-snug text-text-muted">
            Wall Street keeps banker&apos;s hours. On {APP_NAME} the stocks don&apos;t stop.
          </p>
        </motion.div>

        <LockScene nvda={stocks.pick("NVDA", 0)} still={still} />

        <motion.div {...rise(0.45)} className="hidden justify-self-center lg:block">
          <Movers stocks={stocks} />
        </motion.div>
      </div>

      <Tape stocks={stocks} still={still} />
    </section>
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
    const at = [1100, 2300, 3500, 4500];
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
      transition={{ duration: 1.1, ease: EASE, delay: 0.15 }}
      className="relative mx-auto"
    >
      <Phone className="h-[580px] lg:h-[min(calc(70*var(--uvh)),680px)]">
        <div className="relative flex h-full flex-col bg-black text-white">
          <BinanceWallpaper />

          <div className="relative flex items-center justify-end gap-1.5 px-6 pt-4">
            <Signal size={14} strokeWidth={2.6} />
            <Wifi size={14} strokeWidth={2.6} />
            <BatteryFull size={18} strokeWidth={2} />
          </div>

          <div className="relative mt-5 flex flex-col items-center">
            <Lock size={15} strokeWidth={2.6} className="text-white/90" />
            <LockDate />
            <p className="text-[76px] font-semibold leading-[0.95] tracking-[-0.04em] lg:text-[84px]">3:04</p>
          </div>

          {/* The two newest in full; older ones fold into a stack behind, as iOS does */}
          <div className="relative mt-auto flex flex-col gap-2 px-2.5 pb-3">
            <AnimatePresence initial={false}>
              {shown.slice(0, 2).map((n) => (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: -18, scale: 0.94, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <Notification text={n.text} />
                </motion.div>
              ))}
            </AnimatePresence>
            <motion.span
              layout
              initial={false}
              animate={{ opacity: shown.length > 2 ? 1 : 0, height: shown.length > 2 ? 10 : 0 }}
              className="-mt-2 mx-3 block rounded-b-[16px] bg-[rgb(44_44_48/0.6)] backdrop-blur-xl"
            />
          </div>

          <div className="relative flex items-center justify-between px-10 pb-3">
            <span className="grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur-md">
              <Flashlight size={18} strokeWidth={2.2} />
            </span>
            <span className="grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur-md">
              <Camera size={18} strokeWidth={2.2} />
            </span>
          </div>
          <span className="relative mx-auto mb-2 h-[5px] w-[38%] rounded-full bg-white/90" />
        </div>
      </Phone>

      {/* The reply going out, off the phone's right edge */}
      <AnimatePresence>
        {replied && (
          <motion.div
            initial={still ? false : { opacity: 0, scale: 0.6, x: -20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="absolute -right-10 top-[40%] flex origin-bottom-left flex-col items-end sm:-right-24"
          >
            <p className="rounded-[20px] rounded-br-[6px] bg-[#0A84FF] px-4 py-2 text-[17px] font-medium text-white shadow-[0_12px_30px_-10px_rgb(10_132_255/0.6)]">yes</p>
            <p className="mt-1 whitespace-nowrap text-[11px] font-medium text-text-muted max-sm:hidden">Read 3:04 AM</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Black, with the Binance mark in its own yellow and a low glow behind it. */
function BinanceWallpaper() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div className="absolute left-1/2 top-[42%] size-[120%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgb(240_185_11/0.22),rgb(240_185_11/0.05)_45%,transparent_70%)]" />
      <svg viewBox="0 0 24 24" className="absolute left-1/2 top-[42%] w-[24%] -translate-x-1/2 -translate-y-1/2" aria-hidden>
        <path
          fill="#F0B90B"
          d="M16.624 13.9202l2.7175 2.7154-7.353 7.353-7.353-7.352 2.7175-2.7164 4.6355 4.6595 4.6356-4.6595zm4.6366-4.6366L24 12l-2.7154 2.7164L18.5682 12l2.6924-2.7164zm-9.272.001l2.7163 2.6914-2.7164 2.7174v-.001L9.2721 12l2.7164-2.7154zm-9.2722-.001L5.4088 12l-2.6914 2.6924L0 12l2.7164-2.7164zM11.9885.0115l7.353 7.329-2.7174 2.7154-4.6356-4.6356-4.6355 4.6595-2.7174-2.7154 7.353-7.353z"
        />
      </svg>
    </div>
  );
}

function LockDate() {
  const [label, setLabel] = useState(" ");
  useEffect(() => setLabel(new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date())), []);
  return <p className="mt-2 text-[17px] font-semibold leading-tight text-white/90">{label}</p>;
}

/** An iOS notification in the dark material. */
function Notification({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5 rounded-[22px] bg-[rgb(44_44_48/0.78)] p-3 text-white shadow-[0_8px_24px_-12px_rgb(0_0_0/0.6)] backdrop-blur-xl backdrop-saturate-150">
      <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-[#6C47FF]">
        <Wordmark size={11} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2 text-[14px] font-semibold leading-tight">
          {APP_NAME}
          <span className="text-[12px] font-normal text-white/55">now</span>
        </p>
        <p className="mt-0.5 text-[14px] leading-[1.3] text-white/90">{text}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Moving now: the biggest 24h moves in the real list.                                        */

function Movers({ stocks }: { stocks: Stocks }) {
  const priced = stocks.list.filter((s) => s.price !== null && s.change !== null);
  const rows = priced.length
    ? [...priced].sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!)).slice(0, 5)
    : ["NVDA", "TSLA", "AAPL", "META", "MSFT"].map((t, i) => stocks.pick(t, i));
  return (
    <div className="w-[320px] rounded-[28px] border border-border bg-bg p-5 shadow-[0_2px_4px_rgb(0_0_0/0.03),0_30px_60px_-30px_rgb(0_0_0/0.22)]">
      <p className="flex items-center justify-between px-1 text-[15px] font-semibold text-text">
        Moving now
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-muted">
          <span className="size-1.5 animate-live-dot rounded-full bg-up" />
          Live
        </span>
      </p>
      <ul className="mt-3">
        {rows.map((s) => (
          <li key={s.ticker} className="flex h-[58px] items-center gap-3 border-t border-border px-1 first:border-t-0">
            <TokenLogo src={s.logo} label={s.ticker} size={34} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-tight text-text">{s.ticker}</p>
              <p className="truncate text-[12px] leading-tight text-text-muted">{s.name}</p>
            </div>
            {s.price !== null && (
              <div className="text-right">
                <p className="tnum text-[15px] font-medium leading-tight text-text">{fmtPrice(s.price)}</p>
                <Change value={s.change} className="text-[12px]" />
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-[13px] leading-snug text-text-muted">24h moves, onchain. Buy or sell any of them at any hour.</p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* The tape: the real list, running.                                                          */

const TAPE_FALLBACK = ["NVDA", "TSLA", "AAPL", "SPY", "META", "MSFT", "AMZN", "GOOGL", "QQQ", "COIN"];

function Tape({ stocks, still }: { stocks: Stocks; still: boolean }) {
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
