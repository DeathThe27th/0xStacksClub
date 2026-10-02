"use client";

import { motion, useReducedMotion, useTransform, type MotionValue } from "framer-motion";
import { MessageCircle, Minus, Plus, UserPlus, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Change } from "@/components/ui/Change";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/cn";
import { APP_NAME, BOT_TRADE_CAP_DEFAULT_USD } from "@/lib/constants";
import { useThemeLock } from "@/lib/client/theme";
import { price as fmtPrice } from "@/lib/format";
import { nyseStatus, until, useNow } from "./clock";
import { useLandingStocks } from "./data";
import { Hero } from "./Hero";
import { LINKS, Phone, StartButton, type Start } from "./parts";
import { useScrollProgress } from "./scroll";
import { Week, WeekKey } from "./Week";

export type { Start };

/**
 * Public landing, framed around the hours Wall Street is shut, always in the light theme. One
 * continuous scroll: the promise beside a phone where the texting assistant's messages arrive on
 * the lock screen, the four verbs stack up, a violet panel where a text conversation plays out,
 * the real stock list, a dial of the week's 168 hours, baskets, the close and the footer. With
 * reduced motion every section renders finished.
 */
export function Landing(props: Start & { notice?: React.ReactNode }) {
  useThemeLock("light");
  const still = !!useReducedMotion();
  const stocks = useLandingStocks();
  return (
    <main className="overflow-x-clip bg-bg text-text">
      <Hero start={props} stocks={stocks} still={still} />
      <Verbs still={still} />
      <TextPanel stocks={stocks} still={still} />
      <Market stocks={stocks} still={still} start={props} />
      <Hours still={still} />
      <Baskets stocks={stocks} still={still} />
      <Close start={props} />
      <Footer start={props} />
      <PillNav start={props} notice={props.notice} />
    </main>
  );
}

type Stocks = ReturnType<typeof useLandingStocks>;

/* ------------------------------------------------------------------------------------------ */
/* Verbs: four words that stack up one by one.                                                */

const VERBS: { word: string; line: string; icon: LucideIcon; tile: string; ink: string }[] = [
  { word: "Buy", line: "Nvidia at midnight", icon: Plus, tile: "bg-up", ink: "text-up" },
  { word: "Sell", line: "Back to USDT, any hour", icon: Minus, tile: "bg-down", ink: "text-down" },
  { word: "Text", line: "From iMessage, from bed", icon: MessageCircle, tile: "bg-primary", ink: "text-link" },
  { word: "Follow", line: "The night owls worth following", icon: UserPlus, tile: "bg-warn", ink: "text-warn" },
];

function Verbs({ still }: { still: boolean }) {
  const ref = useRef<HTMLElement>(null);
    const p = useScrollProgress(ref, 0.75, 1);
  return (
    <section ref={ref} aria-label="What you can do" className={still ? "py-24" : "relative h-[220svh]"}>
      <div className={cn("grid place-items-center", !still && "sticky top-0 h-[calc(100svh/var(--app-zoom))]")}>
        <ul className="flex flex-col gap-1 lg:gap-2">
          {VERBS.map((v, i) => (
            <Verb key={v.word} v={v} p={p} at={0.02 + i * 0.16} still={still} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function Verb({ v, p, at, still }: { v: (typeof VERBS)[number]; p: MotionValue<number>; at: number; still: boolean }) {
  const opacity = useTransform(p, [at, at + 0.1], [0, 1]);
  const y = useTransform(p, [at, at + 0.12], [48, 0]);
  const Icon = v.icon;
  return (
    <motion.li style={still ? undefined : { opacity, y }} className="flex items-center gap-[0.22em] text-[clamp(64px,17vw,150px)] font-sans font-semibold leading-[1.02] tracking-[-0.04em]">
      <span className={cn("grid size-[0.62em] shrink-0 place-items-center rounded-[0.17em] text-bg", v.tile)}>
        <Icon className="size-[0.42em]" strokeWidth={3} aria-hidden />
      </span>
      <span className={cn("sm:min-w-[3.3em]", v.ink)}>{v.word}</span>
      <span className="hidden max-w-[12ch] font-sans text-[17px] font-medium leading-tight tracking-normal text-text-muted sm:block">{v.line}</span>
    </motion.li>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Text panel: the violet field rises; a bubble grows into a phone and the chat plays out.      */

function TextPanel({ stocks, still }: { stocks: Stocks; still: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const p = useScrollProgress(ref);
  const phoneScale = useTransform(p, [0, 0.2], [0.6, 1]);
  const phoneY = useTransform(p, [0, 0.2], ["12svh", "0svh"]);
  const s = stocks.pick("NVDA", 0);
  const t = s.ticker;
  const chat: { out?: boolean; text: string }[] = [
    { out: true, text: `${t.toLowerCase()} price?` },
    {
      text:
        s.price !== null
          ? `${t} is at ${fmtPrice(s.price)}, ${s.change !== null && s.change < 0 ? "down" : "up"} ${Math.abs(s.change ?? 0).toFixed(2)}% in 24h.`
          : `Here's ${t}: the price, today's move and the latest news.`,
    },
    { out: true, text: `buy $20 of ${t.toLowerCase()}` },
    { text: `Buy $20 of ${t}? Fee $0.20. Reply YES to buy, or NO to cancel.` },
    { out: true, text: "yes" },
    { text: `Done. Bought $20 of ${t}.` },
  ];
  return (
    <section id="text" ref={ref} aria-labelledby="text-title" className={cn("scroll-mt-0 bg-primary text-on-primary", !still && "relative h-[330svh]")}>
      <div className={cn("mx-auto grid max-w-[1180px] items-center gap-8 px-gutter lg:grid-cols-[1fr_auto_1fr] lg:gap-14 lg:px-8", still ? "py-24" : "sticky top-0 h-[calc(100svh/var(--app-zoom))] content-center py-6")}>
        <div className="text-center lg:text-left">
          <h2 id="text-title" className="font-sans text-[clamp(44px,11vw,104px)] font-semibold leading-[0.9] tracking-[-0.04em]">
            Or just text&nbsp;it.
          </h2>
          <p className="mx-auto mt-4 max-w-[34ch] text-[16px] leading-snug text-on-primary/85 lg:mx-0 lg:mt-6 lg:text-[19px]">
            Ask the {APP_NAME} assistant on iMessage for a price, the news or your portfolio. It&apos;s up when you are.
          </p>
        </div>
        <motion.div style={still ? undefined : { scale: phoneScale, y: phoneY }} className="mx-auto origin-bottom">
          <Phone className="h-[min(62svh,600px)] lg:h-[min(80svh,640px)]">
            <div className="flex h-full flex-col bg-black pt-10 text-white">
              <div className="flex flex-col items-center gap-1 border-b border-white/10 pb-3">
                <span className="grid size-11 place-items-center rounded-full bg-[#6C47FF]">
                  <Wordmark size={14} className="text-white" />
                </span>
                <span className="text-[12px] text-white/70">{APP_NAME}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-hidden px-3 pt-4">
                {chat.map((m, i) => (
                  <ChatLine key={i} p={p} at={0.2 + i * 0.1} still={still} out={m.out}>
                    {m.text}
                  </ChatLine>
                ))}
              </div>
            </div>
          </Phone>
        </motion.div>
        <div className="hidden lg:block">
          <p className="max-w-[30ch] text-[19px] leading-snug">
            Turn on Trade by text and a YES is all a buy or a sell takes.
          </p>
          <p className="mt-4 max-w-[34ch] text-[15px] leading-snug text-on-primary/80">
            Off until you switch it on. Buys stay inside limits you set, ${BOT_TRADE_CAP_DEFAULT_USD} each to start, and the money never leaves your own wallet.
          </p>
        </div>
      </div>
    </section>
  );
}

function ChatLine({ p, at, still, out, children }: { p: MotionValue<number>; at: number; still: boolean; out?: boolean; children: React.ReactNode }) {
  const opacity = useTransform(p, [at, at + 0.05], [0, 1]);
  const y = useTransform(p, [at, at + 0.06], [14, 0]);
  const scale = useTransform(p, [at, at + 0.06], [0.92, 1]);
  return (
    <motion.div style={still ? undefined : { opacity, y, scale }} className={cn("flex", out ? "origin-bottom-right justify-end" : "origin-bottom-left")}>
      <p className={cn("max-w-[78%] rounded-[18px] px-3 py-[7px] text-[14px] leading-[1.3]", out ? "rounded-br-[5px] bg-[#0A84FF]" : "rounded-bl-[5px] bg-[#26262A]")}>{children}</p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Market: the real list, scrolling inside the app on a phone.                                  */

function Market({ stocks, still, start }: { stocks: Stocks; still: boolean; start: Start }) {
  const ref = useRef<HTMLElement>(null);
  const p = useScrollProgress(ref, 1, 0);
  const listY = useTransform(p, [0.2, 0.85], [0, -260]);
  const rows = stocks.list.length ? stocks.list : ["NVDA", "TSLA", "AAPL", "SPY", "META", "MSFT"].map((t, i) => stocks.pick(t, i));
  return (
    <section id="stocks" ref={ref} aria-labelledby="stocks-title" className="mx-auto grid max-w-[1180px] items-center gap-14 px-gutter py-28 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:py-40">
      <div>
        <h2 id="stocks-title" className="font-sans text-[clamp(44px,10vw,92px)] font-semibold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]">
          The big names, after hours.
        </h2>
        <p className="mt-6 max-w-[40ch] text-[17px] leading-relaxed text-text-muted lg:text-[19px]">
          Tokenized stocks from bStocks and Ondo on BNB Chain. Deposit USDT, buy what you like, sell back to USDT, on your schedule rather than the exchange&apos;s. A 1% fee on the way in and 1% on the way out.
        </p>
        <StartButton start={start} className="mt-8" />
      </div>
      <div className="relative mx-auto">
        <Phone className="h-[min(78svh,620px)]">
          <div className="flex h-full flex-col bg-bg pt-11 text-text">
            <div className="px-4">
              <Wordmark size={20} />
              <div className="mt-4 flex gap-5 border-b border-border text-[14px]">
                <span className="pb-2 text-text-muted">Watchlist</span>
                <span className="border-b-2 border-primary pb-2 font-semibold">Stocks</span>
                <span className="pb-2 text-text-muted">Baskets</span>
              </div>
            </div>
            <div className="relative flex-1 overflow-hidden">
              <motion.ul style={still ? undefined : { y: listY }} className="px-4 pt-2">
                {[...rows, ...rows].slice(0, 14).map((s, i) => (
                  <li key={`${s.ticker}-${i}`} className="flex h-[54px] items-center gap-3">
                    <TokenLogo src={s.logo} label={s.ticker} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold leading-tight">{s.ticker}</p>
                      <p className="truncate text-[12px] leading-tight text-text-muted">{s.name}</p>
                    </div>
                    {s.price !== null && (
                      <div className="text-right">
                        <p className="tnum text-[14px] font-medium leading-tight">{fmtPrice(s.price)}</p>
                        <Change value={s.change} className="text-[11px]" />
                      </div>
                    )}
                  </li>
                ))}
              </motion.ul>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />
            </div>
          </div>
        </Phone>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Hours: the week as a dial. Wall Street's 32½ hours light up, then the rest of the 168.       */

function Hours({ still }: { still: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const p = useScrollProgress(ref);
  return (
    <section
      id="hours"
      ref={ref}
      aria-labelledby="hours-title"
      className={cn("[--uvh:calc(1svh/var(--app-zoom))]", !still && "relative h-[calc(300*var(--uvh))]")}
    >
      <div
        className={cn(
          "mx-auto grid max-w-[1180px] items-center gap-8 px-gutter lg:grid-cols-[1fr_auto] lg:gap-16 lg:px-8",
          still ? "py-24" : "sticky top-0 h-[calc(100*var(--uvh))] content-center",
        )}
      >
        <div className="text-center lg:text-left">
          <h2 id="hours-title" className="font-sans text-[clamp(40px,9vw,92px)] font-semibold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]">
            Markets close. Onchain doesn&apos;t.
          </h2>
          <p className="mx-auto mt-5 max-w-[38ch] text-[16px] leading-snug text-text-muted lg:mx-0 lg:mt-6 lg:text-[19px]">
            Wall Street keeps banker&apos;s hours. Tokenized stocks live on BNB Chain, which never clocks out.
          </p>
          <div className="mt-6 hidden lg:block">
            <WeekKey />
            <p className="mt-6 max-w-[46ch] text-[13px] leading-5 text-text-dim">
              Most stocks trade onchain at any hour. A few pause while their home market is closed, and the app says so before any money moves.
            </p>
          </div>
        </div>
        <Week progress={p} still={still} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Baskets and people: the side features, one card turning as you scroll.                      */

function Baskets({ stocks, still }: { stocks: Stocks; still: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const p = useScrollProgress(ref, 1, 0);
  const rotateY = useTransform(p, [0.1, 0.9], [-28, 22]);
  const rotateZ = useTransform(p, [0.1, 0.9], [-9, 5]);
  const y = useTransform(p, [0.1, 0.9], [60, -40]);
  const recipe = [
    { s: stocks.pick("NVDA", 0), w: 40 },
    { s: stocks.pick("MSFT", 2), w: 35 },
    { s: stocks.pick("META", 3), w: 25 },
  ];
  return (
    <section id="baskets" ref={ref} aria-labelledby="baskets-title" className="mx-auto grid max-w-[1180px] items-center gap-16 px-gutter pb-28 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:pb-40">
      <div className="grid place-items-center [perspective:1100px]">
        <motion.div
          aria-hidden
          style={still ? undefined : { rotateY, rotateZ, y }}
          className="w-[min(78vw,330px)] rounded-[28px] border border-border bg-surface p-6 shadow-[0_50px_90px_-40px_rgb(var(--primary)/0.55)]"
        >
          <span className="flex -space-x-3">
            {recipe.map(({ s }) => (
              <TokenLogo key={s.ticker} src={s.logo} label={s.ticker} size={56} className="ring-4 ring-surface" />
            ))}
          </span>
          <p className="mt-6 font-sans text-[30px] font-semibold leading-none tracking-[-0.03em]">Your basket</p>
          <p className="mt-1 text-[14px] text-text-muted">3 stocks, one buy</p>
          <ul className="mt-6 space-y-3">
            {recipe.map(({ s, w }) => (
              <li key={s.ticker} className="text-[14px]">
                <span className="flex justify-between">
                  <span className="font-semibold">{s.ticker}</span>
                  <span className="tnum text-text-muted">{w}%</span>
                </span>
                <span className="mt-1.5 block h-1.5 rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${w}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
      <div>
        <h2 id="baskets-title" className="font-sans text-[clamp(40px,8vw,76px)] font-semibold leading-[0.95] tracking-[-0.04em] [text-wrap:balance]">
          Baskets, if you want them.
        </h2>
        <p className="mt-6 max-w-[40ch] text-[17px] leading-relaxed text-text-muted lg:text-[19px]">
          Put 2 to 5 stocks in one basket and buy them in one go, or buy into someone else&apos;s. Whoever made it gets a quarter of the 1% fee.
        </p>
        <h3 className="mt-12 text-[22px] font-semibold tracking-[-0.01em]">Trade in company.</h3>
        <p className="mt-2 max-w-[40ch] text-[17px] leading-relaxed text-text-muted">
          See everyone&apos;s latest trades on {APP_NAME} and follow the people worth following.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Close, footer and nav.                                                                      */

/** The close: how long until Wall Street opens (or shuts), live, and the one action. */
function Close({ start }: { start: Start }) {
  const now = useNow(30_000);
  const s = now ? nyseStatus(now) : null;
  return (
    <section aria-labelledby="close-title" className="mx-auto max-w-[1240px] px-gutter pb-24 pt-8 text-center lg:px-8 lg:pb-36">
      <h2 id="close-title" className="mx-auto max-w-[16ch] font-sans text-[clamp(44px,9vw,104px)] font-semibold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]">
        <span className="block text-text-muted">
          {!s || !now ? "Wall Street keeps hours." : s.open ? `Wall Street shuts in ${until(now, s.next)}.` : `Wall Street opens in ${until(now, s.next)}.`}
        </span>
        <span className="block">{s?.open ? "You don’t have to stop." : "You don’t have to wait."}</span>
      </h2>
      <StartButton start={start} className="mt-10 lg:mt-12" />
    </section>
  );
}

function Footer({ start }: { start: Start }) {
  return (
    <footer id="footer" className="relative overflow-hidden border-t border-border bg-surface">
      <div className="mx-auto max-w-[1240px] px-gutter pt-14 lg:px-8 lg:pt-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Wordmark size={30} />
            <p className="mt-3 max-w-[30ch] text-[16px] leading-snug text-text-muted">Tokenized stocks on BNB Chain, in the app or by text. Any hour.</p>
          </div>
          <nav aria-label="Footer">
            <p className="text-[14px] font-semibold text-text">On this page</p>
            <ul className="mt-4 space-y-3">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-[15px] text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="text-[14px] font-semibold text-text">Start</p>
            <p className="mt-4 max-w-[26ch] text-[15px] leading-snug text-text-muted">Sign in with email or a wallet, deposit USDT and buy from $1.</p>
            <StartButton start={start} small className="mt-5" />
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-border pt-6 text-[13px] leading-5 text-text-muted lg:mt-20 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <p className="max-w-[78ch]">
            Tokenized stocks on BNB Chain from bStocks and Ondo. Tokens are issued by those providers and aren&apos;t direct shares. Trading isn&apos;t available in the US, UK, Canada or the Netherlands.
          </p>
          <p className="shrink-0">
            &copy; {new Date().getFullYear()} {APP_NAME}
          </p>
        </div>
      </div>

      <FitWordmark />
    </footer>
  );
}

/**
 * The wordmark at the footer's full width, its lower part running off the bottom edge. Sized by
 * measuring the set word, since glyph widths (and the desktop zoom) make a fixed ratio unreliable.
 */
function FitWordmark() {
  const box = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => {
      if (!box.current || !word.current) return;
      const w = word.current.offsetWidth;
      if (w) setSize((cur) => ((cur ?? 100) * box.current!.clientWidth) / w);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, []);
  return (
    <div aria-hidden className="mx-auto mt-10 max-w-[1240px] px-gutter lg:px-8">
      <div ref={box} className="overflow-hidden" style={{ height: size ? size * 0.64 : 0 }}>
        <span ref={word} className="inline-block" style={{ visibility: size ? "visible" : "hidden" }}>
          <Wordmark size={size ?? 100} className="block text-primary" />
        </span>
      </div>
    </div>
  );
}

/** The floating pill: shows once the hero's own header has scrolled away, and steps aside for the footer. */
function PillNav({ start, notice }: { start: Start; notice?: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("top");
    const footer = document.getElementById("footer");
    if (!hero || !footer) return;
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target, e.isIntersecting));
      setShown(!seen.get(hero) && !seen.get(footer));
    });
    io.observe(hero);
    io.observe(footer);
    return () => io.disconnect();
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-gutter" style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}>
      {notice}
      <nav
        aria-label="Main"
        aria-hidden={!shown}
        inert={!shown}
        className={cn(
          "flex items-center gap-1 rounded-full border border-border bg-bg/85 p-1.5 pl-5 shadow-[0_2px_6px_rgb(0_0_0/0.05),0_16px_40px_-16px_rgb(0_0_0/var(--nav-shadow))] backdrop-blur-xl transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          shown ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        )}
      >
        <a href="#top" aria-label={`${APP_NAME}, back to top`} className="mr-2 rounded-full">
          <Wordmark size={21} />
        </a>
        <ul className="hidden items-center sm:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="grid h-10 place-items-center rounded-full px-3.5 text-[15px] font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <StartButton start={start} small className="ml-1" />
      </nav>
    </div>
  );
}
