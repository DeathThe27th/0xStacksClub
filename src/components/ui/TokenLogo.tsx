/* eslint-disable @next/next/no-img-element */
"use client";

import { Blocks, Cloud, Cpu, Crown, Earth, MemoryStick, Rocket, Zap, type LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { curatedBasket, type CuratedBasket } from "@/lib/baskets";
import { cn } from "@/lib/cn";

const BASKET_ICONS: Record<CuratedBasket["icon"], LucideIcon> = {
  cpu: Cpu,
  memory: MemoryStick,
  earth: Earth,
  cloud: Cloud,
  zap: Zap,
  crown: Crown,
  blocks: Blocks,
  rocket: Rocket,
};

/**
 * Round provider token logo, with a ticker fallback. Pass `basket` (the basket's ticker) for a
 * basket: it shows the logos of the stocks inside it, sliding up one after another.
 */
export function TokenLogo({
  src,
  label,
  size = 48,
  className,
  basket,
  logos,
}: {
  src?: string | null;
  label: string;
  size?: number;
  className?: string;
  basket?: string | null;
  /** The basket's stock logos, when the caller already has them. Otherwise they're looked up by ticker. */
  logos?: (string | null)[];
}) {
  if (basket) return <BasketLogo ticker={basket} logos={logos} src={src} label={label} size={size} className={className} />;
  return <PlainLogo src={src} label={label} size={size} className={className} />;
}

function PlainLogo({ src, label, size, className }: { src?: string | null; label: string; size: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={cn("shrink-0 rounded-full bg-surface object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full border border-border bg-surface font-semibold text-text-muted", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.26) }}
    >
      {label.slice(0, 4)}
    </span>
  );
}

/** Logos of every launched basket's stocks, by basket ticker. One shared request for the whole app. */
function useBasketLogos(enabled: boolean) {
  return useQuery({
    queryKey: ["basket-logos"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch("/api/stacks?filter=newest");
      if (!res.ok) throw new Error("Couldn't load baskets");
      const data = (await res.json()) as { items: { ticker: string; componentLogos?: (string | null)[] }[] };
      return new Map(data.items.map((s) => [s.ticker, (s.componentLogos ?? []).filter((l): l is string => !!l)]));
    },
  });
}

const CYCLE_MS = 2600;

/**
 * A basket's picture is what's in it: each stock's logo slides up and gives way to the next. A
 * picture is optional when creating a basket; if the creator uploaded one, that is shown instead.
 * Until the logos are known it falls back to the curated badge or a ticker label.
 */
function BasketLogo({ ticker, logos, src, label, size, className }: { ticker: string; logos?: (string | null)[]; src?: string | null; label: string; size: number; className?: string }) {
  const given = logos?.filter((l): l is string => !!l);
  const looked = useBasketLogos(!given?.length);
  const list = given?.length ? given : (looked.data?.get(ticker) ?? []);
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const n = list.length;
  useEffect(() => {
    if (n < 2 || reduce) return;
    // Start each basket at its own point in the cycle so a list doesn't tick in unison.
    const offset = ([...ticker].reduce((h, c) => h + c.charCodeAt(0), 0) % 8) * 300;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setI((x) => x + 1);
      interval = setInterval(() => setI((x) => x + 1), CYCLE_MS);
    }, CYCLE_MS - offset);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [n, reduce, ticker]);

  const curated = curatedBasket(ticker);
  // A creator's own picture wins. Curated baskets only have a generated cover, so they cycle.
  if (src && !curated) return <PlainLogo src={src} label={label} size={size} className={className} />;
  if (!n) {
    if (curated) return <BasketBadge b={curated} size={size} className={className} />;
    return <PlainLogo src={src} label={label} size={size} className={className} />;
  }
  const current = list[i % n]!;
  return (
    <span aria-hidden className={cn("relative block shrink-0 overflow-hidden rounded-full bg-surface", className)} style={{ width: size, height: size }}>
      <AnimatePresence initial={false}>
        <motion.img
          key={`${i % n}-${current}`}
          src={current}
          alt=""
          width={size}
          height={size}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      </AnimatePresence>
    </span>
  );
}

/** Gradient badge with the basket's glyph, lit from the top left. */
function BasketBadge({ b, size, className }: { b: CuratedBasket; size: number; className?: string }) {
  const Icon = BASKET_ICONS[b.icon];
  return (
    <span
      aria-hidden
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full text-white", className)}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(120% 120% at 25% 15%, ${b.colors[0]} 0%, ${b.colors[0]} 22%, ${b.colors[1]} 100%)`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 0 0 1px rgba(255,255,255,0.1)",
      }}
    >
      <span className="absolute inset-0" style={{ background: "radial-gradient(60% 45% at 30% 10%, rgba(255,255,255,0.35), transparent 70%)" }} />
      <Icon size={Math.round(size * 0.5)} strokeWidth={size >= 40 ? 1.75 : 2.25} className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
    </span>
  );
}
