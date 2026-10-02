"use client";

import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { APP_NAME } from "@/lib/constants";
import { useNow } from "./clock";
import { CloudShader } from "./CloudShader";
import { NyseCountdown } from "./Countdown";
import { LINKS, StartButton, type Start } from "./parts";

/*
 * Hero. The page's own header, then the promise beside Wall Street's clock: a large ring that
 * ticks down to the next NYSE open or close, all over a drifting cloud sky (a WebGL shader) in
 * the violet's own family, periwinkle easing to lilac, that fades into the page at the bottom. With reduced motion it renders finished and the clouds hold.
 *
 * Heights are in viewport units divided by --app-zoom (desktop renders at 80%), as --uvh.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero({ start, still }: { start: Start; still: boolean }) {
  const now = useNow();
  const rise = (delay: number) =>
    still ? {} : { initial: { opacity: 0, y: 32 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1, ease: EASE, delay } };
  return (
    <section id="top" aria-labelledby="hero-title" className="relative isolate overflow-hidden [--uvh:calc(1svh/var(--app-zoom))]">
      <div aria-hidden className="absolute inset-0 -z-10">
        <CloudShader className="absolute inset-0 min-h-0" count={5} speed={0.8} cloudColor="#ffffff" skyTopColor="#8b9ff0" skyBottomColor="#f0eefc" />
        <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-b from-transparent to-bg" />
      </div>
      <header className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-gutter lg:h-20 lg:px-8">
        <a href="#top" aria-label={`${APP_NAME}, top of the page`} className="rounded-md text-text">
          <Wordmark size={26} />
        </a>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="grid h-10 place-items-center rounded-full px-4 text-[15px] font-medium text-text/75 transition-colors hover:bg-white/50 hover:text-text">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <StartButton start={start} small />
      </header>

      <div className="mx-auto grid max-w-[1320px] items-center gap-14 px-gutter pb-20 pt-10 lg:min-h-[calc(100*var(--uvh)-80px)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:pb-16 lg:pt-0">
        <motion.div {...rise(0)} className="max-lg:text-center">
          <h1 id="hero-title" className="text-[clamp(46px,10.5vw,112px)] font-semibold leading-[0.95] tracking-[-0.04em] [text-wrap:balance] max-lg:mx-auto max-lg:max-w-[12ch]">
            <span className="block">Wall&nbsp;Street keeps&nbsp;hours.</span>
            <span className="block text-primary">You don’t.</span>
          </h1>
          <p className="mt-6 max-w-[40ch] text-[17px] leading-[1.45] text-text/75 max-lg:mx-auto lg:mt-8 lg:text-[21px]">
            Nvidia, Tesla, Apple and more as tokens on BNB Chain. Buy after the bell, sell on a Sunday, or just text it at 3am.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 max-lg:justify-center lg:mt-10">
            <StartButton start={start} />
            <a href="#text" className="group inline-flex h-14 items-center gap-2 rounded-full px-2 text-[17px] font-semibold text-text underline-offset-4 hover:underline">
              See it by text
              <ArrowDown size={18} strokeWidth={2.4} className="transition-transform group-hover:translate-y-0.5" aria-hidden />
            </a>
          </div>
        </motion.div>

        <motion.div {...rise(0.2)} className="mx-auto w-[min(84vw,360px)] lg:w-[min(100%,calc(66*var(--uvh)),600px)]">
          <NyseCountdown now={now} />
        </motion.div>
      </div>
    </section>
  );
}
